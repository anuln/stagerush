import type { ArtistTier } from "../config/FestivalConfig";
import type { RuntimeLevelConfig } from "../config/LevelConfig";
import { Artist } from "../entities/Artist";
import type { ResolvedSpawnPoint } from "../maps/MapLoader";
import { scaleVector } from "../utils/MathUtils";

function getRandomInRange(
  min: number,
  max: number,
  rng: () => number
): number {
  return min + (max - min) * rng();
}

function rotateVector(
  vector: { x: number; y: number },
  radians: number
): { x: number; y: number } {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos
  };
}

function normalizeVector(
  vector: { x: number; y: number },
  fallback: { x: number; y: number } = { x: 0, y: 1 }
): { x: number; y: number } {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= 0.0001) {
    return { ...fallback };
  }
  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

interface SpawnTarget {
  id: string;
  color: string;
  screenPosition: { x: number; y: number };
}

interface SpawnSystemOptions {
  stages?: SpawnTarget[];
  viewport?: { width: number; height: number };
  spawnInsetPx?: number;
  pickArtistProfileId?: (tier: ArtistTier) => string | null;
}

type SpawnEdge = "left" | "right" | "top" | "bottom";

const INWARD_SPAWN_CONE_HALF_ANGLE_DEGREES = 18;
const EDGE_THRESHOLD = 0.01;
const MIN_INWARD_ALIGNMENT = 0.58;
const SPAWN_POINT_REPEAT_AVOIDANCE_BIAS = 0.75;

const TIER_SPEED_MULTIPLIER_RANGE: Record<
  ArtistTier,
  { min: number; max: number }
> = {
  headliner: { min: 0.9, max: 1.02 },
  midtier: { min: 0.78, max: 0.9 },
  newcomer: { min: 0.64, max: 0.8 }
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function dot(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return a.x * b.x + a.y * b.y;
}

function edgeInward(edge: SpawnEdge): { x: number; y: number } {
  switch (edge) {
    case "left":
      return { x: 1, y: 0 };
    case "right":
      return { x: -1, y: 0 };
    case "top":
      return { x: 0, y: 1 };
    case "bottom":
      return { x: 0, y: -1 };
  }
}

export class SpawnSystem {
  private readonly level: RuntimeLevelConfig;
  private readonly rng: () => number;
  private spawnPoints: ResolvedSpawnPoint[];
  private stages: SpawnTarget[];
  private viewport: { width: number; height: number } | null;
  private readonly spawnInsetPx: number;
  private readonly pickArtistProfileId: SpawnSystemOptions["pickArtistProfileId"];
  private lastSpawnPointId: string | null = null;
  private spawnedCount = 0;
  private cooldownRemainingSeconds = 0;

  constructor(
    level: RuntimeLevelConfig,
    spawnPoints: ResolvedSpawnPoint[],
    rng: () => number = Math.random,
    options: SpawnSystemOptions = {}
  ) {
    this.level = level;
    this.spawnPoints = spawnPoints;
    this.rng = rng;
    this.stages = options.stages ? [...options.stages] : [];
    this.viewport = options.viewport ?? null;
    this.spawnInsetPx = Math.max(8, options.spawnInsetPx ?? 28);
    this.pickArtistProfileId = options.pickArtistProfileId;
  }

  setSpawnPoints(points: ResolvedSpawnPoint[]): void {
    this.spawnPoints = points;
  }

  setStageTargets(stages: SpawnTarget[]): void {
    this.stages = [...stages];
  }

  setViewport(viewport: { width: number; height: number }): void {
    this.viewport = viewport;
  }

  get spawnedArtists(): number {
    return this.spawnedCount;
  }

  get totalArtists(): number {
    return this.level.totalArtists;
  }

  get isExhausted(): boolean {
    return this.spawnedCount >= this.level.totalArtists;
  }

  update(deltaSeconds: number, activeArtists: Artist[]): Artist[] {
    if (this.spawnPoints.length === 0) {
      return [];
    }

    const spawned: Artist[] = [];
    this.cooldownRemainingSeconds -= deltaSeconds;
    const maxNewArtists = this.level.maxSimultaneous - activeArtists.length;

    if (maxNewArtists <= 0) {
      return spawned;
    }

    while (
      this.cooldownRemainingSeconds <= 0 &&
      spawned.length < maxNewArtists &&
      this.spawnedCount < this.level.totalArtists
    ) {
      spawned.push(this.spawnArtist());
      this.spawnedCount += 1;
      this.cooldownRemainingSeconds = getRandomInRange(
        this.level.spawnIntervalMs[0] / 1000,
        this.level.spawnIntervalMs[1] / 1000,
        this.rng
      );
    }

    return spawned;
  }

  private spawnArtist(): Artist {
    const spawnPoint = this.pickSpawnPoint();
    const spawnPosition = this.resolveSpawnPosition(spawnPoint);
    const targetStage =
      this.stages.length > 0
        ? this.stages[Math.floor(this.rng() * this.stages.length)]
        : null;

    const timerSeconds = getRandomInRange(
      this.level.timerRangeSeconds[0],
      this.level.timerRangeSeconds[1],
      this.rng
    );

    const inboundDirection = this.resolveRandomInboundDirection(
      spawnPoint,
      spawnPosition
    );
    const driftVariance = Math.max(0, this.level.driftAngleVarianceDegrees ?? 0);
    const driftOffsetDegrees =
      driftVariance > 0 ? getRandomInRange(-driftVariance, driftVariance, this.rng) : 0;
    const driftDirection = rotateVector(
      inboundDirection,
      (driftOffsetDegrees * Math.PI) / 180
    );
    const tier = this.pickTier();
    const movementSpeedPxPerSecond = this.resolveSpawnSpeedPxPerSecond(tier);
    const velocity = scaleVector(
      normalizeVector(driftDirection, inboundDirection),
      movementSpeedPxPerSecond
    );
    return new Artist({
      id: `artist-${this.level.levelNumber}-${this.spawnedCount + 1}`,
      tier,
      spriteProfileId: this.pickArtistProfileId?.(tier) ?? undefined,
      assignedStageId: targetStage?.id ?? null,
      assignedStageColor: targetStage?.color ?? null,
      movementSpeedPxPerSecond,
      position: spawnPosition,
      velocity,
      timerSeconds,
      state: "SPAWNING"
    });
  }

  private resolveRandomInboundDirection(
    spawnPoint: ResolvedSpawnPoint,
    spawnPosition: { x: number; y: number }
  ): { x: number; y: number } {
    const spawnEdge = this.resolveSpawnEdge(spawnPoint);
    const defaultInward = edgeInward(spawnEdge);
    const targetPoint =
      this.viewport === null
        ? null
        : this.sampleInwardTarget(spawnEdge, this.viewport);
    const inward = normalizeVector(
      targetPoint
        ? {
            x: targetPoint.x - spawnPosition.x,
            y: targetPoint.y - spawnPosition.y
          }
        : this.resolveMapInwardVector(spawnPoint),
      defaultInward
    );
    const coneHalfAngleRadians =
      (INWARD_SPAWN_CONE_HALF_ANGLE_DEGREES * Math.PI) / 180;
    const offsetRadians = getRandomInRange(
      -coneHalfAngleRadians,
      coneHalfAngleRadians,
      this.rng
    );
    let randomDirection = normalizeVector(
      rotateVector(inward, offsetRadians),
      defaultInward
    );
    if (dot(randomDirection, defaultInward) < MIN_INWARD_ALIGNMENT) {
      randomDirection = normalizeVector(
        {
          x: randomDirection.x + defaultInward.x * 1.5,
          y: randomDirection.y + defaultInward.y * 1.5
        },
        defaultInward
      );
    }
    return randomDirection;
  }

  private sampleInwardTarget(
    edge: SpawnEdge,
    viewport: { width: number; height: number }
  ): { x: number; y: number } {
    const width = Math.max(1, viewport.width);
    const height = Math.max(1, viewport.height);
    const xAny = getRandomInRange(width * 0.1, width * 0.9, this.rng);
    const yAny = getRandomInRange(height * 0.1, height * 0.9, this.rng);
    if (edge === "left") {
      return {
        x: getRandomInRange(width * 0.35, width * 0.95, this.rng),
        y: yAny
      };
    }
    if (edge === "right") {
      return {
        x: getRandomInRange(width * 0.05, width * 0.65, this.rng),
        y: yAny
      };
    }
    if (edge === "top") {
      return {
        x: xAny,
        y: getRandomInRange(height * 0.35, height * 0.95, this.rng)
      };
    }
    return {
      x: xAny,
      y: getRandomInRange(height * 0.05, height * 0.65, this.rng)
    };
  }

  private resolveSpawnEdge(spawnPoint: ResolvedSpawnPoint): SpawnEdge {
    const { x, y } = spawnPoint.position;
    const distances: Array<{ edge: SpawnEdge; distance: number }> = [
      { edge: "left", distance: x },
      { edge: "right", distance: 1 - x },
      { edge: "top", distance: y },
      { edge: "bottom", distance: 1 - y }
    ];
    distances.sort((a, b) => a.distance - b.distance);
    return distances[0]?.edge ?? "top";
  }

  private resolveMapInwardVector(
    spawnPoint: ResolvedSpawnPoint
  ): { x: number; y: number } {
    const position = spawnPoint.position;
    let inwardX = 0;
    let inwardY = 0;
    if (position.x <= EDGE_THRESHOLD) {
      inwardX += 1;
    } else if (position.x >= 1 - EDGE_THRESHOLD) {
      inwardX -= 1;
    }
    if (position.y <= EDGE_THRESHOLD) {
      inwardY += 1;
    } else if (position.y >= 1 - EDGE_THRESHOLD) {
      inwardY -= 1;
    }
    const edgeNormal = normalizeVector({ x: inwardX, y: inwardY }, { x: 0, y: 0 });
    if (Math.hypot(edgeNormal.x, edgeNormal.y) > 0.001) {
      return edgeNormal;
    }

    if (this.viewport) {
      const centerInward = normalizeVector({
        x: this.viewport.width * 0.5 - spawnPoint.screenPosition.x,
        y: this.viewport.height * 0.5 - spawnPoint.screenPosition.y
      }, { x: 0, y: 0 });
      if (Math.hypot(centerInward.x, centerInward.y) > 0.001) {
        return centerInward;
      }
    }

    return normalizeVector(spawnPoint.directionVector);
  }

  private resolveSpawnPosition(spawnPoint: ResolvedSpawnPoint): { x: number; y: number } {
    let x = spawnPoint.screenPosition.x;
    let y = spawnPoint.screenPosition.y;
    const viewport = this.viewport;
    const spawnEdge = this.resolveSpawnEdge(spawnPoint);

    if (viewport) {
      if (spawnEdge === "left") {
        x = -this.spawnInsetPx;
        y = this.rng() * viewport.height;
      } else if (spawnEdge === "right") {
        x = viewport.width + this.spawnInsetPx;
        y = this.rng() * viewport.height;
      } else if (spawnEdge === "top") {
        y = -this.spawnInsetPx;
        x = this.rng() * viewport.width;
      } else if (spawnEdge === "bottom") {
        y = viewport.height + this.spawnInsetPx;
        x = this.rng() * viewport.width;
      }
    }

    if (x === spawnPoint.screenPosition.x && y === spawnPoint.screenPosition.y) {
      const inwardDirection = this.resolveMapInwardVector(spawnPoint);
      x -= inwardDirection.x * this.spawnInsetPx;
      y -= inwardDirection.y * this.spawnInsetPx;
    }

    return { x, y };
  }

  private pickSpawnPoint(): ResolvedSpawnPoint {
    if (this.spawnPoints.length <= 1) {
      const only = this.spawnPoints[0];
      if (only) {
        this.lastSpawnPointId = only.id;
      }
      return only;
    }

    let index = Math.floor(this.rng() * this.spawnPoints.length);
    if (
      this.lastSpawnPointId &&
      this.spawnPoints[index]?.id === this.lastSpawnPointId &&
      this.rng() < SPAWN_POINT_REPEAT_AVOIDANCE_BIAS
    ) {
      index = (index + 1 + Math.floor(this.rng() * (this.spawnPoints.length - 1))) % this.spawnPoints.length;
    }

    const selected = this.spawnPoints[index] ?? this.spawnPoints[0];
    this.lastSpawnPointId = selected.id;
    return selected;
  }

  private pickTier(): ArtistTier {
    const { headliner, midtier, newcomer } = this.level.tierWeights;
    const total = headliner + midtier + newcomer;
    if (total <= 0) {
      return "newcomer";
    }

    const target = this.rng() * total;
    if (target < headliner) {
      return "headliner";
    }
    if (target < headliner + midtier) {
      return "midtier";
    }
    return "newcomer";
  }

  private resolveSpawnSpeedPxPerSecond(tier: ArtistTier): number {
    const tierRange = TIER_SPEED_MULTIPLIER_RANGE[tier];
    const tierScale = getRandomInRange(tierRange.min, tierRange.max, this.rng);
    const levelScale = clamp(1 + (this.level.levelNumber - 1) * 0.014, 1, 1.1);
    const microJitter = getRandomInRange(0.97, 1.03, this.rng);
    return clamp(
      this.level.driftSpeedPxPerSecond * tierScale * levelScale * microJitter,
      36,
      102
    );
  }
}
