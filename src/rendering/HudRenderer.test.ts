import { describe, expect, it } from "vitest";
import { buildHudLabels } from "./HudRenderer";

describe("HudRenderer", () => {
  it("formats score, encounter budget, timer, and level labels", () => {
    const labels = buildHudLabels({
      score: 1234,
      remainingLives: 2,
      maxLives: 12,
      remainingTimeSeconds: 47.2,
      sessionDurationSeconds: 60,
      dayNumber: 2,
      sessionName: "Afternoon",
      setsPlayed: 6,
      targetSets: 10,
      comboMultiplier: null
    });

    expect(labels.festivalHype).toBe("HYPE 1.2K");
    expect(labels.safetyStrikes).toBe("STRIKES 10/12");
    expect(labels.sessionTime).toBe("TIME 48s");
    expect(labels.daySession).toBe("DAY 2 · AFTERNOON");
    expect(labels.setsProgress).toBe("SETS 6/10");
    expect(labels.pace).toBe("PACE +4 AHEAD");
    expect(labels.stageHeat).toBeNull();
  });

  it("clamps encounter budget and timer at zero for display", () => {
    const labels = buildHudLabels({
      score: 0,
      remainingLives: -1,
      maxLives: 12,
      remainingTimeSeconds: -3,
      sessionDurationSeconds: 60,
      dayNumber: 1,
      sessionName: "Morning",
      setsPlayed: 0,
      targetSets: 8,
      comboMultiplier: null
    });

    expect(labels.safetyStrikes).toBe("STRIKES 12/12");
    expect(labels.sessionTime).toBe("TIME 0s");
  });

  it("formats combo pressure label when active multiplier exists", () => {
    const labels = buildHudLabels({
      score: 900,
      remainingLives: 3,
      maxLives: 12,
      remainingTimeSeconds: 30,
      sessionDurationSeconds: 60,
      dayNumber: 1,
      sessionName: "Evening",
      setsPlayed: 4,
      targetSets: 8,
      comboMultiplier: 2
    });

    expect(labels.stageHeat).toBe("HEAT 2.0x");
  });
});
