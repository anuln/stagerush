import { describe, expect, it } from "vitest";
import { pathLength, resampleBySpacing, smoothCatmullRom } from "./Spline";

describe("Spline", () => {
  it("smooths raw points and preserves endpoints", () => {
    const raw = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 }
    ];

    const smoothed = smoothCatmullRom(raw, 8);
    expect(smoothed.length).toBeGreaterThan(raw.length);
    expect(smoothed[0]).toEqual(raw[0]);
    expect(smoothed[smoothed.length - 1]).toEqual(raw[raw.length - 1]);
  });

  it("resamples points by uniform spacing", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    ];
    const resampled = resampleBySpacing(points, 10);
    expect(resampled.length).toBe(11);
    expect(pathLength(resampled)).toBeCloseTo(100, 4);
  });
});
