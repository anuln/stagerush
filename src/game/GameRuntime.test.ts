import { Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeLevelConfig } from "../config/LevelConfig";
import type {
  ResolvedFestivalLayout,
  ResolvedSpawnPoint
} from "../maps/MapLoader";
import { createLayerSet } from "../maps/layers";
import { GameRuntime } from "./GameRuntime";

vi.mock("../rendering/ArtistRenderer", () => ({
  ArtistRenderer: class {
    render(): void {}
  },
  resolveArtistSpritePath: () => null
}));

vi.mock("../rendering/PathRenderer", () => ({
  PathRenderer: class {
    render(): void {}
  },
  advancePathLifecycles: (states: unknown[]) => states
}));

vi.mock("../rendering/DistractionRenderer", () => ({
  DistractionRenderer: class {
    render(): void {}
  }
}));

vi.mock("../rendering/EtaRenderer", () => ({
  EtaRenderer: class {
    render(): void {}
  }
}));

vi.mock("../rendering/HazardOverlayRenderer", () => ({
  HazardOverlayRenderer: class {
    render(): void {}
  }
}));

vi.mock("../rendering/ComboFeedbackRenderer", () => ({
  ComboFeedbackRenderer: class {
    render(): void {}
  }
}));

vi.mock("../rendering/HudRenderer", () => ({
  HudRenderer: class {
    render(): void {}
  }
}));

vi.mock("../rendering/DeliveryFeedbackRenderer", () => ({
  DeliveryFeedbackRenderer: class {
    render(): void {}
  }
}));

const BASE_LEVEL: RuntimeLevelConfig = {
  levelNumber: 1,
  totalArtists: 1,
  maxSimultaneous: 1,
  timerRangeSeconds: [12, 12],
  tierWeights: {
    headliner: 0.2,
    midtier: 0.4,
    newcomer: 0.4
  },
  spawnIntervalMs: [1000, 1000],
  activeDistractionIds: [],
  driftSpeedPxPerSecond: 80,
  driftAngleVarianceDegrees: 0
};

function makeLayout(spawnPoints: ResolvedSpawnPoint[]): ResolvedFestivalLayout {
  return {
    map: {
      id: "test-fest",
      name: "Test Fest",
      description: "Runtime fixture",
      totalLevels: 1,
      background: "assets/maps/test/bg.png",
      stages: [],
      spawnPoints: spawnPoints.map((spawn) => ({
        id: spawn.id,
        position: { x: 0.5, y: 0.5 },
        driftAngle: spawn.driftAngle
      })),
      distractions: [],
      levels: [],
      assets: {
        artists: [],
        stageSprites: {},
        distractionSprites: {},
        audio: {}
      }
    },
    viewport: { width: 100, height: 100 },
    stages: [],
    spawnPoints,
    distractions: []
  };
}

describe("GameRuntime", () => {
  it("marks runtime complete when level is exhausted with no active entities", () => {
    const runtime = new GameRuntime(
      makeLayout([]),
      createLayerSet(new Container()),
      {
        ...BASE_LEVEL,
        totalArtists: 0,
        maxSimultaneous: 0
      }
    );

    runtime.update(0.016, { width: 100, height: 100 }, 1000);

    const status = runtime.getStatus();
    expect(status.outcome).toBe("COMPLETED");
    expect(status.spawnedArtists).toBe(0);
    expect(runtime.getTelemetrySnapshot().runtimeOutcome).toBe("COMPLETED");
  });

  it("fails after three misses across deterministic out-of-bounds spawns", () => {
    const layout = makeLayout([
      {
        id: "north",
        position: { x: 0.5, y: 0 },
        driftAngle: 270,
        screenPosition: { x: 50, y: 0 },
        directionVector: { x: 0, y: -1 }
      }
    ]);

    const runtime = new GameRuntime(
      layout,
      createLayerSet(new Container()),
      {
        ...BASE_LEVEL,
        totalArtists: 3,
        maxSimultaneous: 1,
        spawnIntervalMs: [0, 0],
        driftSpeedPxPerSecond: 200
      }
    );

    runtime.update(1, { width: 100, height: 100 }, 1000);
    runtime.update(1, { width: 100, height: 100 }, 2000);
    runtime.update(1, { width: 100, height: 100 }, 3000);

    const status = runtime.getStatus();
    expect(status.outcome).toBe("FAILED");
    expect(status.remainingLives).toBe(0);
    expect(status.spawnedArtists).toBe(3);
    expect(status.resolvedArtists).toBe(3);

    const telemetry = runtime.getTelemetrySnapshot();
    expect(telemetry.runtimeOutcome).toBe("FAILED");
    expect(telemetry.activeArtists).toBe(0);
  });
});
