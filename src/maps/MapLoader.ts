import { getStagePixelSize, type ViewportSize } from "../config/GameConfig";
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
    if (!Array.isArray(artist.sprites.walk) || artist.sprites.walk.length < 2) {
      throw new Error(`assets.artists[${index}].sprites.walk must contain at least 2 frames`);
    }
    artist.sprites.walk.forEach((path, frameIndex) => {
      requireString(path, `assets.artists[${index}].sprites.walk[${frameIndex}]`);
    });
    requireString(artist.sprites.idle, `assets.artists[${index}].sprites.idle`);
    requireString(
      artist.sprites.performing,
      `assets.artists[${index}].sprites.performing`
    );
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
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("/")) {
    return path;
  }
  return `/${path}`;
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
