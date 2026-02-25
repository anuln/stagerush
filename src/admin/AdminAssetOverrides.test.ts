import { describe, expect, it } from "vitest";
import type { FestivalMap } from "../config/FestivalConfig";
import {
  applyAdminAssetOverrides,
  hasAdminAssetOverrides
} from "./AdminAssetOverrides";

function makeMap(): FestivalMap {
  return {
    id: "test",
    name: "Test",
    description: "Fixture",
    totalLevels: 1,
    background: "assets/maps/base/bg.png",
    introScreen: "assets/ui/intro.png",
    stages: [
      {
        id: "main",
        size: "large",
        position: { x: 0.5, y: 0.2 },
        snapRadius: 0.06,
        sprite: "assets/maps/base/stage_main.png",
        color: "#ff0000"
      }
    ],
    spawnPoints: [
      {
        id: "north",
        position: { x: 0.5, y: 0 },
        driftAngle: 180
      }
    ],
    distractions: [
      {
        id: "d1",
        type: "merch_stand",
        position: { x: 0.5, y: 0.5 },
        radius: 0.06,
        delay: 2,
        appearsAtLevel: 1,
        sprite: "assets/maps/base/distraction_merch.png"
      }
    ],
    levels: [
      {
        levelNumber: 1,
        totalArtists: 8,
        maxSimultaneous: 2,
        timerRange: [12, 18],
        tierWeights: { headliner: 0.2, midtier: 0.4, newcomer: 0.4 },
        activeDistractions: [],
        spawnInterval: [1000, 1400]
      }
    ],
    assets: {
      artists: [
        {
          id: "artist-a",
          name: "A",
          tier: "newcomer",
          sprites: {
            walk: [
              "assets/maps/base/artists/a_walk1.png",
              "assets/maps/base/artists/a_walk2.png"
            ],
            idle: "assets/maps/base/artists/a_idle.png",
            performing: "assets/maps/base/artists/a_performing.png"
          }
        }
      ],
      stageSprites: {
        main: "assets/maps/base/stage_main.png"
      },
      distractionSprites: {
        merch_stand: "assets/maps/base/distraction_merch.png"
      },
      audio: {
        spawn: "assets/audio/spawn.mp3"
      }
    }
  };
}

describe("AdminAssetOverrides", () => {
  it("detects when override payload has no actionable entries", () => {
    expect(hasAdminAssetOverrides({})).toBe(false);
    expect(hasAdminAssetOverrides({ stageSprites: {} })).toBe(false);
    expect(hasAdminAssetOverrides({ stagePositions: {} })).toBe(false);
    expect(hasAdminAssetOverrides({ artistSprites: { "artist-a": {} } })).toBe(false);
  });

  it("detects when override payload contains at least one override", () => {
    expect(hasAdminAssetOverrides({ background: "assets/maps/bg.png" })).toBe(true);
    expect(hasAdminAssetOverrides({ introScreen: "assets/ui/intro_v2.png" })).toBe(true);
    expect(
      hasAdminAssetOverrides({
        introPresentation: { fitMode: "contain", focusX: 44, overlayOpacity: 0.7 }
      })
    ).toBe(true);
    expect(hasAdminAssetOverrides({ stageSprites: { main: "assets/maps/stage.png" } })).toBe(
      true
    );
    expect(hasAdminAssetOverrides({ audioCues: { spawn: "assets/audio/spawn_v2.mp3" } })).toBe(
      true
    );
    expect(hasAdminAssetOverrides({ stagePositions: { main: { x: 0.3, y: 0.5 } } })).toBe(
      true
    );
    expect(hasAdminAssetOverrides({ artistSprites: { "artist-a": { idle: "a.png" } } })).toBe(
      true
    );
  });

  it("applies background/stage/distraction/artist sprite overrides", () => {
    const map = makeMap();
    const updated = applyAdminAssetOverrides(map, {
      background: "assets/maps/generated/bg_v2.png",
      introScreen: "assets/ui/intro_v2.png",
      introPresentation: {
        fitMode: "contain",
        focusX: 40,
        focusY: 70,
        zoom: 1.25,
        overlayOpacity: 0.72
      },
      stagePositions: { main: { x: 0.34, y: 0.28 } },
      stageSprites: { main: "assets/maps/generated/stage_main_v2.png" },
      distractionSprites: {
        merch_stand: "assets/maps/generated/distraction_merch_v2.png"
      },
      audioCues: {
        spawn: "assets/audio/spawn_v2.mp3"
      },
      artistSprites: {
        "artist-a": {
          walk1: "assets/maps/generated/artists/a_walk1_v2.png",
          walk2: "assets/maps/generated/artists/a_walk2_v2.png",
          idle: "assets/maps/generated/artists/a_idle_v2.png",
          performing: "assets/maps/generated/artists/a_performing_v2.png"
        }
      }
    });

    expect(updated.background).toBe("assets/maps/generated/bg_v2.png");
    expect(updated.introScreen).toBe("assets/ui/intro_v2.png");
    expect(updated.introPresentation).toMatchObject({
      fitMode: "contain",
      focusX: 40,
      focusY: 70,
      zoom: 1.25,
      overlayOpacity: 0.72
    });
    expect(updated.stages[0].position).toEqual({ x: 0.34, y: 0.28 });
    expect(updated.stages[0].sprite).toBe("assets/maps/generated/stage_main_v2.png");
    expect(updated.distractions[0].sprite).toBe(
      "assets/maps/generated/distraction_merch_v2.png"
    );
    expect(updated.assets.audio.spawn).toBe("assets/audio/spawn_v2.mp3");
    expect(updated.assets.artists[0].sprites.walk[0]).toBe(
      "assets/maps/generated/artists/a_walk1_v2.png"
    );
    expect(updated.assets.artists[0].sprites.walk[1]).toBe(
      "assets/maps/generated/artists/a_walk2_v2.png"
    );
    expect(updated.assets.artists[0].sprites.idle).toBe(
      "assets/maps/generated/artists/a_idle_v2.png"
    );
    expect(updated.assets.artists[0].sprites.performing).toBe(
      "assets/maps/generated/artists/a_performing_v2.png"
    );

    expect(map.background).toBe("assets/maps/base/bg.png");
    expect(map.stages[0].position).toEqual({ x: 0.5, y: 0.2 });
    expect(map.stages[0].sprite).toBe("assets/maps/base/stage_main.png");
  });
});
