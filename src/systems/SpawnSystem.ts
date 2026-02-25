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
  screenPosition: { x: number; y: number };
}

interface SpawnSystemOptions {
  stages?: SpawnTarget[];
  viewport?: { width: number; height: number };
  spawnInsetPx?: number;
  pickArtistProfileId?: (tier: ArtistTier) => string | null;
}

export class SpawnSystem {
  private readonly level: RuntimeLevelConfig;
  private readonly rng: () => number;
  private spawnPoints: ResolvedSpawnPoint[];
  private stages: SpawnTarget[];
  private viewport: { width: number; height: number } | null;
  private readonly spawnInsetPx: number;
  private readonly pickArtistProfileId: SpawnSystemOptions["pickArtistProfileId"];
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
    const spawnPoint =
      this.spawnPoints[Math.floor(this.rng() * this.spawnPoints.length)];
    const targetStage =
      this.stages.length > 0
        ? this.stages[Math.floor(this.rng() * this.stages.length)]
        : null;

    const timerSeconds = getRandomInRange(
      this.level.timerRangeSeconds[0],
      this.level.timerRangeSeconds[1],
      this.rng
    );

    const inboundDirection = this.resolveInboundDirection(spawnPoint, targetStage);
    const driftVariance = Math.max(0, this.level.driftAngleVarianceDegrees ?? 0);
    const driftOffsetDegrees =
      driftVariance > 0 ? getRandomInRange(-driftVariance, driftVariance, this.rng) : 0;
    const driftDirection = rotateVector(
      inboundDirection,
      (driftOffsetDegrees * Math.PI) / 180
    );
    const velocity = scaleVector(
      normalizeVector(driftDirection, inboundDirection),
      this.level.driftSpeedPxPerSecond
    );
    const spawnPosition = this.resolveSpawnPosition(spawnPoint, inboundDirection);
    const tier = this.pickTier();

    return new Artist({
      id: `artist-${this.level.levelNumber}-${this.spawnedCount + 1}`,
      tier,
      spriteProfileId: this.pickArtistProfileId?.(tier) ?? undefined,
      position: spawnPosition,
      velocity,
      timerSeconds,
      state: "SPAWNING"
    });
  }

  private resolveInboundDirection(
    spawnPoint: ResolvedSpawnPoint,
    targetStage: SpawnTarget | null
  ): { x: number; y: number } {
    if (!targetStage) {
      return normalizeVector(spawnPoint.directionVector);
    }
    return normalizeVector({
      x: targetStage.screenPosition.x - spawnPoint.screenPosition.x,
      y: targetStage.screenPosition.y - spawnPoint.screenPosition.y
    }, normalizeVector(spawnPoint.directionVector));
  }

  private resolveSpawnPosition(
    spawnPoint: ResolvedSpawnPoint,
    inboundDirection: { x: number; y: number }
  ): { x: number; y: number } {
    let x = spawnPoint.screenPosition.x;
    let y = spawnPoint.screenPosition.y;
    const viewport = this.viewport;
    const edgeThreshold = 0.01;

    if (viewport) {
      if (spawnPoint.position.x <= edgeThreshold) {
        x = -this.spawnInsetPx;
      } else if (spawnPoint.position.x >= 1 - edgeThreshold) {
        x = viewport.width + this.spawnInsetPx;
      }

      if (spawnPoint.position.y <= edgeThreshold) {
        y = -this.spawnInsetPx;
      } else if (spawnPoint.position.y >= 1 - edgeThreshold) {
        y = viewport.height + this.spawnInsetPx;
      }
    }

    if (x === spawnPoint.screenPosition.x && y === spawnPoint.screenPosition.y) {
      x -= inboundDirection.x * this.spawnInsetPx;
      y -= inboundDirection.y * this.spawnInsetPx;
    }

    return { x, y };
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
}
