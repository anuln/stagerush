import { describe, expect, it } from "vitest";
import { LivesState } from "./LivesState";

describe("LivesState", () => {
  it("starts at 3 lives and fails level at zero", () => {
    const lives = new LivesState(3);

    expect(lives.remainingLives).toBe(3);
    expect(lives.isLevelFailed).toBe(false);

    lives.recordMiss();
    lives.recordMiss();
    expect(lives.remainingLives).toBe(1);
    expect(lives.isLevelFailed).toBe(false);

    lives.recordMiss();
    expect(lives.remainingLives).toBe(0);
    expect(lives.isLevelFailed).toBe(true);
  });

  it("does not go below zero", () => {
    const lives = new LivesState(1);
    lives.recordMiss();
    lives.recordMiss();
    expect(lives.remainingLives).toBe(0);
  });
});
