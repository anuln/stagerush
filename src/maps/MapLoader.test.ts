import { describe, expect, it } from "vitest";
import type { FestivalMap } from "../config/FestivalConfig";
import {
  driftAngleToUnitVector,
  normalizedToScreen,
  parseFestivalMapData,
  resolveFestivalLayout
} from "./MapLoader";

const baseMap: FestivalMap = {
  id: "govball2026",
  name: "Gov Ball 2026",
  description: "test fixture",
  totalLevels: 10,
  background: "maps/govball/bg.png",
  stages: [
    {
      id: "main",
      size: "large",
      position: { x: 0.2, y: 0.25 },
      snapRadius: 0.06,
      sprite: "maps/govball/stage_main.png",
      color: "#FF6B35"
    },
    {
      id: "side",
      size: "medium",
      position: { x: 0.75, y: 0.5 },
      snapRadius: 0.05,
      sprite: "maps/govball/stage_side.png",
      color: "#00D4FF"
    }
  ],
  spawnPoints: [
    { id: "north", position: { x: 0.5, y: 0 }, driftAngle: 180 },
    { id: "east", position: { x: 1, y: 0.4 }, driftAngle: 250 }
  ],
  distractions: [],
  levels: [],
  assets: {
    artists: [],
    stageSprites: {},
    distractionSprites: {},
    audio: {}
  }
};

describe("MapLoader", () => {
  it("maps normalized points into viewport coordinates", () => {
    const point = normalizedToScreen({ x: 0.25, y: 0.5 }, { width: 1080, height: 1920 });
    expect(point).toEqual({ x: 270, y: 960 });
  });

  it("rejects out-of-bounds normalized coordinates", () => {
    expect(() =>
      normalizedToScreen({ x: 1.2, y: 0.5 }, { width: 100, height: 100 })
    ).toThrowError(/normalized number/i);
  });

  it("parses and validates FestivalMap payload", () => {
    const parsed = parseFestivalMapData(baseMap);
    expect(parsed.id).toBe("govball2026");
    expect(parsed.stages).toHaveLength(2);
    expect(parsed.spawnPoints).toHaveLength(2);
  });

  it("resolves stage and spawn layout using viewport", () => {
    const layout = resolveFestivalLayout(baseMap, { width: 1080, height: 1920 });
    expect(layout.stages[0].screenPosition).toEqual({ x: 216, y: 480 });
    expect(layout.spawnPoints[0].screenPosition).toEqual({ x: 540, y: 0 });
    expect(layout.spawnPoints[0].directionVector.x).toBeCloseTo(-1, 5);
    expect(layout.spawnPoints[0].directionVector.y).toBeCloseTo(0, 5);
  });

  it("converts drift angle to unit vector", () => {
    const vector = driftAngleToUnitVector(90);
    expect(vector.x).toBeCloseTo(0, 5);
    expect(vector.y).toBeCloseTo(1, 5);
  });
});
