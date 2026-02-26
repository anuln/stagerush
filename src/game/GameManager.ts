import type { ResolvedFestivalLayout } from "../maps/MapLoader";
import type { RuntimeStatus, RuntimeViewport } from "./GameRuntime";
import { LevelManager, type LevelManagerSnapshot } from "./LevelManager";
import type { ScreenActionId } from "../ui/ScreenState";
import type { PersistenceSnapshot, RunPersistence } from "../persistence/RunPersistence";

export type ScreenState =
  | "MENU"
  | "PLAYING"
  | "LEVEL_FAILED"
  | "LEVEL_COMPLETE"
  | "FESTIVAL_COMPLETE";

export interface RuntimeController {
  onLayoutChanged(layout: ResolvedFestivalLayout): void;
  onPointerDown(x: number, y: number, nowMs?: number): boolean;
  onPointerMove(x: number, y: number): void;
  onPointerUp(x: number, y: number, nowMs?: number): void;
  onPointerCancel(nowMs?: number): void;
  update(deltaSeconds: number, viewport: RuntimeViewport, nowMs?: number): void;
  getStatus(): RuntimeStatus;
  dispose(): void;
}

interface GameManagerOptions {
  layout: ResolvedFestivalLayout;
  createRuntime: (
    levelNumber: number,
    attemptNumber: number
  ) => RuntimeController;
  persistence?: RunPersistence;
  onScreenChanged?: (next: ScreenState, previous: ScreenState) => void;
}

export interface ProfileSnapshot {
  highestUnlockedLevel: number;
  bestFestivalScore: number;
  bestLevelScore: number | null;
}

export interface GameManagerSnapshot {
  screen: ScreenState;
  level: LevelManagerSnapshot;
  profile: ProfileSnapshot;
  runtime: RuntimeStatus | null;
}

export class GameManager {
  private static readonly EVENING_COMPLETION_DELAY_MS = 4000;
  private layout: ResolvedFestivalLayout;
  private readonly createRuntime: GameManagerOptions["createRuntime"];
  private readonly levelManager: LevelManager;
  private readonly persistence: RunPersistence | null;
  private readonly onScreenChanged: GameManagerOptions["onScreenChanged"];
  private runtime: RuntimeController | null = null;
  private screen: ScreenState = "MENU";
  private eveningCompletionDelayUntilMs: number | null = null;
  private eveningCompletionDelayKey: string | null = null;

  constructor(options: GameManagerOptions) {
    this.layout = options.layout;
    this.createRuntime = options.createRuntime;
    this.persistence = options.persistence ?? null;
    this.onScreenChanged = options.onScreenChanged;
    this.levelManager = new LevelManager({
      totalLevels: Math.max(1, options.layout.map.totalLevels || 1)
    });
  }

  get snapshot(): GameManagerSnapshot {
    const level = this.levelManager.snapshot;
    const persisted = this.getPersistenceSnapshot();
    const levelKey = String(level.currentLevel);
    return {
      screen: this.screen,
      level,
      profile: {
        highestUnlockedLevel: persisted.highestUnlockedLevel,
        bestFestivalScore: persisted.bestFestivalScore,
        bestLevelScore: persisted.bestLevelScores[levelKey] ?? null
      },
      runtime: this.runtime ? this.runtime.getStatus() : null
    };
  }

  startFestival(): void {
    this.levelManager.startFestival();
    this.mountRuntimeForActiveLevel();
    this.setScreen("PLAYING");
  }

  handleScreenAction(actionId: ScreenActionId): void {
    switch (actionId) {
      case "START_FESTIVAL":
        this.startFestival();
        return;
      case "RETRY_LEVEL":
        this.retryLevel();
        return;
      case "NEXT_LEVEL":
        this.nextLevel();
        return;
      case "RETURN_TO_MENU":
        this.returnToMenu();
        return;
    }
  }

  retryLevel(): boolean {
    const retried = this.levelManager.retryLevel();
    if (!retried) {
      return false;
    }

    this.mountRuntimeForActiveLevel();
    this.setScreen("PLAYING");
    return true;
  }

  nextLevel(): boolean {
    const advanced = this.levelManager.advanceToNextLevel();
    if (!advanced) {
      return false;
    }

    this.mountRuntimeForActiveLevel();
    this.setScreen("PLAYING");
    return true;
  }

  returnToMenu(): void {
    this.disposeRuntime();
    this.levelManager.resetToMenu();
    this.setScreen("MENU");
  }

  onLayoutChanged(layout: ResolvedFestivalLayout): void {
    this.layout = layout;
    this.runtime?.onLayoutChanged(layout);
  }

  onPointerDown(x: number, y: number, nowMs?: number): boolean {
    if (this.screen !== "PLAYING" || !this.runtime) {
      return false;
    }
    return this.runtime.onPointerDown(x, y, nowMs);
  }

  onPointerMove(x: number, y: number): void {
    if (this.screen !== "PLAYING" || !this.runtime) {
      return;
    }
    this.runtime.onPointerMove(x, y);
  }

  onPointerUp(x: number, y: number, nowMs?: number): void {
    if (this.screen !== "PLAYING" || !this.runtime) {
      return;
    }
    this.runtime.onPointerUp(x, y, nowMs);
  }

  onPointerCancel(nowMs?: number): void {
    if (this.screen !== "PLAYING" || !this.runtime) {
      return;
    }
    this.runtime.onPointerCancel(nowMs);
  }

  update(deltaSeconds: number, viewport: RuntimeViewport, nowMs?: number): void {
    if (this.screen !== "PLAYING" || !this.runtime) {
      return;
    }

    this.runtime.update(deltaSeconds, viewport, nowMs);
    const status = this.runtime.getStatus();
    const now = Number.isFinite(nowMs) ? (nowMs as number) : Date.now();
    if (status.outcome === "FAILED") {
      const minimumMet = status.deliveredArtists >= status.sessionTargetSets;
      if (minimumMet) {
        if (this.shouldDelayEveningCompletion(status, now)) {
          return;
        }
        this.clearCompletionDelay();
        this.completeLevel(status);
        return;
      }
      this.clearCompletionDelay();
      this.levelManager.markLevelFailed(status.levelScore);
      this.setScreen("LEVEL_FAILED");
      return;
    }

    if (status.outcome === "COMPLETED") {
      if (this.shouldDelayEveningCompletion(status, now)) {
        return;
      }
      this.clearCompletionDelay();
      this.completeLevel(status);
      return;
    }

    this.clearCompletionDelay();
  }

  private mountRuntimeForActiveLevel(): void {
    const { currentLevel, attemptNumber } = this.levelManager.snapshot;
    const nextRuntime = this.createRuntime(currentLevel, attemptNumber);
    this.disposeRuntime();
    this.runtime = nextRuntime;
    this.runtime.onLayoutChanged(this.layout);
  }

  private disposeRuntime(): void {
    if (!this.runtime) {
      return;
    }
    this.runtime.dispose();
    this.runtime = null;
  }

  private setScreen(next: ScreenState): void {
    if (this.screen === next) {
      return;
    }
    const previous = this.screen;
    this.screen = next;
    this.onScreenChanged?.(next, previous);
  }

  private shouldDelayEveningCompletion(status: RuntimeStatus, nowMs: number): boolean {
    if (status.sessionIndexInDay !== 3) {
      return false;
    }

    const levelSnapshot = this.levelManager.snapshot;
    const nextKey = `${status.levelNumber}:${levelSnapshot.attemptKey}`;
    if (this.eveningCompletionDelayKey !== nextKey) {
      this.eveningCompletionDelayKey = nextKey;
      this.eveningCompletionDelayUntilMs =
        nowMs + GameManager.EVENING_COMPLETION_DELAY_MS;
    }

    const deadline = this.eveningCompletionDelayUntilMs;
    if (deadline === null) {
      return false;
    }
    return nowMs < deadline;
  }

  private clearCompletionDelay(): void {
    this.eveningCompletionDelayUntilMs = null;
    this.eveningCompletionDelayKey = null;
  }

  private completeLevel(status: RuntimeStatus): void {
    const encounterStrikesUsed = Math.max(
      0,
      Math.floor(status.maxEncounterStrikes - status.remainingLives)
    );
    this.levelManager.markLevelCompleted(status.levelScore, {
      deliveredArtists: status.deliveredArtists,
      missedArtists: status.missedArtists,
      incorrectStageArtists: status.incorrectStageArtists,
      encounterStrikesUsed
    });
    this.persistence?.recordLevelCompletion({
      levelNumber: this.levelManager.snapshot.currentLevel,
      totalLevels: this.levelManager.snapshot.totalLevels,
      levelScore: status.levelScore,
      cumulativeScore: this.levelManager.snapshot.cumulativeScore,
      festivalCompleted: this.levelManager.snapshot.state === "FESTIVAL_COMPLETE"
    });
    this.setScreen(
      this.levelManager.snapshot.state === "FESTIVAL_COMPLETE"
        ? "FESTIVAL_COMPLETE"
        : "LEVEL_COMPLETE"
    );
  }

  private getPersistenceSnapshot(): PersistenceSnapshot {
    if (!this.persistence) {
      return {
        highestUnlockedLevel: 1,
        bestFestivalScore: 0,
        bestLevelScores: {},
        settings: {
          musicVolume: 0.8,
          sfxVolume: 0.9
        }
      };
    }
    return this.persistence.getSnapshot();
  }
}
