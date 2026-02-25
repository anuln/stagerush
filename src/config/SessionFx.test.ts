import { describe, expect, it } from "vitest";
import {
  normalizeSessionPeriod,
  resolveSessionFxProfile,
  resolveSessionPreviewMode
} from "./SessionFx";

describe("SessionFx", () => {
  it("normalizes session period from name or index", () => {
    expect(normalizeSessionPeriod("Morning Session", 1)).toBe("morning");
    expect(normalizeSessionPeriod("Afternoon", 2)).toBe("afternoon");
    expect(normalizeSessionPeriod("Evening Show", 3)).toBe("evening");
    expect(normalizeSessionPeriod("", 2)).toBe("afternoon");
    expect(normalizeSessionPeriod("", 99)).toBe("morning");
  });

  it("resolves preview mode safely", () => {
    expect(resolveSessionPreviewMode("morning")).toBe("morning");
    expect(resolveSessionPreviewMode("AFTERNOON")).toBe("afternoon");
    expect(resolveSessionPreviewMode("evening")).toBe("evening");
    expect(resolveSessionPreviewMode("unknown")).toBe("auto");
  });

  it("clamps and sanitizes profile overrides", () => {
    const profile = resolveSessionFxProfile(
      {
        evening: {
          overlayColor: "#334477",
          overlayOpacity: 2,
          particleColor: "bad",
          particleCount: 200,
          particleSpeed: 2,
          stageGlow: -1
        }
      },
      "evening"
    );
    expect(profile.overlayColor).toBe("#334477");
    expect(profile.overlayOpacity).toBe(0.6);
    expect(profile.particleColor).toBe("#FFC875");
    expect(profile.particleCount).toBe(80);
    expect(profile.particleSpeed).toBe(4);
    expect(profile.stageGlow).toBe(0);
  });
});

