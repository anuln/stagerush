import { describe, expect, it } from "vitest";
import type { FestivalMap } from "../config/FestivalConfig";
import { resolveLevelRuntimeConfig } from "./LevelProgression";

function makeMap(): FestivalMap {
  return {
    id: "fest",
    name: "Fest",
    description: "desc",
    totalLevels: 8,
    background: "",
    stages: [
      {
        id: "main",
        size: "large",
        position: { x: 0.2, y: 0.3 },
        snapRadius: 0.05,
        sprite: "",
        color: "#ff0000"
      },
      {
        id: "side",
        size: "small",
        position: { x: 0.7, y: 0.8 },
        snapRadius: 0.05,
        sprite: "",
        color: "#00ff00"
      }
    ],
    spawnPoints: [
      { id: "north", position: { x: 0.5, y: 0 }, driftAngle: 180 },
      { id: "south", position: { x: 0.5, y: 1 }, driftAngle: 0 }
    ],
    distractions: [
      {
        id: "merch",
        type: "merch_stand",
        position: { x: 0.3, y: 0.5 },
        radius: 0.08,
        delay: 2,
        appearsAtLevel: 2,
        sprite: ""
      },
      {
        id: "fans",
        type: "fan_crowd",
        position: { x: 0.6, y: 0.4 },
        radius: 0.1,
        delay: 3,
        appearsAtLevel: 4,
        sprite: ""
      }
    ],
    levels: [],
    assets: {
      artists: [],
      stageSprites: {},
      distractionSprites: {},
      audio: {}
    }
  };
}

describe("resolveLevelRuntimeConfig", () => {
  it("returns deterministic config for same level and attempt", () => {
    const map = makeMap();
    const first = resolveLevelRuntimeConfig(map, 3, 2);
    const second = resolveLevelRuntimeConfig(map, 3, 2);

    expect(first).toEqual(second);
  });

  it("changes randomized attempt outputs while keeping level bounds", () => {
    const map = makeMap();
    const first = resolveLevelRuntimeConfig(map, 3, 1);
    const second = resolveLevelRuntimeConfig(map, 3, 2);

    expect(first.levelNumber).toBe(3);
    expect(second.levelNumber).toBe(3);
    expect(first.spawnIntervalMs).not.toEqual(second.spawnIntervalMs);
  });

  it("applies escalation between earlier and later levels", () => {
    const map = makeMap();
    const level1 = resolveLevelRuntimeConfig(map, 1, 1);
    const level6 = resolveLevelRuntimeConfig(map, 6, 1);

    expect(level6.totalArtists).toBeGreaterThan(level1.totalArtists);
    expect(level6.maxSimultaneous).toBeGreaterThanOrEqual(level1.maxSimultaneous);
    expect(level6.timerRangeSeconds[0]).toBeLessThan(level1.timerRangeSeconds[0]);
    expect(level6.spawnIntervalMs[0]).toBeLessThan(level1.spawnIntervalMs[0]);
  });

  it("selects distraction subset from eligible level pool", () => {
    const map = makeMap();
    const level1 = resolveLevelRuntimeConfig(map, 1, 1);
    const level5 = resolveLevelRuntimeConfig(map, 5, 1);

    expect(level1.activeDistractionIds).toEqual([]);
    expect(level5.activeDistractionIds.every((id) => ["merch", "fans"].includes(id))).toBe(
      true
    );
  });
});
