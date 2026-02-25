import { describe, expect, it } from "vitest";
import type { FestivalMap } from "../config/FestivalConfig";
import type { AdminAssetOverrides } from "../admin/AdminAssetOverrides";
import {
  buildAssetSlots,
  filterAssetSlots,
  getStagePosition,
  setOverrideForSlot,
  setStagePositionOverride,
  type AudioCatalogEntry,
  type SlotMeta,
  type SpriteCatalogEntry
} from "./AdminPanelModel";

function makeFixtureMap(): FestivalMap {
  return {
    id: "fixture-festival",
    name: "Fixture Festival",
    description: "Fixture",
    totalLevels: 1,
    background: "assets/maps/fixture/background.png",
    stages: [
      {
        id: "main-stage",
        size: "large",
        position: { x: 0.5, y: 0.15 },
        snapRadius: 0.06,
        sprite: "assets/maps/fixture/stage_main.png",
        color: "#ff6b35"
      },
      {
        id: "side-stage",
        size: "medium",
        position: { x: 0.76, y: 0.54 },
        snapRadius: 0.055,
        sprite: "assets/maps/fixture/stage_side.png",
        color: "#00d4ff"
      }
    ],
    spawnPoints: [
      { id: "north", position: { x: 0.5, y: 0 }, driftAngle: 180 },
      { id: "south", position: { x: 0.5, y: 1 }, driftAngle: 0 }
    ],
    distractions: [
      {
        id: "merch-a",
        type: "merch_stand",
        position: { x: 0.4, y: 0.4 },
        radius: 0.06,
        delay: 2,
        appearsAtLevel: 1,
        sprite: "assets/maps/fixture/distraction_merch.png"
      },
      {
        id: "fans-a",
        type: "fan_crowd",
        position: { x: 0.62, y: 0.68 },
        radius: 0.07,
        delay: 2,
        appearsAtLevel: 1,
        sprite: "assets/maps/fixture/distraction_fans.png"
      }
    ],
    levels: [
      {
        levelNumber: 1,
        totalArtists: 10,
        maxSimultaneous: 2,
        timerRange: [12, 16],
        tierWeights: { headliner: 0.3, midtier: 0.3, newcomer: 0.4 },
        activeDistractions: [],
        spawnInterval: [900, 1200]
      }
    ],
    assets: {
      artists: [
        {
          id: "headliner-a",
          name: "Headliner A",
          tier: "headliner",
          debutLevel: 1,
          sprites: {
            walk: [
              "assets/maps/fixture/artist_headliner_walk1.png",
              "assets/maps/fixture/artist_headliner_walk2.png"
            ],
            idle: "assets/maps/fixture/artist_headliner_idle.png",
            performing: "assets/maps/fixture/artist_headliner_performing.png"
          }
        },
        {
          id: "headliner-b",
          name: "Headliner B",
          tier: "headliner",
          debutLevel: 4,
          sprites: {
            walk: [
              "assets/maps/fixture/artist_headliner_b_walk1.png",
              "assets/maps/fixture/artist_headliner_b_walk2.png"
            ],
            idle: "assets/maps/fixture/artist_headliner_b_idle.png",
            performing: "assets/maps/fixture/artist_headliner_b_performing.png"
          }
        }
      ],
      stageSprites: {
        "main-stage": "assets/maps/fixture/stage_main.png",
        "side-stage": "assets/maps/fixture/stage_side.png"
      },
      distractionSprites: {
        merch_stand: "assets/maps/fixture/distraction_merch.png",
        fan_crowd: "assets/maps/fixture/distraction_fans.png"
      },
      audio: {
        music_bg: "assets/audio/fixture/music_bg.mp3",
        sfx_spawn: "assets/audio/fixture/sfx_spawn.mp3"
      }
    }
  };
}

function makeSpriteCatalog(): SpriteCatalogEntry[] {
  return [
    {
      id: "bg",
      category: "background",
      assetPath: "assets/maps/fixture/background.png",
      promptText: "Background prompt"
    },
    {
      id: "stage-main",
      category: "stage",
      assetPath: "assets/maps/fixture/stage_main.png",
      promptText: "Main stage prompt"
    }
  ];
}

function makeAudioCatalog(): AudioCatalogEntry[] {
  return [
    {
      id: "music-bg",
      type: "music",
      assetPath: "assets/audio/fixture/music_bg.mp3",
      promptText: "Music prompt"
    }
  ];
}

describe("AdminPanelModel", () => {
  it("builds all admin slots and resolves prompts", () => {
    const slots = buildAssetSlots(
      makeFixtureMap(),
      {},
      makeSpriteCatalog(),
      makeAudioCatalog()
    );

    expect(slots).toHaveLength(11);
    expect(slots[0].id).toBe("background");
    const bgSlot = slots.find((slot) => slot.id === "background");
    expect(bgSlot?.promptText).toBe("Background prompt");

    const audioSlot = slots.find((slot) => slot.id === "audio:music_bg");
    expect(audioSlot?.category).toBe("audio");
    expect(audioSlot?.mediaType).toBe("audio");
    expect(audioSlot?.promptText).toBe("Music prompt");
  });

  it("applies and clears overrides by slot meta", () => {
    const stageMeta: SlotMeta = {
      kind: "stage",
      stageId: "main-stage"
    };
    let next: AdminAssetOverrides = setOverrideForSlot({}, stageMeta, "assets/maps/new_stage.png");
    expect(next.stageSprites).toEqual({ "main-stage": "assets/maps/new_stage.png" });

    next = setOverrideForSlot(next, stageMeta, null);
    expect(next.stageSprites).toBeUndefined();

    const audioMeta: SlotMeta = {
      kind: "audio",
      cueId: "music_bg"
    };
    next = setOverrideForSlot(next, audioMeta, "assets/audio/new_music.mp3");
    expect(next.audioCues).toEqual({ music_bg: "assets/audio/new_music.mp3" });
  });

  it("updates and clamps stage placement overrides", () => {
    const map = makeFixtureMap();
    const overrides = setStagePositionOverride({}, "main-stage", { x: -1, y: 2 });
    expect(overrides.stagePositions?.["main-stage"]).toEqual({ x: 0, y: 1 });
    expect(getStagePosition(map, overrides, "main-stage")).toEqual({ x: 0, y: 1 });
    expect(getStagePosition(map, overrides, "side-stage")).toEqual(
      map.stages[1].position
    );
  });

  it("filters slots by category and search query", () => {
    const slots = buildAssetSlots(
      makeFixtureMap(),
      {},
      makeSpriteCatalog(),
      makeAudioCatalog()
    );
    const stageOnly = filterAssetSlots(slots, "", "stage");
    expect(stageOnly.every((slot) => slot.category === "stage")).toBe(true);
    expect(stageOnly).toHaveLength(2);

    const query = filterAssetSlots(slots, "headliner", "all");
    expect(query).toHaveLength(4);
  });

  it("includes only in-play artist slots for selected level", () => {
    const levelOneSlots = buildAssetSlots(
      makeFixtureMap(),
      {},
      makeSpriteCatalog(),
      makeAudioCatalog(),
      { inPlayLevel: 1, inPlayOnly: true }
    );
    const levelFiveSlots = buildAssetSlots(
      makeFixtureMap(),
      {},
      makeSpriteCatalog(),
      makeAudioCatalog(),
      { inPlayLevel: 5, inPlayOnly: true }
    );

    const levelOneArtistIds = levelOneSlots
      .filter((slot) => slot.category === "artist")
      .map((slot) => slot.id);
    const levelFiveArtistIds = levelFiveSlots
      .filter((slot) => slot.category === "artist")
      .map((slot) => slot.id);

    expect(levelOneArtistIds.some((id) => id.includes("headliner-a"))).toBe(true);
    expect(levelOneArtistIds.some((id) => id.includes("headliner-b"))).toBe(false);
    expect(levelFiveArtistIds.some((id) => id.includes("headliner-b"))).toBe(true);
  });
});
