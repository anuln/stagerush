import { describe, expect, it } from "vitest";
import { buildHudLabels } from "./HudRenderer";

describe("HudRenderer", () => {
  it("formats score, lives, and level labels", () => {
    const labels = buildHudLabels({
      score: 1234,
      remainingLives: 2,
      levelNumber: 4
    });

    expect(labels.score).toBe("Score: 1234");
    expect(labels.lives).toBe("Lives: 2");
    expect(labels.level).toBe("Level 4");
  });

  it("clamps lives at zero for display", () => {
    const labels = buildHudLabels({
      score: 0,
      remainingLives: -1,
      levelNumber: 1
    });

    expect(labels.lives).toBe("Lives: 0");
  });
});
