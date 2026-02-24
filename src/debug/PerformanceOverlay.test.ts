import { describe, expect, it } from "vitest";
import {
  formatPerformanceOverlayLines,
  type RuntimeTelemetrySnapshot
} from "./PerformanceOverlay";

describe("PerformanceOverlay", () => {
  it("formats stable telemetry lines for profiling HUD", () => {
    const telemetry: RuntimeTelemetrySnapshot = {
      frameDeltaMs: 16.6,
      updateDurationMs: 3.4,
      activeArtists: 4,
      spawnedArtists: 12,
      resolvedArtists: 8,
      activeDistractions: 2,
      activePaths: 3,
      runtimeOutcome: "ACTIVE",
      qualityTier: "medium",
      rendererResolution: 1.25,
      averageFps: 56.8
    };

    expect(formatPerformanceOverlayLines(telemetry)).toEqual([
      "FPS 56.8 | Q medium @1.25x",
      "Frame 16.6ms | Update 3.4ms",
      "Artists 4 active (12/8)",
      "Paths 3 | Distractions 2 | ACTIVE"
    ]);
  });
});
