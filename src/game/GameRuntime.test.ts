import { Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeLevelConfig } from "../config/LevelConfig";
import type {
  ResolvedDistraction,
  ResolvedFestivalLayout,
  ResolvedSpawnPoint
} from "../maps/MapLoader";
import { createLayerSet } from "../maps/layers";
import { GameRuntime, resolvePerformanceTier } from "./GameRuntime";

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
  sessionTargetSets: 1,
  sessionDayNumber: 1,
  sessionIndexInDay: 1,
  sessionName: "Morning",
  sessionsPerDay: 3,
  totalFestivalDays: 1,
  maxSimultaneous: 1,
  levelDurationSeconds: 60,
  maxEncounterStrikes: 12,
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

function makeLayout(
  spawnPoints: ResolvedSpawnPoint[],
  distractions: ResolvedDistraction[] = []
): ResolvedFestivalLayout {
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
      distractions: distractions.map((entry) => ({
        id: entry.id,
        type: entry.type,
        position: { x: 0.5, y: 0.5 },
        radius: 0.05,
        delay: 2,
        appearsAtLevel: 1,
        sprite: "assets/maps/test/distraction.png"
      })),
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
    distractions
  };
}

describe("GameRuntime", () => {
  it("resolves round performance tier from score and delivery targets", () => {
    expect(
      resolvePerformanceTier({ score: 2200, deliveredArtists: 16 })
    ).toBe("GOLD");
    expect(
      resolvePerformanceTier({ score: 1100, deliveredArtists: 9 })
    ).toBe("SILVER");
    expect(
      resolvePerformanceTier({ score: 180, deliveredArtists: 2 })
    ).toBe("BRONZE");
  });

  it("marks runtime complete when round timer expires", () => {
    const runtime = new GameRuntime(
      makeLayout([]),
      createLayerSet(new Container()),
      {
        ...BASE_LEVEL,
        totalArtists: 0,
        maxSimultaneous: 0,
        levelDurationSeconds: 0.05
      }
    );

    runtime.update(0.1, { width: 100, height: 100 }, 1000);

    const status = runtime.getStatus();
    expect(status.outcome).toBe("COMPLETED");
    expect(status.performanceTier).toBe("BRONZE");
    expect(status.deliveredArtists).toBe(0);
    expect(status.missedArtists).toBe(0);
    expect(status.spawnedArtists).toBe(0);
    expect(status.remainingTimeSeconds).toBe(0);
    expect(runtime.getTelemetrySnapshot().runtimeOutcome).toBe("COMPLETED");
  });

  it("does not fail from repeated out-of-bounds and timeout misses", () => {
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
        driftSpeedPxPerSecond: 200,
        levelDurationSeconds: 2
      }
    );

    runtime.update(1, { width: 100, height: 100 }, 1000);
    runtime.update(1, { width: 100, height: 100 }, 2000);

    const status = runtime.getStatus();
    expect(status.outcome).toBe("COMPLETED");
    expect(status.remainingLives).toBe(12);
    expect(status.spawnedArtists).toBeGreaterThanOrEqual(1);

    const telemetry = runtime.getTelemetrySnapshot();
    expect(telemetry.runtimeOutcome).toBe("COMPLETED");
    expect(telemetry.activeArtists).toBeGreaterThanOrEqual(0);
  });

  it("fails when hazard encounters exceed configured strike budget", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.25);
    const layout = makeLayout(
      [
        {
          id: "north",
          position: { x: 0.5, y: 0 },
          driftAngle: 180,
          screenPosition: { x: 50, y: 20 },
          directionVector: { x: 0, y: 1 }
        }
      ],
      [
        {
          id: "hazard-1",
          type: "fan_crowd",
          position: { x: 0.5, y: 0.5 },
          radius: 0.08,
          delay: 2,
          appearsAtLevel: 1,
          sprite: "assets/maps/test/hazard.png",
          screenPosition: { x: 50, y: 20 },
          pixelRadius: 25
        }
      ]
    );

    const runtime = new GameRuntime(
      layout,
      createLayerSet(new Container()),
      {
        ...BASE_LEVEL,
        totalArtists: 1,
        maxSimultaneous: 1,
        spawnIntervalMs: [0, 0],
        maxEncounterStrikes: 1,
        activeDistractionIds: ["hazard-1"],
        levelDurationSeconds: 30
      }
    );

    try {
      for (let tick = 0; tick < 40; tick += 1) {
        runtime.update(0.2, { width: 100, height: 100 }, 1000 + tick * 200);
        if (runtime.getStatus().outcome === "FAILED") {
          break;
        }
      }

      const status = runtime.getStatus();
      expect(status.outcome).toBe("FAILED");
      expect(status.remainingLives).toBe(0);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("assigns drawn paths even when they do not snap to a stage", () => {
    const runtime = new GameRuntime(
      makeLayout([
        {
          id: "center",
          position: { x: 0.5, y: 0.5 },
          driftAngle: 90,
          screenPosition: { x: 50, y: 50 },
          directionVector: { x: 0, y: 0 }
        }
      ]),
      createLayerSet(new Container()),
      {
        ...BASE_LEVEL,
        totalArtists: 1,
        maxSimultaneous: 1,
        spawnIntervalMs: [0, 0],
        levelDurationSeconds: 20
      }
    );

    runtime.update(0, { width: 100, height: 100 }, 1000);

    const engaged = runtime.onPointerDown(50, 22, 1001);
    expect(engaged).toBe(true);

    runtime.onPointerMove(75, 22);
    runtime.onPointerMove(95, 22);
    runtime.onPointerUp(95, 22, 1002);

    runtime.update(0.2, { width: 100, height: 100 }, 1200);
    expect(runtime.getTelemetrySnapshot().activePaths).toBeGreaterThan(0);
  });

  it("tracks incorrect-stage deliveries when artists perform on non-assigned stages", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const layout: ResolvedFestivalLayout = {
      map: {
        id: "stage-match-test",
        name: "Stage Match Test",
        description: "fixture",
        totalLevels: 1,
        background: "assets/maps/test/bg.png",
        stages: [
          {
            id: "left-stage",
            size: "small",
            position: { x: 0.2, y: 0.5 },
            snapRadius: 0.12,
            sprite: "assets/maps/test/left-stage.png",
            color: "#f59e0b"
          },
          {
            id: "right-stage",
            size: "small",
            position: { x: 0.8, y: 0.5 },
            snapRadius: 0.12,
            sprite: "assets/maps/test/right-stage.png",
            color: "#10b981"
          }
        ],
        spawnPoints: [
          {
            id: "center",
            position: { x: 0.5, y: 0.5 },
            driftAngle: 0
          }
        ],
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
      stages: [
        {
          id: "left-stage",
          size: "small",
          position: { x: 0.2, y: 0.5 },
          snapRadius: 0.12,
          sprite: "assets/maps/test/left-stage.png",
          color: "#f59e0b",
          screenPosition: { x: 20, y: 50 },
          pixelWidth: 48,
          pixelHeight: 48
        },
        {
          id: "right-stage",
          size: "small",
          position: { x: 0.8, y: 0.5 },
          snapRadius: 0.12,
          sprite: "assets/maps/test/right-stage.png",
          color: "#10b981",
          screenPosition: { x: 80, y: 50 },
          pixelWidth: 48,
          pixelHeight: 48
        }
      ],
      spawnPoints: [
        {
          id: "center",
          position: { x: 0.5, y: 0.5 },
          driftAngle: 0,
          screenPosition: { x: 50, y: 50 },
          directionVector: { x: 0, y: 1 }
        }
      ],
      distractions: []
    };

      const runtime = new GameRuntime(
        layout,
        createLayerSet(new Container()),
        {
          ...BASE_LEVEL,
          totalArtists: 1,
          maxSimultaneous: 1,
          spawnIntervalMs: [0, 0],
          levelDurationSeconds: 20
        }
      );

      runtime.update(0, { width: 100, height: 100 }, 1000);
      const engaged = runtime.onPointerDown(22, 50, 1001);
      expect(engaged).toBe(true);
      runtime.onPointerMove(80, 50);
      runtime.onPointerUp(80, 50, 1002);

      for (let tick = 0; tick < 30; tick += 1) {
        runtime.update(0.2, { width: 100, height: 100 }, 1200 + tick * 200);
      }

      const status = runtime.getStatus();
      expect(status.deliveredArtists).toBe(1);
      expect(status.incorrectStageArtists).toBe(1);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("removes runtime UI layers on dispose to prevent HUD stacking across levels", () => {
    const root = new Container();
    const layerSet = createLayerSet(root);
    expect(layerSet.uiLayer.children).toHaveLength(0);

    const firstRuntime = new GameRuntime(
      makeLayout([]),
      layerSet,
      { ...BASE_LEVEL, totalArtists: 0, maxSimultaneous: 0 }
    );
    expect(layerSet.uiLayer.children.length).toBeGreaterThan(0);
    firstRuntime.dispose();
    expect(layerSet.uiLayer.children).toHaveLength(0);

    const secondRuntime = new GameRuntime(
      makeLayout([]),
      layerSet,
      { ...BASE_LEVEL, totalArtists: 0, maxSimultaneous: 0 }
    );
    expect(layerSet.uiLayer.children.length).toBeGreaterThan(0);
    secondRuntime.dispose();
    expect(layerSet.uiLayer.children).toHaveLength(0);
  });
});
