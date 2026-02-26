import { describe, expect, it } from "vitest";
import type { ResolvedFestivalLayout } from "../maps/MapLoader";
import { GameManager, type RuntimeController } from "./GameManager";
import type { RuntimeStatus } from "./GameRuntime";
import { RunPersistence, type StorageLike } from "../persistence/RunPersistence";

class FakeRuntime implements RuntimeController {
  status: RuntimeStatus;
  disposed = false;

  constructor(levelNumber: number) {
    this.status = {
      levelNumber,
      dayNumber: Math.ceil(levelNumber / 3),
      sessionName: "Morning",
      sessionIndexInDay: 1,
      totalFestivalDays: 1,
      sessionTargetSets: 8,
      paceDeltaSets: 0,
      levelScore: 0,
      outcome: "ACTIVE",
      performanceTier: null,
      deliveredArtists: 0,
      incorrectStageArtists: 0,
      missedArtists: 0,
      maxEncounterStrikes: 12,
      remainingLives: 3,
      remainingTimeSeconds: 60,
      totalArtists: 10,
      spawnedArtists: 0,
      resolvedArtists: 0
    };
  }

  onLayoutChanged(_layout: ResolvedFestivalLayout): void {}
  onPointerDown(_x: number, _y: number): boolean { return true; }
  onPointerMove(_x: number, _y: number): void {}
  onPointerUp(_x: number, _y: number): void {}
  onPointerCancel(): void {}
  update(): void {}
  getStatus(): RuntimeStatus {
    return this.status;
  }
  dispose(): void {
    this.disposed = true;
  }
}

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function makeLayout(totalLevels = 2): ResolvedFestivalLayout {
  return {
    map: {
      id: "fest",
      name: "Fest",
      description: "desc",
      totalLevels,
      background: "",
      stages: [],
      spawnPoints: [],
      distractions: [],
      levels: [],
      assets: {
        artists: [],
        stageSprites: {},
        distractionSprites: {},
        audio: {}
      }
    },
    viewport: { width: 1000, height: 2000 },
    stages: [],
    spawnPoints: [],
    distractions: []
  };
}

describe("GameManager", () => {
  it("transitions through fail -> retry flow", () => {
    const runtimes: FakeRuntime[] = [];
    const manager = new GameManager({
      layout: makeLayout(2),
      createRuntime: (levelNumber) => {
        const runtime = new FakeRuntime(levelNumber);
        runtimes.push(runtime);
        return runtime;
      }
    });

    manager.startFestival();
    expect(manager.snapshot.screen).toBe("PLAYING");
    expect(manager.snapshot.level.currentLevel).toBe(1);

    runtimes[0].status.outcome = "FAILED";
    manager.update(0.016, { width: 1000, height: 2000 }, 100);
    expect(manager.snapshot.screen).toBe("LEVEL_FAILED");

    manager.retryLevel();
    expect(manager.snapshot.screen).toBe("PLAYING");
    expect(manager.snapshot.level.attemptNumber).toBe(2);
    expect(runtimes[0].disposed).toBe(true);
    expect(runtimes).toHaveLength(2);
  });

  it("transitions level complete and festival complete with next-level action", () => {
    const runtimes: FakeRuntime[] = [];
    const persistence = new RunPersistence(new MemoryStorage());
    const manager = new GameManager({
      layout: makeLayout(2),
      persistence,
      createRuntime: (levelNumber) => {
        const runtime = new FakeRuntime(levelNumber);
        runtimes.push(runtime);
        return runtime;
      }
    });

    manager.startFestival();
    runtimes[0].status.levelScore = 320;
    runtimes[0].status.outcome = "COMPLETED";
    manager.update(0.016, { width: 1000, height: 2000 }, 100);
    expect(manager.snapshot.screen).toBe("LEVEL_COMPLETE");
    expect(manager.snapshot.level.cumulativeScore).toBe(320);

    manager.handleScreenAction("NEXT_LEVEL");
    expect(manager.snapshot.screen).toBe("PLAYING");
    expect(manager.snapshot.level.currentLevel).toBe(2);

    runtimes[1].status.levelScore = 500;
    runtimes[1].status.outcome = "COMPLETED";
    manager.update(0.016, { width: 1000, height: 2000 }, 200);
    expect(manager.snapshot.screen).toBe("FESTIVAL_COMPLETE");
    expect(manager.snapshot.level.cumulativeScore).toBe(820);
    expect(manager.snapshot.profile.bestFestivalScore).toBe(820);
    expect(manager.snapshot.profile.bestLevelScore).toBe(500);
  });

  it("delays evening session completion transition before showing wrap card", () => {
    const runtimes: FakeRuntime[] = [];
    const manager = new GameManager({
      layout: makeLayout(2),
      createRuntime: (levelNumber) => {
        const runtime = new FakeRuntime(levelNumber);
        runtime.status.sessionIndexInDay = 3;
        runtime.status.sessionName = "Evening";
        runtimes.push(runtime);
        return runtime;
      }
    });

    manager.startFestival();
    runtimes[0].status.levelScore = 300;
    runtimes[0].status.outcome = "COMPLETED";

    manager.update(0.016, { width: 1000, height: 2000 }, 100);
    expect(manager.snapshot.screen).toBe("PLAYING");
    expect(manager.snapshot.level.cumulativeScore).toBe(0);

    manager.update(0.016, { width: 1000, height: 2000 }, 3800);
    expect(manager.snapshot.screen).toBe("PLAYING");
    expect(manager.snapshot.level.cumulativeScore).toBe(0);

    manager.update(0.016, { width: 1000, height: 2000 }, 4200);
    expect(manager.snapshot.screen).toBe("LEVEL_COMPLETE");
    expect(manager.snapshot.level.cumulativeScore).toBe(300);
  });

  it("promotes failed outcome to completion when session minimum is already met", () => {
    const runtimes: FakeRuntime[] = [];
    const manager = new GameManager({
      layout: makeLayout(1),
      createRuntime: (levelNumber) => {
        const runtime = new FakeRuntime(levelNumber);
        runtime.status.sessionIndexInDay = 3;
        runtime.status.sessionName = "Evening";
        runtimes.push(runtime);
        return runtime;
      }
    });

    manager.startFestival();
    runtimes[0].status.levelScore = 980;
    runtimes[0].status.deliveredArtists = 8;
    runtimes[0].status.sessionTargetSets = 8;
    runtimes[0].status.outcome = "FAILED";

    manager.update(0.016, { width: 1000, height: 2000 }, 100);
    expect(manager.snapshot.screen).toBe("PLAYING");

    manager.update(0.016, { width: 1000, height: 2000 }, 4300);
    expect(manager.snapshot.screen).toBe("FESTIVAL_COMPLETE");
    expect(manager.snapshot.level.cumulativeScore).toBe(980);
  });

  it("uses screen actions for menu start and menu return", () => {
    const manager = new GameManager({
      layout: makeLayout(1),
      createRuntime: (levelNumber) => new FakeRuntime(levelNumber)
    });

    expect(manager.snapshot.screen).toBe("MENU");
    manager.handleScreenAction("START_FESTIVAL");
    expect(manager.snapshot.screen).toBe("PLAYING");

    manager.handleScreenAction("RETURN_TO_MENU");
    expect(manager.snapshot.screen).toBe("MENU");
  });

  it("supports repeated festival loops and persistence continuity across manager instances", () => {
    const storage = new MemoryStorage();
    const firstPersistence = new RunPersistence(storage);
    const firstRuntimes: FakeRuntime[] = [];
    const firstManager = new GameManager({
      layout: makeLayout(1),
      persistence: firstPersistence,
      createRuntime: (levelNumber) => {
        const runtime = new FakeRuntime(levelNumber);
        firstRuntimes.push(runtime);
        return runtime;
      }
    });

    firstManager.startFestival();
    firstRuntimes[0].status.levelScore = 700;
    firstRuntimes[0].status.outcome = "COMPLETED";
    firstManager.update(0.016, { width: 1000, height: 2000 }, 100);
    expect(firstManager.snapshot.screen).toBe("FESTIVAL_COMPLETE");

    firstManager.returnToMenu();
    expect(firstManager.snapshot.screen).toBe("MENU");
    expect(firstRuntimes[0].disposed).toBe(true);

    const secondPersistence = new RunPersistence(storage);
    const secondRuntimes: FakeRuntime[] = [];
    const secondManager = new GameManager({
      layout: makeLayout(1),
      persistence: secondPersistence,
      createRuntime: (levelNumber) => {
        const runtime = new FakeRuntime(levelNumber);
        secondRuntimes.push(runtime);
        return runtime;
      }
    });

    expect(secondManager.snapshot.profile.bestFestivalScore).toBe(700);
    secondManager.startFestival();
    expect(secondManager.snapshot.screen).toBe("PLAYING");
    expect(secondManager.snapshot.level.currentLevel).toBe(1);
    expect(secondRuntimes).toHaveLength(1);
  });
});
