import { describe, expect, it, vi } from "vitest";
import type { FestivalMap } from "../config/FestivalConfig";
import { BundleManager, type AssetLoader } from "./BundleManager";
import {
  BOOT_BUNDLE_MANIFEST,
  GOVBALL_BUNDLE_ID,
  createGovBallBundleManifest
} from "./manifest";

class FakeLoader implements AssetLoader {
  readonly loadedCalls: string[][] = [];
  readonly unloadedCalls: string[][] = [];

  async load(assetPaths: string[]): Promise<void> {
    this.loadedCalls.push([...assetPaths]);
  }

  async unload(assetPaths: string[]): Promise<void> {
    this.unloadedCalls.push([...assetPaths]);
  }
}

class FlakyLoader extends FakeLoader {
  private readonly failingAssets: Set<string>;

  constructor(failingAssets: string[]) {
    super();
    this.failingAssets = new Set(failingAssets);
  }

  override async load(assetPaths: string[]): Promise<void> {
    this.loadedCalls.push([...assetPaths]);
    if (assetPaths.some((assetPath) => this.failingAssets.has(assetPath))) {
      throw new Error(`Missing asset: ${assetPaths.join(",")}`);
    }
  }
}

function makeMapFixture(): FestivalMap {
  return {
    id: "govball2026",
    name: "Gov Ball",
    description: "Fixture",
    totalLevels: 2,
    background: "assets/maps/govball/bg.png",
    stages: [
      {
        id: "main-stage",
        size: "large",
        position: { x: 0.5, y: 0.2 },
        snapRadius: 0.06,
        sprite: "assets/maps/govball/stage_main.png",
        color: "#ff6b35"
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
        id: "merch1",
        type: "merch_stand",
        position: { x: 0.4, y: 0.5 },
        radius: 0.05,
        delay: 2,
        appearsAtLevel: 1,
        sprite: "assets/maps/govball/distraction_merch.png"
      }
    ],
    levels: [
      {
        levelNumber: 1,
        totalArtists: 8,
        maxSimultaneous: 2,
        timerRange: [15, 18],
        tierWeights: { headliner: 0.2, midtier: 0.4, newcomer: 0.4 },
        activeDistractions: [],
        spawnInterval: [1200, 1800]
      }
    ],
    assets: {
      artists: [
        {
          id: "headliner-a",
          name: "Headliner A",
          tier: "headliner",
          sprites: {
            walk: [
              "assets/maps/govball/artists/headliner_a_walk1.png",
              "assets/maps/govball/artists/headliner_a_walk2.png"
            ],
            idle: "assets/maps/govball/artists/headliner_a_idle.png",
            performing: "assets/maps/govball/artists/headliner_a_performing.png"
          }
        }
      ],
      stageSprites: {
        "main-stage": "assets/maps/govball/stage_main.png"
      },
      distractionSprites: {
        merch_stand: "assets/maps/govball/distraction_merch.png"
      },
      audio: {
        spawn: "assets/audio/govball/sfx_spawn.mp3"
      }
    }
  };
}

describe("BundleManager", () => {
  it("loads and unloads bundles idempotently while keeping boot resident", async () => {
    const loader = new FakeLoader();
    const festivalManifest = {
      id: GOVBALL_BUNDLE_ID,
      assets: ["/a.png", "/b.png"]
    };
    const manager = new BundleManager(
      [BOOT_BUNDLE_MANIFEST, festivalManifest],
      { loader }
    );

    await manager.loadBundle(BOOT_BUNDLE_MANIFEST.id);
    await manager.loadBundle(GOVBALL_BUNDLE_ID);
    await manager.loadBundle(GOVBALL_BUNDLE_ID);

    expect(manager.isBundleLoaded(GOVBALL_BUNDLE_ID)).toBe(true);
    expect(loader.loadedCalls).toEqual([
      ["/assets/maps/index.json"],
      ["/a.png", "/b.png"]
    ]);

    await manager.unloadBundle(GOVBALL_BUNDLE_ID);
    await manager.unloadBundle(GOVBALL_BUNDLE_ID);
    await manager.unloadBundle(BOOT_BUNDLE_MANIFEST.id);

    expect(manager.isBundleLoaded(GOVBALL_BUNDLE_ID)).toBe(false);
    expect(loader.unloadedCalls).toEqual([["/a.png", "/b.png"]]);
    expect(manager.getStatus().activeBundles).toEqual([BOOT_BUNDLE_MANIFEST.id]);
  });

  it("handles shared assets across bundles with reference counting", async () => {
    const loader = new FakeLoader();
    const manager = new BundleManager(
      [
        { id: "one", assets: ["/shared.png", "/one.png"] },
        { id: "two", assets: ["/shared.png", "/two.png"] }
      ],
      { loader }
    );

    await manager.loadBundle("one");
    await manager.loadBundle("two");
    await manager.unloadBundle("one");
    await manager.unloadBundle("two");

    expect(loader.loadedCalls).toEqual([
      ["/shared.png", "/one.png"],
      ["/two.png"]
    ]);
    expect(loader.unloadedCalls).toEqual([
      ["/one.png"],
      ["/shared.png", "/two.png"]
    ]);
  });

  it("builds a deduplicated gov ball manifest from map assets", () => {
    const manifest = createGovBallBundleManifest(makeMapFixture());

    expect(manifest.id).toBe(GOVBALL_BUNDLE_ID);
    expect(manifest.assets).toContain("/assets/maps/govball/bg.png");
    expect(manifest.assets).toContain(
      "/assets/maps/govball/artists/headliner_a_walk1.png"
    );
    expect(manifest.assets).toContain("/assets/audio/govball/sfx_spawn.mp3");
    expect(new Set(manifest.assets).size).toBe(manifest.assets.length);
  });

  it("continues bundle activation when some assets fail to load", async () => {
    const loader = new FlakyLoader(["/missing.png"]);
    const manager = new BundleManager(
      [{ id: "festival", assets: ["/ok.png", "/missing.png"] }],
      { loader }
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(manager.loadBundle("festival")).resolves.toBe(true);
    expect(manager.isBundleLoaded("festival")).toBe(true);
    expect(manager.getStatus().warmedAssets).toEqual(["/ok.png"]);

    await expect(manager.unloadBundle("festival")).resolves.toBe(true);
    expect(loader.unloadedCalls).toEqual([["/ok.png"]]);
    warnSpy.mockRestore();
  });
});
