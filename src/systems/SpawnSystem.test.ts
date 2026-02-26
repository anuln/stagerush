import { describe, expect, it } from "vitest";
import { SpawnSystem } from "./SpawnSystem";

describe("SpawnSystem", () => {
  it("spawns immediately and respects maxSimultaneous cap", () => {
    const system = new SpawnSystem(
      {
        levelNumber: 1,
        totalArtists: 3,
        sessionTargetSets: 3,
        sessionDayNumber: 1,
        sessionIndexInDay: 1,
        sessionName: "Morning",
        sessionsPerDay: 3,
        totalFestivalDays: 1,
        maxSimultaneous: 1,
        levelDurationSeconds: 60,
        maxEncounterStrikes: 12,
        timerRangeSeconds: [10, 10],
        spawnIntervalMs: [1000, 1000],
        tierWeights: { headliner: 0, midtier: 0, newcomer: 1 },
        activeDistractionIds: [],
        driftSpeedPxPerSecond: 50,
        driftAngleVarianceDegrees: 0
      },
      [
        {
          id: "north",
          position: { x: 0.5, y: 0 },
          driftAngle: 180,
          screenPosition: { x: 100, y: 0 },
          directionVector: { x: 0, y: 1 }
        }
      ],
      () => 0
    );

    const first = system.update(0, []);
    expect(first).toHaveLength(1);

    const blocked = system.update(1, first);
    expect(blocked).toHaveLength(0);

    const second = system.update(1, []);
    expect(second).toHaveLength(1);
  });

  it("does not exceed totalArtists quota", () => {
    const system = new SpawnSystem(
      {
        levelNumber: 1,
        totalArtists: 1,
        sessionTargetSets: 1,
        sessionDayNumber: 1,
        sessionIndexInDay: 1,
        sessionName: "Morning",
        sessionsPerDay: 3,
        totalFestivalDays: 1,
        maxSimultaneous: 2,
        levelDurationSeconds: 60,
        maxEncounterStrikes: 12,
        timerRangeSeconds: [12, 12],
        spawnIntervalMs: [100, 100],
        tierWeights: { headliner: 1, midtier: 0, newcomer: 0 },
        activeDistractionIds: [],
        driftSpeedPxPerSecond: 60,
        driftAngleVarianceDegrees: 0
      },
      [
        {
          id: "west",
          position: { x: 0, y: 0.5 },
          driftAngle: 0,
          screenPosition: { x: 0, y: 100 },
          directionVector: { x: 1, y: 0 }
        }
      ],
      () => 0
    );

    const first = system.update(0, []);
    const second = system.update(5, []);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it("applies deterministic drift-angle variance per spawn", () => {
    let callIndex = 0;
    const values = [0, 0, 1, 0];
    const rng = () => {
      const value = values[Math.min(callIndex, values.length - 1)];
      callIndex += 1;
      return value;
    };

    const system = new SpawnSystem(
      {
        levelNumber: 2,
        totalArtists: 1,
        sessionTargetSets: 1,
        sessionDayNumber: 1,
        sessionIndexInDay: 2,
        sessionName: "Afternoon",
        sessionsPerDay: 3,
        totalFestivalDays: 1,
        maxSimultaneous: 1,
        levelDurationSeconds: 60,
        maxEncounterStrikes: 12,
        timerRangeSeconds: [8, 8],
        spawnIntervalMs: [1000, 1000],
        tierWeights: { headliner: 0, midtier: 0, newcomer: 1 },
        activeDistractionIds: [],
        driftSpeedPxPerSecond: 100,
        driftAngleVarianceDegrees: 30
      },
      [
        {
          id: "east",
          position: { x: 1, y: 0.5 },
          driftAngle: 180,
          screenPosition: { x: 100, y: 100 },
          directionVector: { x: -1, y: 0 }
        }
      ],
      rng
    );

    const spawned = system.update(0, []);

    expect(spawned).toHaveLength(1);
    expect(spawned[0].velocity.x).toBeLessThan(0);
    const inward = { x: -1, y: 0 };
    const speed = Math.hypot(spawned[0].velocity.x, spawned[0].velocity.y);
    const inwardDot =
      (spawned[0].velocity.x * inward.x + spawned[0].velocity.y * inward.y) / speed;
    const offAxisDegrees = (Math.acos(Math.max(-1, Math.min(1, inwardDot))) * 180) / Math.PI;
    expect(offAxisDegrees).toBeLessThanOrEqual(72);
    expect(Math.hypot(spawned[0].velocity.x, spawned[0].velocity.y)).toBeCloseTo(
      spawned[0].movementSpeedPxPerSecond,
      4
    );
  });

  it("assigns faster movement envelopes for headliners than newcomers", () => {
    const spawnPoints = [
      {
        id: "north",
        position: { x: 0.5, y: 0 },
        driftAngle: 180,
        screenPosition: { x: 100, y: 0 },
        directionVector: { x: 0, y: 1 }
      }
    ];

    const newcomerSystem = new SpawnSystem(
      {
        levelNumber: 5,
        totalArtists: 1,
        sessionTargetSets: 1,
        sessionDayNumber: 2,
        sessionIndexInDay: 2,
        sessionName: "Afternoon",
        sessionsPerDay: 3,
        totalFestivalDays: 3,
        maxSimultaneous: 1,
        levelDurationSeconds: 60,
        maxEncounterStrikes: 12,
        timerRangeSeconds: [10, 10],
        spawnIntervalMs: [100, 100],
        tierWeights: { headliner: 0, midtier: 0, newcomer: 1 },
        activeDistractionIds: [],
        driftSpeedPxPerSecond: 80,
        driftAngleVarianceDegrees: 0
      },
      spawnPoints,
      () => 0.5
    );
    const headlinerSystem = new SpawnSystem(
      {
        levelNumber: 5,
        totalArtists: 1,
        sessionTargetSets: 1,
        sessionDayNumber: 2,
        sessionIndexInDay: 2,
        sessionName: "Afternoon",
        sessionsPerDay: 3,
        totalFestivalDays: 3,
        maxSimultaneous: 1,
        levelDurationSeconds: 60,
        maxEncounterStrikes: 12,
        timerRangeSeconds: [10, 10],
        spawnIntervalMs: [100, 100],
        tierWeights: { headliner: 1, midtier: 0, newcomer: 0 },
        activeDistractionIds: [],
        driftSpeedPxPerSecond: 80,
        driftAngleVarianceDegrees: 0
      },
      spawnPoints,
      () => 0.5
    );

    const newcomer = newcomerSystem.update(0, [])[0];
    const headliner = headlinerSystem.update(0, [])[0];
    expect(headliner.movementSpeedPxPerSecond).toBeGreaterThan(
      newcomer.movementSpeedPxPerSecond
    );
  });

  it("spawns artists slightly outside viewport bounds before entering", () => {
    const system = new SpawnSystem(
      {
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
        spawnIntervalMs: [100, 100],
        tierWeights: { headliner: 0, midtier: 0, newcomer: 1 },
        activeDistractionIds: [],
        driftSpeedPxPerSecond: 80,
        driftAngleVarianceDegrees: 0
      },
      [
        {
          id: "west",
          position: { x: 0, y: 0.5 },
          driftAngle: 0,
          screenPosition: { x: 0, y: 100 },
          directionVector: { x: 1, y: 0 }
        }
      ],
      () => 0,
      {
        stages: [
          {
            id: "main-stage",
            color: "#FF6B35",
            screenPosition: { x: 160, y: 100 }
          }
        ],
        viewport: { width: 200, height: 200 }
      }
    );

    const spawned = system.update(0, []);
    expect(spawned).toHaveLength(1);
    expect(spawned[0].position.x).toBeLessThan(0);
  });

  it("varies edge spawn positions along the selected map boundary", () => {
    let index = 0;
    const rng = () => (((index += 1) % 10) + 1) / 11;

    const system = new SpawnSystem(
      {
        levelNumber: 1,
        totalArtists: 2,
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
        spawnIntervalMs: [0, 0],
        tierWeights: { headliner: 0, midtier: 0, newcomer: 1 },
        activeDistractionIds: [],
        driftSpeedPxPerSecond: 80,
        driftAngleVarianceDegrees: 0
      },
      [
        {
          id: "north",
          position: { x: 0.5, y: 0 },
          driftAngle: 180,
          screenPosition: { x: 100, y: 0 },
          directionVector: { x: 0, y: 1 }
        }
      ],
      rng,
      {
        viewport: { width: 200, height: 200 }
      }
    );

    const first = system.update(0, [])[0];
    const second = system.update(0, [])[0];

    expect(first.position.y).toBeLessThan(0);
    expect(second.position.y).toBeLessThan(0);
    expect(Math.abs(first.position.x - second.position.x)).toBeGreaterThan(0.001);
  });

  it("keeps spawn drift independent of target stage direction", () => {
    const system = new SpawnSystem(
      {
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
        spawnIntervalMs: [100, 100],
        tierWeights: { headliner: 0, midtier: 0, newcomer: 1 },
        activeDistractionIds: [],
        driftSpeedPxPerSecond: 80,
        driftAngleVarianceDegrees: 0
      },
      [
        {
          id: "north",
          position: { x: 0.5, y: 0 },
          driftAngle: 0,
          screenPosition: { x: 100, y: 0 },
          directionVector: { x: 1, y: 0 }
        }
      ],
      () => 0,
      {
        stages: [
          {
            id: "main-stage",
            color: "#FF6B35",
            screenPosition: { x: 100, y: 200 }
          }
        ],
        viewport: { width: 200, height: 220 }
      }
    );

    const [artist] = system.update(0, []);
    const speed = Math.hypot(artist.velocity.x, artist.velocity.y);
    const inwardDot = artist.velocity.x / speed;
    expect(inwardDot).toBeGreaterThanOrEqual(0.49);
  });

  it("assigns sprite profile ids from roster callback at spawn", () => {
    const system = new SpawnSystem(
      {
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
        spawnIntervalMs: [100, 100],
        tierWeights: { headliner: 1, midtier: 0, newcomer: 0 },
        activeDistractionIds: [],
        driftSpeedPxPerSecond: 80,
        driftAngleVarianceDegrees: 0
      },
      [
        {
          id: "north",
          position: { x: 0.5, y: 0 },
          driftAngle: 180,
          screenPosition: { x: 100, y: 0 },
          directionVector: { x: 0, y: 1 }
        }
      ],
      () => 0,
      {
        pickArtistProfileId: (tier) =>
          tier === "headliner" ? "headliner-special" : null
      }
    );

    const [artist] = system.update(0, []);
    expect(artist.spriteProfileId).toBe("headliner-special");
  });
});
