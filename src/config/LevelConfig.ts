import type { FestivalMap } from "./FestivalConfig";

export interface RuntimeLevelConfig {
  levelNumber: number;
  totalArtists: number;
  maxSimultaneous: number;
  timerRangeSeconds: [number, number];
  tierWeights: {
    headliner: number;
    midtier: number;
    newcomer: number;
  };
  spawnIntervalMs: [number, number];
  activeDistractionIds: string[];
  driftSpeedPxPerSecond: number;
  driftAngleVarianceDegrees: number;
}

export const DEFAULT_LEVEL_CONFIG: RuntimeLevelConfig = {
  levelNumber: 1,
  totalArtists: 12,
  maxSimultaneous: 2,
  timerRangeSeconds: [18, 24],
  tierWeights: {
    headliner: 0.2,
    midtier: 0.4,
    newcomer: 0.4
  },
  spawnIntervalMs: [1400, 2200],
  activeDistractionIds: [],
  driftSpeedPxPerSecond: 75,
  driftAngleVarianceDegrees: 0
};

export function toRuntimeLevelConfig(
  map: FestivalMap,
  levelNumber = 1
): RuntimeLevelConfig {
  const existing = map.levels.find((entry) => entry.levelNumber === levelNumber);
  if (!existing) {
    return {
      ...DEFAULT_LEVEL_CONFIG,
      levelNumber
    };
  }

  return {
    levelNumber: existing.levelNumber,
    totalArtists: existing.totalArtists,
    maxSimultaneous: existing.maxSimultaneous,
    timerRangeSeconds: existing.timerRange,
    tierWeights: existing.tierWeights,
    spawnIntervalMs: existing.spawnInterval,
    activeDistractionIds: existing.activeDistractions,
    driftSpeedPxPerSecond: DEFAULT_LEVEL_CONFIG.driftSpeedPxPerSecond,
    driftAngleVarianceDegrees: DEFAULT_LEVEL_CONFIG.driftAngleVarianceDegrees
  };
}
