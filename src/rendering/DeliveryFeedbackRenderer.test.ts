import { describe, expect, it } from "vitest";
import {
  buildHazardBubbleText,
  buildScorePopupText
} from "./DeliveryFeedbackRenderer";

describe("DeliveryFeedbackRenderer", () => {
  it("formats plain score popup without combo metadata", () => {
    expect(buildScorePopupText({ awardedPoints: 300, comboMultiplier: 1 })).toBe("+300");
  });

  it("formats combo-enriched score popup when multiplier is active", () => {
    expect(buildScorePopupText({ awardedPoints: 450, comboMultiplier: 1.5 })).toBe(
      "+450 (1.5x)"
    );
  });

  it("formats hazard thought-bubble labels by hazard type", () => {
    expect(buildHazardBubbleText("chat")).toBe("...");
    expect(buildHazardBubbleText("distraction")).toBe("!");
  });
});
