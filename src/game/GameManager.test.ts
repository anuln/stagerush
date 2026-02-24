import { describe, expect, it } from "vitest";
import type { ResolvedFestivalLayout } from "../maps/MapLoader";
import { GameManager, type RuntimeController } from "./GameManager";
import type { RuntimeStatus } from "./GameRuntime";

class FakeRuntime implements RuntimeController {
  status: RuntimeStatus;
  disposed = false;

  constructor(levelNumber: number) {
    this.status = {
      levelNumber,
      levelScore: 0,
      outcome: "ACTIVE",
      remainingLives: 3,
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
    const manager = new GameManager({
      layout: makeLayout(2),
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

    manager.nextLevel();
    expect(manager.snapshot.screen).toBe("PLAYING");
    expect(manager.snapshot.level.currentLevel).toBe(2);

    runtimes[1].status.levelScore = 500;
    runtimes[1].status.outcome = "COMPLETED";
    manager.update(0.016, { width: 1000, height: 2000 }, 200);
    expect(manager.snapshot.screen).toBe("FESTIVAL_COMPLETE");
    expect(manager.snapshot.level.cumulativeScore).toBe(820);
  });
});
