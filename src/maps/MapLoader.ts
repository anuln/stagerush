import { getStagePixelSize, type ViewportSize } from "../config/GameConfig";
import type {
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

export interface ResolvedFestivalLayout {
  map: FestivalMap;
  viewport: ViewportSize;
  stages: ResolvedStage[];
  spawnPoints: ResolvedSpawnPoint[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertNormalizedNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a normalized number between 0 and 1`);
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

  if (!Array.isArray(parsed.stages) || parsed.stages.length < 2) {
    throw new Error("stages must contain at least 2 stage definitions");
  }

  if (!Array.isArray(parsed.spawnPoints) || parsed.spawnPoints.length < 2) {
    throw new Error("spawnPoints must contain at least 2 spawn definitions");
  }

  parsed.stages.forEach((stage, index) => {
    assertNormalizedPoint(stage.position, `stages[${index}].position`);
  });

  parsed.spawnPoints.forEach((spawn, index) => {
    assertNormalizedPoint(spawn.position, `spawnPoints[${index}].position`);
  });

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

  return {
    map,
    viewport,
    stages,
    spawnPoints
  };
}
