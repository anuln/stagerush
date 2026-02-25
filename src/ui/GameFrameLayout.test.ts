import { describe, expect, it } from "vitest";
import { resolveGameFrameLayout } from "./GameFrameLayout";

describe("resolveGameFrameLayout", () => {
  it("scales to fill a phone viewport while preserving aspect ratio", () => {
    const metrics = resolveGameFrameLayout({
      viewportWidth: 1080,
      viewportHeight: 1920,
      isMobile: true
    });

    expect(metrics.logicalWidth).toBe(432);
    expect(metrics.logicalHeight).toBe(768);
    expect(metrics.displayWidth).toBe(1080);
    expect(metrics.displayHeight).toBe(1920);
    expect(metrics.scale).toBeCloseTo(2.5);
  });

  it("caps desktop preview scale so it stays mobile-sized on large screens", () => {
    const metrics = resolveGameFrameLayout({
      viewportWidth: 1600,
      viewportHeight: 900,
      isMobile: false
    });

    expect(metrics.displayWidth).toBe(432);
    expect(metrics.displayHeight).toBe(768);
    expect(metrics.scale).toBe(1);
  });

  it("shrinks below base size when viewport is smaller than the mobile frame", () => {
    const metrics = resolveGameFrameLayout({
      viewportWidth: 360,
      viewportHeight: 640,
      isMobile: false
    });

    expect(metrics.displayWidth).toBe(360);
    expect(metrics.displayHeight).toBe(640);
    expect(metrics.scale).toBeCloseTo(0.833333, 3);
  });
});
