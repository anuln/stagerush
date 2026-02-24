import type { ResolvedFestivalLayout } from "../maps/MapLoader";
import type { RuntimeStatus, RuntimeViewport } from "./GameRuntime";
import { LevelManager, type LevelManagerSnapshot } from "./LevelManager";
import type { ScreenActionId } from "../ui/ScreenState";

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
}

export interface GameManagerSnapshot {
  screen: ScreenState;
  level: LevelManagerSnapshot;
}

export class GameManager {
  private layout: ResolvedFestivalLayout;
  private readonly createRuntime: GameManagerOptions["createRuntime"];
  private readonly levelManager: LevelManager;
  private runtime: RuntimeController | null = null;
  private screen: ScreenState = "MENU";

  constructor(options: GameManagerOptions) {
    this.layout = options.layout;
    this.createRuntime = options.createRuntime;
    this.levelManager = new LevelManager({
      totalLevels: Math.max(1, options.layout.map.totalLevels || 1)
    });
  }

  get snapshot(): GameManagerSnapshot {
    return {
      screen: this.screen,
      level: this.levelManager.snapshot
    };
  }

  startFestival(): void {
    this.levelManager.startFestival();
    this.mountRuntimeForActiveLevel();
    this.screen = "PLAYING";
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
    this.screen = "PLAYING";
    return true;
  }

  nextLevel(): boolean {
    const advanced = this.levelManager.advanceToNextLevel();
    if (!advanced) {
      return false;
    }

    this.mountRuntimeForActiveLevel();
    this.screen = "PLAYING";
    return true;
  }

  returnToMenu(): void {
    this.disposeRuntime();
    this.levelManager.resetToMenu();
    this.screen = "MENU";
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
    if (status.outcome === "FAILED") {
      this.levelManager.markLevelFailed(status.levelScore);
      this.screen = "LEVEL_FAILED";
      return;
    }

    if (status.outcome === "COMPLETED") {
      this.levelManager.markLevelCompleted(status.levelScore);
      this.screen =
        this.levelManager.snapshot.state === "FESTIVAL_COMPLETE"
          ? "FESTIVAL_COMPLETE"
          : "LEVEL_COMPLETE";
    }
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
}
