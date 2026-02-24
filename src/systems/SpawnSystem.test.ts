import { describe, expect, it } from "vitest";
import { SpawnSystem } from "./SpawnSystem";

describe("SpawnSystem", () => {
  it("spawns immediately and respects maxSimultaneous cap", () => {
    const system = new SpawnSystem(
      {
        levelNumber: 1,
        totalArtists: 3,
        maxSimultaneous: 1,
        timerRangeSeconds: [10, 10],
        spawnIntervalMs: [1000, 1000],
        tierWeights: { headliner: 0, midtier: 0, newcomer: 1 },
        driftSpeedPxPerSecond: 50
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
        maxSimultaneous: 2,
        timerRangeSeconds: [12, 12],
        spawnIntervalMs: [100, 100],
        tierWeights: { headliner: 1, midtier: 0, newcomer: 0 },
        driftSpeedPxPerSecond: 60
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
});
