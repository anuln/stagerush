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

export class SpawnSystem {
  private readonly level: RuntimeLevelConfig;
  private readonly rng: () => number;
  private spawnPoints: ResolvedSpawnPoint[];
  private spawnedCount = 0;
  private cooldownRemainingSeconds = 0;

  constructor(
    level: RuntimeLevelConfig,
    spawnPoints: ResolvedSpawnPoint[],
    rng: () => number = Math.random
  ) {
    this.level = level;
    this.spawnPoints = spawnPoints;
    this.rng = rng;
  }

  setSpawnPoints(points: ResolvedSpawnPoint[]): void {
    this.spawnPoints = points;
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

    const timerSeconds = getRandomInRange(
      this.level.timerRangeSeconds[0],
      this.level.timerRangeSeconds[1],
      this.rng
    );

    const velocity = scaleVector(
      spawnPoint.directionVector,
      this.level.driftSpeedPxPerSecond
    );

    return new Artist({
      id: `artist-${this.level.levelNumber}-${this.spawnedCount + 1}`,
      tier: this.pickTier(),
      position: { ...spawnPoint.screenPosition },
      velocity,
      timerSeconds
    });
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
