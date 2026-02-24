import { describe, expect, it } from "vitest";
import { PathPlanner } from "./PathPlanner";

describe("PathPlanner", () => {
  const stages = [
    {
      id: "main-stage",
      size: "large" as const,
      position: { x: 0.2, y: 0.25 },
      snapRadius: 0.1,
      sprite: "",
      color: "#FF6B35",
      screenPosition: { x: 300, y: 200 },
      pixelWidth: 100,
      pixelHeight: 80
    }
  ];

  it("snaps endpoint to nearest stage within radius", () => {
    const planner = new PathPlanner(stages, { snapRadiusPx: 80, smoothingSteps: 6, resampleSpacingPx: 12 });
    const planned = planner.finalizeSession({
      artistId: "a1",
      rawPoints: [
        { x: 50, y: 50 },
        { x: 120, y: 90 },
        { x: 280, y: 190 }
      ],
      startedAtMs: 0,
      endedAtMs: 1000
    });

    expect(planned.isValid).toBe(true);
    expect(planned.targetStageId).toBe("main-stage");
    expect(planned.smoothedPoints.at(-1)).toEqual({ x: 300, y: 200 });
    expect(planned.length).toBeGreaterThan(0);
  });

  it("keeps endpoint unsnapped when no stage is nearby", () => {
    const planner = new PathPlanner(stages, { snapRadiusPx: 40, smoothingSteps: 6, resampleSpacingPx: 12 });
    const planned = planner.finalizeSession({
      artistId: "a1",
      rawPoints: [
        { x: 50, y: 50 },
        { x: 120, y: 90 },
        { x: 200, y: 120 }
      ],
      startedAtMs: 0,
      endedAtMs: 1000
    });

    expect(planned.isValid).toBe(false);
    expect(planned.targetStageId).toBeNull();
  });

  it("returns deterministic output for identical input", () => {
    const planner = new PathPlanner(stages, { snapRadiusPx: 80, smoothingSteps: 6, resampleSpacingPx: 12 });
    const session = {
      artistId: "a1",
      rawPoints: [
        { x: 80, y: 40 },
        { x: 160, y: 90 },
        { x: 290, y: 195 }
      ],
      startedAtMs: 0,
      endedAtMs: 900
    };

    const a = planner.finalizeSession(session);
    const b = planner.finalizeSession(session);

    expect(b).toEqual(a);
  });
});
