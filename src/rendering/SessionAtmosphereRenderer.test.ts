import { describe, expect, it } from "vitest";
import { shouldTriggerFinaleCountdownFireworks } from "./SessionAtmosphereRenderer";

describe("shouldTriggerFinaleCountdownFireworks", () => {
  it("triggers only in day 3 evening during the last 15 seconds", () => {
    expect(
      shouldTriggerFinaleCountdownFireworks({
        levelNumber: 9,
        dayNumber: 3,
        sessionIndexInDay: 3,
        outcome: "ACTIVE",
        remainingTimeSeconds: 14.9
      })
    ).toBe(true);
  });

  it("does not trigger for non-finale sessions or when too early", () => {
    expect(
      shouldTriggerFinaleCountdownFireworks({
        levelNumber: 6,
        dayNumber: 2,
        sessionIndexInDay: 3,
        outcome: "ACTIVE",
        remainingTimeSeconds: 12
      })
    ).toBe(false);
    expect(
      shouldTriggerFinaleCountdownFireworks({
        levelNumber: 9,
        dayNumber: 3,
        sessionIndexInDay: 3,
        outcome: "ACTIVE",
        remainingTimeSeconds: 22
      })
    ).toBe(false);
  });

  it("does not trigger when the runtime is failed", () => {
    expect(
      shouldTriggerFinaleCountdownFireworks({
        levelNumber: 9,
        dayNumber: 3,
        sessionIndexInDay: 3,
        outcome: "FAILED",
        remainingTimeSeconds: 5
      })
    ).toBe(false);
  });
});
