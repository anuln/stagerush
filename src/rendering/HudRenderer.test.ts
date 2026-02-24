import { describe, expect, it } from "vitest";
import { buildHudLabels } from "./HudRenderer";

describe("HudRenderer", () => {
  it("formats score, lives, and level labels", () => {
    const labels = buildHudLabels({
      score: 1234,
      remainingLives: 2,
      levelNumber: 4,
      comboMultiplier: null
    });

    expect(labels.score).toBe("Score: 1234");
    expect(labels.lives).toBe("Lives: 2");
    expect(labels.level).toBe("Level 4");
    expect(labels.combo).toBeNull();
  });

  it("clamps lives at zero for display", () => {
    const labels = buildHudLabels({
      score: 0,
      remainingLives: -1,
      levelNumber: 1,
      comboMultiplier: null
    });

    expect(labels.lives).toBe("Lives: 0");
  });

  it("formats combo pressure label when active multiplier exists", () => {
    const labels = buildHudLabels({
      score: 900,
      remainingLives: 3,
      levelNumber: 2,
      comboMultiplier: 2
    });

    expect(labels.combo).toBe("Combo: 2.0x");
  });
});
