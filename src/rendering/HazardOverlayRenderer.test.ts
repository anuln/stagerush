import { describe, expect, it } from "vitest";
import {
  buildHazardOverlaySummary,
  type HazardOverlayFrame
} from "./HazardOverlayRenderer";

const frame: HazardOverlayFrame = {
  chatPairs: [
    {
      artistA: { x: 100, y: 120 },
      artistB: { x: 130, y: 140 }
    }
  ],
  distractionZones: [
    {
      center: { x: 300, y: 200 },
      radius: 55,
      active: true
    },
    {
      center: { x: 400, y: 200 },
      radius: 50,
      active: false
    }
  ],
  blockedArtists: [
    {
      position: { x: 150, y: 150 },
      reason: "CHATTING"
    }
  ]
};

describe("HazardOverlayRenderer", () => {
  it("summarizes visible hazard signals for frame", () => {
    const summary = buildHazardOverlaySummary(frame);

    expect(summary.chatLines).toBe(1);
    expect(summary.activeDistractionZones).toBe(1);
    expect(summary.blockedMarkers).toBe(1);
  });
});
