import { describe, expect, it } from "vitest";
import { ComboTracker } from "./ComboTracker";

describe("ComboTracker", () => {
  it("starts a new chain at 1.0x for first delivery", () => {
    const tracker = new ComboTracker();

    const result = tracker.registerDelivery("main-stage", 1000);

    expect(result.chainLength).toBe(1);
    expect(result.multiplier).toBe(1);
    expect(result.expiresAtMs).toBe(6000);
  });

  it("increments chain and escalates multiplier when delivery is inside combo window", () => {
    const tracker = new ComboTracker();

    tracker.registerDelivery("main-stage", 1000);
    const second = tracker.registerDelivery("main-stage", 4000);
    const third = tracker.registerDelivery("main-stage", 7000);
    const fourth = tracker.registerDelivery("main-stage", 9000);
    const fifth = tracker.registerDelivery("main-stage", 11000);

    expect(second).toMatchObject({ chainLength: 2, multiplier: 1.5 });
    expect(third).toMatchObject({ chainLength: 3, multiplier: 2 });
    expect(fourth).toMatchObject({ chainLength: 4, multiplier: 3 });
    expect(fifth).toMatchObject({ chainLength: 5, multiplier: 3 });
  });

  it("resets chain when delivery misses combo window", () => {
    const tracker = new ComboTracker();

    tracker.registerDelivery("main-stage", 1000);
    const reset = tracker.registerDelivery("main-stage", 7001);

    expect(reset).toMatchObject({ chainLength: 1, multiplier: 1 });
  });

  it("tracks chain state independently per stage", () => {
    const tracker = new ComboTracker();

    tracker.registerDelivery("main-stage", 1000);
    tracker.registerDelivery("tent-stage", 1200);
    const mainSecond = tracker.registerDelivery("main-stage", 3000);
    const tentSecond = tracker.registerDelivery("tent-stage", 3500);

    expect(mainSecond).toMatchObject({ chainLength: 2, multiplier: 1.5 });
    expect(tentSecond).toMatchObject({ chainLength: 2, multiplier: 1.5 });
  });

  it("returns active combos that are still in-window and have multiplier pressure", () => {
    const tracker = new ComboTracker();

    tracker.registerDelivery("main-stage", 1000);
    tracker.registerDelivery("main-stage", 3000);
    tracker.registerDelivery("small-stage", 3200);
    tracker.registerDelivery("small-stage", 3400);
    tracker.registerDelivery("small-stage", 3600);

    const active = tracker.getActiveChains(7000);
    const expired = tracker.getActiveChains(9000);

    expect(active).toHaveLength(2);
    expect(active).toEqual([
      {
        stageId: "main-stage",
        chainLength: 2,
        multiplier: 1.5,
        expiresAtMs: 8000
      },
      {
        stageId: "small-stage",
        chainLength: 3,
        multiplier: 2,
        expiresAtMs: 8600
      }
    ]);
    expect(expired).toHaveLength(0);
  });

  it("breaks all active chains when a miss penalty occurs", () => {
    const tracker = new ComboTracker();

    tracker.registerDelivery("main-stage", 1000);
    tracker.registerDelivery("main-stage", 3000);
    expect(tracker.getActiveChains(4000)).toHaveLength(1);

    tracker.breakAllChains();
    expect(tracker.getActiveChains(4000)).toHaveLength(0);
  });
});
