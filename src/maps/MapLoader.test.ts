import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { FestivalMap } from "../config/FestivalConfig";
import {
  collectMapAssetPaths,
  driftAngleToUnitVector,
  normalizedToScreen,
  parseFestivalMapData,
  resolveAssetPath,
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
  distractions: [
    {
      id: "merch1",
      type: "merch_stand",
      position: { x: 0.45, y: 0.5 },
      radius: 0.08,
      delay: 2,
      appearsAtLevel: 1,
      sprite: "maps/govball/distraction_merch.png"
    }
  ],
  levels: [
    {
      levelNumber: 1,
      totalArtists: 12,
      maxSimultaneous: 2,
      timerRange: [12, 20],
      tierWeights: { headliner: 0.2, midtier: 0.4, newcomer: 0.4 },
      activeDistractions: ["merch1"],
      spawnInterval: [1400, 2000]
    }
  ],
  assets: {
    artists: [
      {
        id: "new-a",
        name: "New A",
        tier: "newcomer",
        sprites: {
          walk: ["artists/new_a_walk1.png", "artists/new_a_walk2.png"],
          idle: "artists/new_a_idle.png",
          performing: "artists/new_a_perform.png"
        }
      }
    ],
    stageSprites: {
      main: "maps/govball/stage_main.png",
      side: "maps/govball/stage_side.png"
    },
    distractionSprites: {
      merch_stand: "maps/govball/distraction_merch.png"
    },
    audio: {
      spawn: "audio/spawn.mp3"
    }
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

  it("normalizes asset paths to public-rooted URLs", () => {
    expect(resolveAssetPath("assets/maps/govball/stage_main.png")).toBe(
      "/assets/maps/govball/stage_main.png"
    );
    expect(resolveAssetPath("/assets/maps/govball/stage_main.png")).toBe(
      "/assets/maps/govball/stage_main.png"
    );
  });

  it("preserves data/blob asset URLs", () => {
    expect(resolveAssetPath("data:image/png;base64,AAAA")).toBe(
      "data:image/png;base64,AAAA"
    );
    expect(resolveAssetPath("blob:https://example.com/abc")).toBe(
      "blob:https://example.com/abc"
    );
  });

  it("validates full Gov Ball config structure from disk", () => {
    const file = resolve(process.cwd(), "public/assets/maps/govball/config.json");
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as unknown;
    const map = parseFestivalMapData(parsed);

    expect(map.id).toBe("govball2026");
    expect(map.totalLevels).toBe(10);
    expect(map.levels).toHaveLength(10);
    expect(map.distractions.length).toBeGreaterThanOrEqual(6);
    expect(map.assets.artists.length).toBeGreaterThanOrEqual(9);
    expect(map.assets.audio["level_complete"]).toBeDefined();
    expect(map.levels[9].activeDistractions.length).toBeGreaterThan(0);
  });

  it("collects unique asset paths across map references", () => {
    const paths = collectMapAssetPaths(baseMap);

    expect(paths).toContain("maps/govball/bg.png");
    expect(paths).toContain("maps/govball/stage_main.png");
    expect(paths).toContain("artists/new_a_walk1.png");
    expect(paths).toContain("audio/spawn.mp3");
    expect(new Set(paths).size).toBe(paths.length);
  });
});
