import { describe, expect, it } from "vitest";
import { LevelManager } from "./LevelManager";

describe("LevelManager", () => {
  it("starts at level one and enters playing state", () => {
    const manager = new LevelManager({ totalLevels: 3 });

    manager.startFestival();

    expect(manager.snapshot).toMatchObject({
      state: "PLAYING",
      currentLevel: 1,
      totalLevels: 3,
      attemptNumber: 1,
      cumulativeScore: 0
    });
  });

  it("supports fail then retry on same level", () => {
    const manager = new LevelManager({ totalLevels: 2 });
    manager.startFestival();

    manager.markLevelFailed(120);
    const retried = manager.retryLevel();

    expect(retried).toBe(true);
    expect(manager.snapshot).toMatchObject({
      state: "PLAYING",
      currentLevel: 1,
      attemptNumber: 2,
      lastLevelScore: null
    });
  });

  it("tracks cumulative score across completed levels", () => {
    const manager = new LevelManager({ totalLevels: 2 });
    manager.startFestival();

    manager.markLevelCompleted(350);
    expect(manager.snapshot).toMatchObject({
      state: "LEVEL_COMPLETE",
      cumulativeScore: 350,
      lastLevelScore: 350
    });

    const advanced = manager.advanceToNextLevel();
    expect(advanced).toBe(true);
    expect(manager.snapshot.state).toBe("PLAYING");

    manager.markLevelCompleted(450);
    expect(manager.snapshot).toMatchObject({
      state: "FESTIVAL_COMPLETE",
      cumulativeScore: 800,
      lastLevelScore: 450
    });
  });

  it("allows retrying from completed states without resetting cumulative progress", () => {
    const manager = new LevelManager({ totalLevels: 2 });
    manager.startFestival();

    manager.markLevelCompleted(300);
    expect(manager.snapshot).toMatchObject({
      state: "LEVEL_COMPLETE",
      cumulativeScore: 300,
      lastLevelScore: 300
    });

    const retriedLevelComplete = manager.retryLevel();
    expect(retriedLevelComplete).toBe(true);
    expect(manager.snapshot).toMatchObject({
      state: "PLAYING",
      cumulativeScore: 300,
      lastLevelScore: null
    });

    manager.markLevelCompleted(340);
    manager.advanceToNextLevel();
    manager.markLevelCompleted(520);
    expect(manager.snapshot.state).toBe("FESTIVAL_COMPLETE");
    expect(manager.snapshot.cumulativeScore).toBe(1160);

    const retriedFestivalComplete = manager.retryLevel();
    expect(retriedFestivalComplete).toBe(true);
    expect(manager.snapshot).toMatchObject({
      state: "PLAYING",
      currentLevel: 2,
      cumulativeScore: 1160,
      lastLevelScore: null
    });
  });
});
