import {
  coercePersistedProfile,
  createDefaultProfile,
  type PersistedProfile,
  type PersistedSettings
} from "./StorageSchema";

const DEFAULT_STORAGE_KEY = "stage-call.profile.v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersistenceSnapshot {
  highestUnlockedLevel: number;
  bestFestivalScore: number;
  bestLevelScores: Record<string, number>;
  settings: PersistedSettings;
}

interface RecordLevelCompletionInput {
  levelNumber: number;
  totalLevels: number;
  levelScore: number;
  cumulativeScore: number;
  festivalCompleted: boolean;
}

export class RunPersistence {
  private readonly storage: StorageLike;
  private readonly storageKey: string;
  private profile: PersistedProfile;

  constructor(storage: StorageLike | null = getBrowserStorage(), storageKey = DEFAULT_STORAGE_KEY) {
    this.storage = storage ?? createMemoryStorage();
    this.storageKey = storageKey;
    this.profile = this.loadProfile();
  }

  getSnapshot(): PersistenceSnapshot {
    return {
      highestUnlockedLevel: this.profile.progress.highestUnlockedLevel,
      bestFestivalScore: this.profile.progress.bestFestivalScore,
      bestLevelScores: { ...this.profile.progress.bestLevelScores },
      settings: { ...this.profile.settings }
    };
  }

  recordLevelCompletion(input: RecordLevelCompletionInput): void {
    const levelKey = String(Math.max(1, Math.floor(input.levelNumber)));
    const normalizedLevelScore = Math.max(0, Math.floor(input.levelScore));
    const normalizedRunScore = Math.max(0, Math.floor(input.cumulativeScore));
    const nextUnlocked = Math.min(
      Math.max(1, Math.floor(input.totalLevels)),
      Math.max(1, Math.floor(input.levelNumber + 1))
    );

    this.profile.progress.highestUnlockedLevel = Math.max(
      this.profile.progress.highestUnlockedLevel,
      nextUnlocked
    );
    this.profile.progress.bestLevelScores[levelKey] = Math.max(
      this.profile.progress.bestLevelScores[levelKey] ?? 0,
      normalizedLevelScore
    );

    if (input.festivalCompleted) {
      this.profile.progress.bestFestivalScore = Math.max(
        this.profile.progress.bestFestivalScore,
        normalizedRunScore
      );
    }

    this.touchAndPersist();
  }

  setSettings(settings: Partial<PersistedSettings>): void {
    this.profile.settings = {
      ...this.profile.settings,
      ...settings
    };
    this.touchAndPersist();
  }

  reset(): void {
    this.profile = createDefaultProfile();
    this.persist();
  }

  private loadProfile(): PersistedProfile {
    const raw = this.storage.getItem(this.storageKey);
    if (!raw) {
      const defaults = createDefaultProfile();
      this.storage.setItem(this.storageKey, JSON.stringify(defaults));
      return defaults;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      const coerced = coercePersistedProfile(parsed);
      this.storage.setItem(this.storageKey, JSON.stringify(coerced));
      return coerced;
    } catch {
      const defaults = createDefaultProfile();
      this.storage.setItem(this.storageKey, JSON.stringify(defaults));
      return defaults;
    }
  }

  private touchAndPersist(): void {
    this.profile.updatedAt = new Date().toISOString();
    this.persist();
  }

  private persist(): void {
    this.storage.setItem(this.storageKey, JSON.stringify(this.profile));
  }
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  return window.localStorage;
}

function createMemoryStorage(): StorageLike {
  const memory = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return memory.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      memory.set(key, value);
    },
    removeItem(key: string): void {
      memory.delete(key);
    }
  };
}
