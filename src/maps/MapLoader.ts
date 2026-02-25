import { getStagePixelSize, type ViewportSize } from "../config/GameConfig";
import { getAllGlobalFallbackAssetPaths } from "../assets/GlobalAssetFallbacks";
import type {
  DistractionConfig,
  DistractionType,
  FestivalMap,
  NormalizedPoint,
  SpawnPointConfig,
  StageConfig
} from "../config/FestivalConfig";

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ResolvedStage extends StageConfig {
  screenPosition: ScreenPoint;
  pixelWidth: number;
  pixelHeight: number;
}

export interface ResolvedSpawnPoint extends SpawnPointConfig {
  screenPosition: ScreenPoint;
  directionVector: ScreenPoint;
}

export interface ResolvedDistraction extends DistractionConfig {
  screenPosition: ScreenPoint;
  pixelRadius: number;
}

export interface ResolvedFestivalLayout {
  map: FestivalMap;
  viewport: ViewportSize;
  stages: ResolvedStage[];
  spawnPoints: ResolvedSpawnPoint[];
  distractions: ResolvedDistraction[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertNormalizedNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a normalized number between 0 and 1`);
  }
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
}

function assertIntegerInRange(
  value: number,
  min: number,
  max: number,
  name: string
): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
}

function assertNormalizedPoint(value: NormalizedPoint, name: string): void {
  assertNormalizedNumber(value.x, `${name}.x`);
  assertNormalizedNumber(value.y, `${name}.y`);
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

export function parseFestivalMapData(data: unknown): FestivalMap {
  if (!isObject(data)) {
    throw new Error("FestivalMap payload must be an object");
  }

  const parsed = data as unknown as FestivalMap;
  requireString(parsed.id, "id");
  requireString(parsed.name, "name");
  requireString(parsed.description, "description");
  if (parsed.themeId !== undefined) {
    requireString(parsed.themeId, "themeId");
  }
  if (parsed.introScreen !== undefined) {
    requireString(parsed.introScreen, "introScreen");
  }
  if (parsed.introPresentation !== undefined) {
    if (!isObject(parsed.introPresentation)) {
      throw new Error("introPresentation must be an object");
    }
    const introPresentation = parsed.introPresentation as Record<string, unknown>;
    if (introPresentation.fitMode !== undefined) {
      const fitMode = requireString(introPresentation.fitMode, "introPresentation.fitMode");
      if (fitMode !== "cover" && fitMode !== "contain") {
        throw new Error("introPresentation.fitMode must be 'cover' or 'contain'");
      }
    }
    if (introPresentation.focusX !== undefined) {
      assertIntegerInRange(
        Math.round(introPresentation.focusX as number),
        0,
        100,
        "introPresentation.focusX"
      );
    }
    if (introPresentation.focusY !== undefined) {
      assertIntegerInRange(
        Math.round(introPresentation.focusY as number),
        0,
        100,
        "introPresentation.focusY"
      );
    }
    if (introPresentation.zoom !== undefined) {
      assertPositiveFinite(introPresentation.zoom as number, "introPresentation.zoom");
    }
    if (introPresentation.overlayOpacity !== undefined) {
      assertNormalizedNumber(
        introPresentation.overlayOpacity as number,
        "introPresentation.overlayOpacity"
      );
    }
  }
  if (parsed.sessionFx !== undefined) {
    if (!isObject(parsed.sessionFx)) {
      throw new Error("sessionFx must be an object");
    }
    const sessionFx = parsed.sessionFx as Record<string, unknown>;
    for (const key of ["morning", "afternoon", "evening"]) {
      const profile = sessionFx[key];
      if (profile === undefined) {
        continue;
      }
      if (!isObject(profile)) {
        throw new Error(`sessionFx.${key} must be an object`);
      }
      const candidate = profile as Record<string, unknown>;
      if (candidate.overlayColor !== undefined) {
        requireString(candidate.overlayColor, `sessionFx.${key}.overlayColor`);
      }
      if (candidate.particleColor !== undefined) {
        requireString(candidate.particleColor, `sessionFx.${key}.particleColor`);
      }
      if (candidate.overlayOpacity !== undefined) {
        if (
          !Number.isFinite(candidate.overlayOpacity as number) ||
          (candidate.overlayOpacity as number) < 0 ||
          (candidate.overlayOpacity as number) > 0.6
        ) {
          throw new Error(`sessionFx.${key}.overlayOpacity must be between 0 and 0.6`);
        }
      }
      if (candidate.particleCount !== undefined) {
        assertIntegerInRange(
          candidate.particleCount as number,
          0,
          80,
          `sessionFx.${key}.particleCount`
        );
      }
      if (candidate.particleSpeed !== undefined) {
        if (
          !Number.isFinite(candidate.particleSpeed as number) ||
          (candidate.particleSpeed as number) <= 0
        ) {
          throw new Error(`sessionFx.${key}.particleSpeed must be a positive number`);
        }
      }
      if (candidate.stageGlow !== undefined) {
        if (
          !Number.isFinite(candidate.stageGlow as number) ||
          (candidate.stageGlow as number) < 0 ||
          (candidate.stageGlow as number) > 1
        ) {
          throw new Error(`sessionFx.${key}.stageGlow must be between 0 and 1`);
        }
      }
    }
  }
  if (parsed.schedule !== undefined) {
    if (!isObject(parsed.schedule)) {
      throw new Error("schedule must be an object");
    }
    const schedule = parsed.schedule as Record<string, unknown>;
    if (schedule.days !== undefined) {
      assertIntegerInRange(schedule.days as number, 1, 999, "schedule.days");
    }
    if (schedule.sessionsPerDay !== undefined) {
      assertIntegerInRange(
        schedule.sessionsPerDay as number,
        1,
        12,
        "schedule.sessionsPerDay"
      );
    }
    if (schedule.sessionNames !== undefined) {
      if (
        !Array.isArray(schedule.sessionNames) ||
        schedule.sessionNames.length === 0
      ) {
        throw new Error("schedule.sessionNames must be a non-empty string array");
      }
      for (const [index, name] of schedule.sessionNames.entries()) {
        requireString(name, `schedule.sessionNames[${index}]`);
      }
    }
  }
  requireString(parsed.background, "background");
  assertIntegerInRange(parsed.totalLevels, 1, 999, "totalLevels");

  if (!Array.isArray(parsed.stages) || parsed.stages.length < 2) {
    throw new Error("stages must contain at least 2 stage definitions");
  }

  if (!Array.isArray(parsed.spawnPoints) || parsed.spawnPoints.length < 2) {
    throw new Error("spawnPoints must contain at least 2 spawn definitions");
  }

  if (!Array.isArray(parsed.distractions)) {
    throw new Error("distractions must be an array");
  }
  if (!Array.isArray(parsed.levels) || parsed.levels.length === 0) {
    throw new Error("levels must contain at least 1 level definition");
  }
  if (!isObject(parsed.assets)) {
    throw new Error("assets must be an object");
  }

  const stageIds = new Set<string>();
  const spawnIds = new Set<string>();
  const distractionIds = new Set<string>();
  const levels = new Set<number>();

  parsed.stages.forEach((stage, index) => {
    requireString(stage.id, `stages[${index}].id`);
    if (stageIds.has(stage.id)) {
      throw new Error(`stages[${index}].id must be unique`);
    }
    stageIds.add(stage.id);
    assertNormalizedNumber(stage.snapRadius, `stages[${index}].snapRadius`);
    requireString(stage.sprite, `stages[${index}].sprite`);
    requireString(stage.color, `stages[${index}].color`);
    assertNormalizedPoint(stage.position, `stages[${index}].position`);
  });

  parsed.spawnPoints.forEach((spawn, index) => {
    requireString(spawn.id, `spawnPoints[${index}].id`);
    if (spawnIds.has(spawn.id)) {
      throw new Error(`spawnPoints[${index}].id must be unique`);
    }
    spawnIds.add(spawn.id);
    if (!Number.isFinite(spawn.driftAngle)) {
      throw new Error(`spawnPoints[${index}].driftAngle must be finite`);
    }
    assertNormalizedPoint(spawn.position, `spawnPoints[${index}].position`);
  });

  parsed.distractions.forEach((distraction, index) => {
    requireString(distraction.id, `distractions[${index}].id`);
    if (distractionIds.has(distraction.id)) {
      throw new Error(`distractions[${index}].id must be unique`);
    }
    distractionIds.add(distraction.id);
    assertNormalizedNumber(distraction.radius, `distractions[${index}].radius`);
    assertPositiveFinite(distraction.delay, `distractions[${index}].delay`);
    assertIntegerInRange(
      distraction.appearsAtLevel,
      1,
      parsed.totalLevels,
      `distractions[${index}].appearsAtLevel`
    );
    requireString(distraction.sprite, `distractions[${index}].sprite`);
    assertNormalizedPoint(distraction.position, `distractions[${index}].position`);
  });

  parsed.levels.forEach((level, index) => {
    assertIntegerInRange(
      level.levelNumber,
      1,
      parsed.totalLevels,
      `levels[${index}].levelNumber`
    );
    if (levels.has(level.levelNumber)) {
      throw new Error(`levels[${index}].levelNumber must be unique`);
    }
    levels.add(level.levelNumber);
    assertIntegerInRange(level.totalArtists, 1, 500, `levels[${index}].totalArtists`);
    if (level.targetSets !== undefined) {
      assertIntegerInRange(level.targetSets, 1, 500, `levels[${index}].targetSets`);
      if (level.targetSets > level.totalArtists) {
        throw new Error(`levels[${index}].targetSets cannot exceed totalArtists`);
      }
    }
    assertIntegerInRange(
      level.maxSimultaneous,
      1,
      20,
      `levels[${index}].maxSimultaneous`
    );
    assertPositiveFinite(level.timerRange[0], `levels[${index}].timerRange[0]`);
    assertPositiveFinite(level.timerRange[1], `levels[${index}].timerRange[1]`);
    if (level.timerRange[0] > level.timerRange[1]) {
      throw new Error(`levels[${index}].timerRange must be [min,max]`);
    }
    assertPositiveFinite(level.spawnInterval[0], `levels[${index}].spawnInterval[0]`);
    assertPositiveFinite(level.spawnInterval[1], `levels[${index}].spawnInterval[1]`);
    if (level.spawnInterval[0] > level.spawnInterval[1]) {
      throw new Error(`levels[${index}].spawnInterval must be [min,max]`);
    }
    const { headliner, midtier, newcomer } = level.tierWeights;
    if ([headliner, midtier, newcomer].some((value) => !Number.isFinite(value) || value < 0)) {
      throw new Error(`levels[${index}].tierWeights must be finite and non-negative`);
    }
    if (headliner + midtier + newcomer <= 0) {
      throw new Error(`levels[${index}].tierWeights total must be greater than zero`);
    }
    for (const distractionId of level.activeDistractions) {
      if (!distractionIds.has(distractionId)) {
        throw new Error(
          `levels[${index}].activeDistractions contains unknown id: ${distractionId}`
        );
      }
    }
  });

  if (!Array.isArray(parsed.assets.artists) || parsed.assets.artists.length === 0) {
    throw new Error("assets.artists must contain at least 1 artist sprite config");
  }

  const distractionTypes = new Set<DistractionType>(
    parsed.distractions.map((distraction) => distraction.type)
  );
  parsed.assets.artists.forEach((artist, index) => {
    requireString(artist.id, `assets.artists[${index}].id`);
    requireString(artist.name, `assets.artists[${index}].name`);
    if (
      artist.genre !== undefined &&
      (typeof artist.genre !== "string" || artist.genre.trim().length === 0)
    ) {
      throw new Error(`assets.artists[${index}].genre must be a non-empty string`);
    }
    if (
      artist.debutLevel !== undefined &&
      (!Number.isInteger(artist.debutLevel) || artist.debutLevel < 1)
    ) {
      throw new Error(`assets.artists[${index}].debutLevel must be an integer >= 1`);
    }
    if (
      artist.rotationWeight !== undefined &&
      (!Number.isFinite(artist.rotationWeight) || artist.rotationWeight <= 0)
    ) {
      throw new Error(`assets.artists[${index}].rotationWeight must be > 0`);
    }
    if (
      artist.seed !== undefined &&
      (!Number.isInteger(artist.seed) || artist.seed < 0)
    ) {
      throw new Error(`assets.artists[${index}].seed must be a non-negative integer`);
    }
    if (!Array.isArray(artist.sprites.walk) || artist.sprites.walk.length < 1) {
      throw new Error(`assets.artists[${index}].sprites.walk must contain at least 1 frame`);
    }
    artist.sprites.walk.forEach((path, frameIndex) => {
      requireString(path, `assets.artists[${index}].sprites.walk[${frameIndex}]`);
    });
    if (artist.sprites.idle !== undefined) {
      requireString(artist.sprites.idle, `assets.artists[${index}].sprites.idle`);
    }
    if (artist.sprites.distracted !== undefined) {
      requireString(
        artist.sprites.distracted,
        `assets.artists[${index}].sprites.distracted`
      );
    }
    requireString(
      artist.sprites.performing,
      `assets.artists[${index}].sprites.performing`
    );
    if (artist.performanceAudio) {
      if (artist.performanceAudio.clip !== undefined) {
        requireString(
          artist.performanceAudio.clip,
          `assets.artists[${index}].performanceAudio.clip`
        );
      }
      if (
        artist.performanceAudio.lengthSec !== undefined &&
        (!Number.isFinite(artist.performanceAudio.lengthSec) ||
          artist.performanceAudio.lengthSec <= 0)
      ) {
        throw new Error(
          `assets.artists[${index}].performanceAudio.lengthSec must be > 0`
        );
      }
      if (artist.performanceAudio.promptText !== undefined) {
        requireString(
          artist.performanceAudio.promptText,
          `assets.artists[${index}].performanceAudio.promptText`
        );
      }
    }
  });

  for (const stageId of stageIds) {
    if (!parsed.assets.stageSprites[stageId]) {
      throw new Error(`assets.stageSprites must include stage id: ${stageId}`);
    }
    requireString(
      parsed.assets.stageSprites[stageId],
      `assets.stageSprites.${stageId}`
    );
  }

  for (const type of distractionTypes) {
    if (!parsed.assets.distractionSprites[type]) {
      throw new Error(`assets.distractionSprites must include type: ${type}`);
    }
    requireString(
      parsed.assets.distractionSprites[type],
      `assets.distractionSprites.${type}`
    );
  }

  if (Object.keys(parsed.assets.audio).length === 0) {
    throw new Error("assets.audio must include at least 1 cue");
  }
  for (const [cue, path] of Object.entries(parsed.assets.audio)) {
    requireString(path, `assets.audio.${cue}`);
  }

  return parsed;
}

export async function loadFestivalMap(path: string): Promise<FestivalMap> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load map config: ${response.status}`);
  }
  const raw = (await response.json()) as unknown;
  return parseFestivalMapData(raw);
}

export function normalizedToScreen(
  point: NormalizedPoint,
  viewport: ViewportSize
): ScreenPoint {
  assertNormalizedPoint(point, "point");
  return {
    x: point.x * viewport.width,
    y: point.y * viewport.height
  };
}

export function resolveAssetPath(path: string): string {
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("data:") ||
    path.startsWith("blob:") ||
    path.startsWith("/")
  ) {
    return path;
  }
  return `/${path}`;
}

export function collectMapAssetPaths(map: FestivalMap): string[] {
  const paths = new Set<string>();
  const isVideoAssetPath = (path: string): boolean => {
    const normalized = path.trim().toLowerCase();
    if (normalized.startsWith("data:video/")) {
      return true;
    }
    return /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/.test(normalized);
  };

  paths.add(map.background);
  if (map.introScreen && !isVideoAssetPath(map.introScreen)) {
    paths.add(map.introScreen);
  }
  for (const stage of map.stages) {
    paths.add(stage.sprite);
  }
  for (const distraction of map.distractions) {
    paths.add(distraction.sprite);
  }
  for (const artist of map.assets.artists) {
    for (const walkFrame of artist.sprites.walk) {
      paths.add(walkFrame);
    }
    if (artist.sprites.idle) {
      paths.add(artist.sprites.idle);
    }
    if (artist.sprites.distracted) {
      paths.add(artist.sprites.distracted);
    }
    paths.add(artist.sprites.performing);
    if (artist.performanceAudio?.clip) {
      paths.add(artist.performanceAudio.clip);
    }
  }
  for (const stageSprite of Object.values(map.assets.stageSprites)) {
    paths.add(stageSprite);
  }
  for (const distractionSprite of Object.values(map.assets.distractionSprites)) {
    paths.add(distractionSprite);
  }
  for (const audioPath of Object.values(map.assets.audio)) {
    paths.add(audioPath);
  }
  for (const fallbackPath of getAllGlobalFallbackAssetPaths()) {
    paths.add(fallbackPath);
  }

  return Array.from(paths);
}

export function driftAngleToUnitVector(angleDegrees: number): ScreenPoint {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: Math.cos(radians),
    y: Math.sin(radians)
  };
}

export function resolveFestivalLayout(
  map: FestivalMap,
  viewport: ViewportSize
): ResolvedFestivalLayout {
  const stages = map.stages.map((stage) => {
    const screenPosition = normalizedToScreen(stage.position, viewport);
    const size = getStagePixelSize(stage.size, viewport);
    return {
      ...stage,
      screenPosition,
      pixelWidth: size.width,
      pixelHeight: size.height
    };
  });

  const spawnPoints = map.spawnPoints.map((spawnPoint) => ({
    ...spawnPoint,
    screenPosition: normalizedToScreen(spawnPoint.position, viewport),
    directionVector: driftAngleToUnitVector(spawnPoint.driftAngle)
  }));

  const base = Math.min(viewport.width, viewport.height);
  const distractions = map.distractions.map((distraction) => ({
    ...distraction,
    screenPosition: normalizedToScreen(distraction.position, viewport),
    pixelRadius:
      distraction.radius <= 1
        ? distraction.radius * base
        : distraction.radius
  }));

  return {
    map,
    viewport,
    stages,
    spawnPoints,
    distractions
  };
}
