import type { FestivalMap } from "./FestivalConfig";
import { GAME_CONFIG } from "./GameConfig";

const DEFAULT_SESSION_NAMES = ["Morning", "Afternoon", "Evening"] as const;

export interface RuntimeLevelConfig {
  levelNumber: number;
  totalArtists: number;
  sessionTargetSets: number;
  sessionDayNumber: number;
  sessionIndexInDay: number;
  sessionName: string;
  sessionsPerDay: number;
  totalFestivalDays: number;
  maxSimultaneous: number;
  levelDurationSeconds: number;
  maxEncounterStrikes: number;
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
  sessionTargetSets: 8,
  sessionDayNumber: 1,
  sessionIndexInDay: 1,
  sessionName: "Morning",
  sessionsPerDay: 3,
  totalFestivalDays: 1,
  maxSimultaneous: 2,
  levelDurationSeconds: GAME_CONFIG.round.levelDurationSeconds,
  maxEncounterStrikes: GAME_CONFIG.hazards.maxEncounterStrikes,
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

interface SessionMeta {
  dayNumber: number;
  sessionIndexInDay: number;
  sessionName: string;
  sessionsPerDay: number;
  totalFestivalDays: number;
}

function resolveSessionMeta(map: FestivalMap, levelNumber: number): SessionMeta {
  const sessionsPerDay = Math.max(1, Math.floor(map.schedule?.sessionsPerDay ?? 3));
  const configuredNames = (map.schedule?.sessionNames ?? DEFAULT_SESSION_NAMES).filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
  );
  const sessionNames = configuredNames.length > 0 ? configuredNames : [...DEFAULT_SESSION_NAMES];
  const ordinal = Math.max(0, Math.floor(levelNumber) - 1);
  const sessionIndexInDay = (ordinal % sessionsPerDay) + 1;
  const dayNumber = Math.floor(ordinal / sessionsPerDay) + 1;
  const inferredDays = Math.max(1, Math.ceil(map.totalLevels / sessionsPerDay));
  const totalFestivalDays = Math.max(
    dayNumber,
    Math.max(1, Math.floor(map.schedule?.days ?? inferredDays))
  );
  const name = sessionNames[Math.min(sessionIndexInDay - 1, sessionNames.length - 1)];
  return {
    dayNumber,
    sessionIndexInDay,
    sessionName: name,
    sessionsPerDay,
    totalFestivalDays
  };
}

function resolveSessionTargetSets(totalArtists: number, configured?: number): number {
  if (typeof configured === "number" && Number.isFinite(configured)) {
    return Math.max(1, Math.min(totalArtists, Math.floor(configured)));
  }
  return Math.max(6, Math.min(totalArtists, Math.round(totalArtists * 0.65)));
}

export function toRuntimeLevelConfig(
  map: FestivalMap,
  levelNumber = 1
): RuntimeLevelConfig {
  const sessionMeta = resolveSessionMeta(map, levelNumber);
  const existing = map.levels.find((entry) => entry.levelNumber === levelNumber);
  if (!existing) {
    return {
      ...DEFAULT_LEVEL_CONFIG,
      levelNumber,
      sessionDayNumber: sessionMeta.dayNumber,
      sessionIndexInDay: sessionMeta.sessionIndexInDay,
      sessionName: sessionMeta.sessionName,
      sessionsPerDay: sessionMeta.sessionsPerDay,
      totalFestivalDays: sessionMeta.totalFestivalDays
    };
  }

  return {
    levelNumber: existing.levelNumber,
    totalArtists: existing.totalArtists,
    sessionTargetSets: resolveSessionTargetSets(existing.totalArtists, existing.targetSets),
    sessionDayNumber: sessionMeta.dayNumber,
    sessionIndexInDay: sessionMeta.sessionIndexInDay,
    sessionName: sessionMeta.sessionName,
    sessionsPerDay: sessionMeta.sessionsPerDay,
    totalFestivalDays: sessionMeta.totalFestivalDays,
    maxSimultaneous: existing.maxSimultaneous,
    levelDurationSeconds: DEFAULT_LEVEL_CONFIG.levelDurationSeconds,
    maxEncounterStrikes: Math.max(
      1,
      Math.floor(existing.maxEncounterStrikes ?? DEFAULT_LEVEL_CONFIG.maxEncounterStrikes)
    ),
    timerRangeSeconds: existing.timerRange,
    tierWeights: existing.tierWeights,
    spawnIntervalMs: existing.spawnInterval,
    activeDistractionIds: existing.activeDistractions,
    driftSpeedPxPerSecond: DEFAULT_LEVEL_CONFIG.driftSpeedPxPerSecond,
    driftAngleVarianceDegrees: DEFAULT_LEVEL_CONFIG.driftAngleVarianceDegrees
  };
}
