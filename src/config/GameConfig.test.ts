import { describe, expect, it } from "vitest";
import { rollQualityTier } from "./GameConfig";

describe("GameConfig quality scaling", () => {
  it("degrades one tier when low-fps window threshold is met", () => {
    expect(
      rollQualityTier({
        currentTier: "high",
        averageFps: 46,
        lowWindowCount: 6,
        highWindowCount: 0
      })
    ).toBe("medium");
  });

  it("recovers one tier when high-fps window threshold is met", () => {
    expect(
      rollQualityTier({
        currentTier: "low",
        averageFps: 60,
        lowWindowCount: 0,
        highWindowCount: 8
      })
    ).toBe("medium");
  });

  it("keeps current tier when thresholds are not sustained", () => {
    expect(
      rollQualityTier({
        currentTier: "medium",
        averageFps: 52,
        lowWindowCount: 2,
        highWindowCount: 2
      })
    ).toBe("medium");
  });
});
