import { describe, expect, it } from "vitest";
import { ScoreManager } from "./ScoreManager";

describe("ScoreManager", () => {
  it("applies tier-stage score matrix exactly", () => {
    const manager = new ScoreManager();

    const cases: Array<[
      tier: "headliner" | "midtier" | "newcomer",
      size: "large" | "medium" | "small",
      expected: number
    ]> = [
      ["headliner", "large", 300],
      ["headliner", "medium", 200],
      ["headliner", "small", 100],
      ["midtier", "large", 100],
      ["midtier", "medium", 300],
      ["midtier", "small", 200],
      ["newcomer", "large", 50],
      ["newcomer", "medium", 100],
      ["newcomer", "small", 300]
    ];

    for (const [tier, size, expected] of cases) {
      const event = manager.registerDelivery({
        artistId: `${tier}-${size}`,
        artistTier: tier,
        stageId: `stage-${size}`,
        stageSize: size,
        stageColor: "#ffffff",
        stagePosition: { x: 0, y: 0 },
        completedAtMs: 100
      });
      expect(event.awardedPoints).toBe(expected);
    }
  });

  it("tracks cumulative total and exposes latest score event", () => {
    const manager = new ScoreManager();

    const first = manager.registerDelivery({
      artistId: "a1",
      artistTier: "headliner",
      stageId: "main-stage",
      stageSize: "large",
      stageColor: "#FF6B35",
      stagePosition: { x: 300, y: 120 },
      completedAtMs: 100
    });
    const second = manager.registerDelivery({
      artistId: "a2",
      artistTier: "newcomer",
      stageId: "small-stage",
      stageSize: "small",
      stageColor: "#7BFF00",
      stagePosition: { x: 80, y: 220 },
      completedAtMs: 200
    });

    expect(first.totalScore).toBe(300);
    expect(second.totalScore).toBe(600);
    expect(manager.totalScore).toBe(600);
    expect(manager.latestEvent).toEqual(second);
  });
});
