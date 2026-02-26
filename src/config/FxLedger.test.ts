import { describe, expect, it } from "vitest";
import { resolveLevelFxProfile } from "./FxLedger";

describe("FxLedger", () => {
  it("resolves per-level profiles and preserves expected evening fireworks", () => {
    const level3 = resolveLevelFxProfile(3);
    const level6 = resolveLevelFxProfile(6);
    const level9 = resolveLevelFxProfile(9);

    expect(level3.sessionPeriod).toBe("evening");
    expect(level3.fireworks.enabled).toBe(true);
    expect(level3.fireworks.burstCountMin).toBe(3);
    expect(level6.fireworks.burstCountMax).toBeGreaterThan(level3.fireworks.burstCountMax);
    expect(level9.fireworks.burstCountMin).toBeGreaterThan(level6.fireworks.burstCountMin);
  });

  it("falls back to highest configured level for overflow level requests", () => {
    const overflow = resolveLevelFxProfile(99);
    const level9 = resolveLevelFxProfile(9);

    expect(overflow.levelNumber).toBe(99);
    expect(overflow.atmosphere.overlayColor).toBe(level9.atmosphere.overlayColor);
    expect(overflow.fireworks.enabled).toBe(level9.fireworks.enabled);
  });
});
