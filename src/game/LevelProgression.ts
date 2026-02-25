import type { FestivalMap } from "../config/FestivalConfig";
import {
  toRuntimeLevelConfig,
  type RuntimeLevelConfig
} from "../config/LevelConfig";
import { clamp } from "../utils/MathUtils";

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function jitter(value: number, ratio: number, rng: () => number): number {
  const delta = (rng() * 2 - 1) * ratio;
  return value * (1 + delta);
}

function normalizeTierWeights(weights: RuntimeLevelConfig["tierWeights"]): RuntimeLevelConfig["tierWeights"] {
  const headliner = Math.max(0, weights.headliner);
  const midtier = Math.max(0, weights.midtier);
  const newcomer = Math.max(0, weights.newcomer);
  const total = headliner + midtier + newcomer;
  if (total <= 0) {
    return { headliner: 0.2, midtier: 0.4, newcomer: 0.4 };
  }
  return {
    headliner: headliner / total,
    midtier: midtier / total,
    newcomer: newcomer / total
  };
}

function estimateTimedSpawnBudget(
  durationSeconds: number,
  spawnIntervalMs: [number, number],
  maxSimultaneous: number
): number {
  const averageIntervalMs = Math.max(
    200,
    (spawnIntervalMs[0] + spawnIntervalMs[1]) / 2
  );
  const waves = Math.ceil((durationSeconds * 1000) / averageIntervalMs);
  return Math.max(1, waves * Math.max(1, maxSimultaneous));
}

function pickDistractionSubset(
  map: FestivalMap,
  levelNumber: number,
  baseActiveIds: string[],
  rng: () => number
): string[] {
  if (baseActiveIds.length > 0) {
    return [...baseActiveIds];
  }

  const eligible = map.distractions
    .filter((distraction) => distraction.appearsAtLevel <= levelNumber)
    .map((distraction) => distraction.id);
  if (eligible.length === 0) {
    return [];
  }

  const shuffled = [...eligible];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }

  const minCount = Math.min(eligible.length, Math.floor(levelNumber / 3));
  const maxCount = eligible.length;
  const count = clamp(
    minCount + Math.floor(rng() * (maxCount - minCount + 1)),
    0,
    eligible.length
  );
  return shuffled.slice(0, count).sort();
}

function applyDifficultyCurve(
  base: RuntimeLevelConfig,
  levelNumber: number,
  hasAuthoredLevels: boolean
): RuntimeLevelConfig {
  if (hasAuthoredLevels) {
    return { ...base };
  }

  const step = Math.max(0, levelNumber - 1);
  const timerMin = Math.max(6, base.timerRangeSeconds[0] - step * 0.9);
  const timerMax = Math.max(timerMin + 1, base.timerRangeSeconds[1] - step * 1.05);
  const spawnMin = Math.max(600, Math.round(base.spawnIntervalMs[0] * (1 - step * 0.05)));
  const spawnMax = Math.max(spawnMin + 150, Math.round(base.spawnIntervalMs[1] * (1 - step * 0.06)));

  const shiftedWeights = normalizeTierWeights({
    headliner: base.tierWeights.headliner + step * 0.03,
    midtier: base.tierWeights.midtier + step * 0.01,
    newcomer: Math.max(0.1, base.tierWeights.newcomer - step * 0.04)
  });

  return {
    ...base,
    totalArtists: base.totalArtists + step * 2,
    sessionTargetSets: base.sessionTargetSets + Math.floor(step * 0.8),
    maxSimultaneous: Math.min(5, base.maxSimultaneous + Math.floor((step + 1) / 2)),
    timerRangeSeconds: [timerMin, timerMax],
    spawnIntervalMs: [spawnMin, spawnMax],
    tierWeights: shiftedWeights,
    driftAngleVarianceDegrees: Math.min(18, step * 1.5)
  };
}

export function resolveLevelRuntimeConfig(
  map: FestivalMap,
  levelNumber: number,
  attemptNumber = 1
): RuntimeLevelConfig {
  const boundedLevel = clamp(
    Math.floor(levelNumber),
    1,
    Math.max(1, map.totalLevels)
  );
  const boundedAttempt = Math.max(1, Math.floor(attemptNumber));
  const base = applyDifficultyCurve(
    toRuntimeLevelConfig(map, boundedLevel),
    boundedLevel,
    map.levels.length > 0
  );
  const rng = createSeededRng(
    hashSeed(`${map.id}:${boundedLevel}:${boundedAttempt}`)
  );

  const timerRange: [number, number] = [
    Math.max(5, jitter(base.timerRangeSeconds[0], 0.08, rng)),
    Math.max(6, jitter(base.timerRangeSeconds[1], 0.08, rng))
  ];
  if (timerRange[0] > timerRange[1]) {
    timerRange[0] = timerRange[1] - 1;
  }

  const spawnRange: [number, number] = [
    Math.max(450, Math.round(jitter(base.spawnIntervalMs[0], 0.1, rng))),
    Math.max(600, Math.round(jitter(base.spawnIntervalMs[1], 0.1, rng)))
  ];
  if (spawnRange[0] > spawnRange[1]) {
    spawnRange[0] = Math.max(450, spawnRange[1] - 120);
  }

  const tierWeights = normalizeTierWeights({
    headliner: base.tierWeights.headliner + (rng() * 2 - 1) * 0.04,
    midtier: base.tierWeights.midtier + (rng() * 2 - 1) * 0.04,
    newcomer: base.tierWeights.newcomer + (rng() * 2 - 1) * 0.04
  });

  const driftAngleVarianceDegrees = clamp(
    base.driftAngleVarianceDegrees + (rng() * 2 - 1) * 2,
    0,
    24
  );
  const tunedDriftSpeedPxPerSecond = clamp(
    base.driftSpeedPxPerSecond - 10 + (boundedLevel - 1) * 1.5,
    60,
    95
  );
  const timedSpawnBudget = estimateTimedSpawnBudget(
    base.levelDurationSeconds,
    spawnRange,
    base.maxSimultaneous
  );

  return {
    ...base,
    levelNumber: boundedLevel,
    totalArtists: Math.max(base.totalArtists, timedSpawnBudget),
    timerRangeSeconds: timerRange,
    spawnIntervalMs: spawnRange,
    tierWeights,
    driftSpeedPxPerSecond: tunedDriftSpeedPxPerSecond,
    driftAngleVarianceDegrees,
    activeDistractionIds: pickDistractionSubset(
      map,
      boundedLevel,
      base.activeDistractionIds,
      rng
    )
  };
}
