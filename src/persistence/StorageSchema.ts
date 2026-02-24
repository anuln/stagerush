export const STORAGE_VERSION = 1;

export interface PersistedSettings {
  musicVolume: number;
  sfxVolume: number;
}

export interface PersistedProgress {
  highestUnlockedLevel: number;
  bestFestivalScore: number;
  bestLevelScores: Record<string, number>;
}

export interface PersistedProfile {
  version: number;
  updatedAt: string;
  settings: PersistedSettings;
  progress: PersistedProgress;
}

export function createDefaultProfile(): PersistedProfile {
  return {
    version: STORAGE_VERSION,
    updatedAt: new Date(0).toISOString(),
    settings: {
      musicVolume: 0.8,
      sfxVolume: 0.9
    },
    progress: {
      highestUnlockedLevel: 1,
      bestFestivalScore: 0,
      bestLevelScores: {}
    }
  };
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function coercePersistedProfile(raw: unknown): PersistedProfile {
  const defaults = createDefaultProfile();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  const object = raw as Record<string, unknown>;
  const settings = object.settings as Record<string, unknown> | undefined;
  const progress = object.progress as Record<string, unknown> | undefined;
  const bestRaw = progress?.bestLevelScores;

  const bestLevelScores: Record<string, number> = {};
  if (bestRaw && typeof bestRaw === "object") {
    for (const [key, value] of Object.entries(bestRaw as Record<string, unknown>)) {
      const parsed = toFiniteNumber(value, 0);
      bestLevelScores[key] = Math.max(0, Math.floor(parsed));
    }
  }

  const updatedAt =
    typeof object.updatedAt === "string" && object.updatedAt.length > 0
      ? object.updatedAt
      : defaults.updatedAt;

  return {
    version: STORAGE_VERSION,
    updatedAt,
    settings: {
      musicVolume: Math.min(1, Math.max(0, toFiniteNumber(settings?.musicVolume, defaults.settings.musicVolume))),
      sfxVolume: Math.min(1, Math.max(0, toFiniteNumber(settings?.sfxVolume, defaults.settings.sfxVolume)))
    },
    progress: {
      highestUnlockedLevel: Math.max(
        1,
        Math.floor(toFiniteNumber(progress?.highestUnlockedLevel, defaults.progress.highestUnlockedLevel))
      ),
      bestFestivalScore: Math.max(
        0,
        Math.floor(toFiniteNumber(progress?.bestFestivalScore, defaults.progress.bestFestivalScore))
      ),
      bestLevelScores
    }
  };
}
