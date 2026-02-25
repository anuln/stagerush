import { describe, expect, it } from "vitest";
import { LivesState } from "./LivesState";

describe("LivesState", () => {
  it("starts at configured budget and fails at zero", () => {
    const lives = new LivesState(3);

    expect(lives.remainingLives).toBe(3);
    expect(lives.isLevelFailed).toBe(false);

    lives.recordIncident();
    lives.recordIncident();
    expect(lives.remainingLives).toBe(1);
    expect(lives.isLevelFailed).toBe(false);

    lives.recordIncident();
    expect(lives.remainingLives).toBe(0);
    expect(lives.isLevelFailed).toBe(true);
  });

  it("does not go below zero", () => {
    const lives = new LivesState(1);
    lives.recordIncident();
    lives.recordIncident();
    expect(lives.remainingLives).toBe(0);
  });
});
