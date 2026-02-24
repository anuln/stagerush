export type LevelSessionState =
  | "IDLE"
  | "PLAYING"
  | "LEVEL_FAILED"
  | "LEVEL_COMPLETE"
  | "FESTIVAL_COMPLETE";

export interface LevelManagerSnapshot {
  state: LevelSessionState;
  currentLevel: number;
  totalLevels: number;
  attemptNumber: number;
  attemptKey: string;
  cumulativeScore: number;
  lastLevelScore: number | null;
}

interface LevelManagerOptions {
  totalLevels: number;
}

export class LevelManager {
  private readonly totalLevels: number;
  private state: LevelSessionState = "IDLE";
  private currentLevel = 1;
  private attemptNumber = 0;
  private cumulativeScore = 0;
  private lastLevelScore: number | null = null;

  constructor(options: LevelManagerOptions) {
    this.totalLevels = Math.max(1, Math.floor(options.totalLevels));
  }

  get snapshot(): LevelManagerSnapshot {
    return {
      state: this.state,
      currentLevel: this.currentLevel,
      totalLevels: this.totalLevels,
      attemptNumber: this.attemptNumber,
      attemptKey: `${this.currentLevel}:${this.attemptNumber}`,
      cumulativeScore: this.cumulativeScore,
      lastLevelScore: this.lastLevelScore
    };
  }

  startFestival(): void {
    this.state = "PLAYING";
    this.currentLevel = 1;
    this.attemptNumber = 1;
    this.cumulativeScore = 0;
    this.lastLevelScore = null;
  }

  markLevelFailed(levelScore: number): void {
    if (this.state !== "PLAYING") {
      return;
    }
    this.state = "LEVEL_FAILED";
    this.lastLevelScore = Math.max(0, Math.floor(levelScore));
  }

  retryLevel(): boolean {
    if (this.state !== "LEVEL_FAILED") {
      return false;
    }

    this.state = "PLAYING";
    this.attemptNumber += 1;
    this.lastLevelScore = null;
    return true;
  }

  markLevelCompleted(levelScore: number): void {
    if (this.state !== "PLAYING") {
      return;
    }

    const normalizedScore = Math.max(0, Math.floor(levelScore));
    this.lastLevelScore = normalizedScore;
    this.cumulativeScore += normalizedScore;
    this.state =
      this.currentLevel >= this.totalLevels
        ? "FESTIVAL_COMPLETE"
        : "LEVEL_COMPLETE";
  }

  advanceToNextLevel(): boolean {
    if (this.state !== "LEVEL_COMPLETE") {
      return false;
    }

    if (this.currentLevel >= this.totalLevels) {
      return false;
    }

    this.currentLevel += 1;
    this.attemptNumber = 1;
    this.lastLevelScore = null;
    this.state = "PLAYING";
    return true;
  }

  resetToMenu(): void {
    this.state = "IDLE";
    this.currentLevel = 1;
    this.attemptNumber = 0;
    this.cumulativeScore = 0;
    this.lastLevelScore = null;
  }
}
