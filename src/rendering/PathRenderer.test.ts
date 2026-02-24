import { describe, expect, it } from "vitest";
import type { PathState } from "../entities/PathState";
import { advancePathLifecycles } from "./PathRenderer";

function buildPath(partial: Partial<PathState>): PathState {
  return {
    id: partial.id ?? "path-1",
    artistId: partial.artistId ?? "artist-1",
    rawPoints: partial.rawPoints ?? [
      { x: 0, y: 0 },
      { x: 10, y: 0 }
    ],
    smoothedPoints: partial.smoothedPoints ?? [
      { x: 0, y: 0 },
      { x: 10, y: 0 }
    ],
    length: partial.length ?? 10,
    targetStageId: partial.targetStageId ?? "stage-1",
    stageColor: partial.stageColor ?? "#ffffff",
    state: partial.state ?? "ACTIVE",
    consumedLength: partial.consumedLength ?? 0,
    alpha: partial.alpha ?? 1,
    createdAtMs: partial.createdAtMs ?? 0,
    expiresAtMs: partial.expiresAtMs ?? null
  };
}

describe("advancePathLifecycles", () => {
  it("fades invalid paths over time and removes after expiry", () => {
    const path = buildPath({
      state: "INVALID_FADING",
      targetStageId: null,
      expiresAtMs: 500,
      createdAtMs: 0
    });

    const midway = advancePathLifecycles([path], 250, 500);
    expect(midway).toHaveLength(1);
    expect(midway[0].alpha).toBeCloseTo(0.5, 2);

    const done = advancePathLifecycles(midway, 600, 500);
    expect(done).toHaveLength(0);
  });

  it("keeps active snapped paths visible", () => {
    const path = buildPath({ state: "ACTIVE", targetStageId: "stage-1" });
    const next = advancePathLifecycles([path], 1000, 500);

    expect(next).toHaveLength(1);
    expect(next[0].state).toBe("ACTIVE");
    expect(next[0].alpha).toBe(1);
  });
});
