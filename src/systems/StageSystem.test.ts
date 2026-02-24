import { describe, expect, it } from "vitest";
import { Artist } from "../entities/Artist";
import type { ResolvedStage } from "../maps/MapLoader";
import { StageSystem } from "./StageSystem";

function makeStage(id: string, size: "large" | "medium" | "small", x: number): ResolvedStage {
  return {
    id,
    size,
    position: { x: 0.5, y: 0.5 },
    snapRadius: 0.06,
    sprite: "",
    color: "#FF6B35",
    screenPosition: { x, y: 100 },
    pixelWidth: 120,
    pixelHeight: 80
  };
}

function makeArtist(id: string): Artist {
  return new Artist({
    id,
    tier: "newcomer",
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    timerSeconds: 20
  });
}

describe("StageSystem", () => {
  it("starts performance immediately when stage is free", () => {
    const stageSystem = new StageSystem([makeStage("main-stage", "large", 300)], 2500);
    const artist = makeArtist("a1");

    stageSystem.handleArrival(artist, "main-stage", 0);
    expect(artist.state).toBe("PERFORMING");

    const before = stageSystem.update(2400);
    expect(before.completedDeliveries).toHaveLength(0);

    const after = stageSystem.update(2501);
    expect(after.completedDeliveries).toHaveLength(1);
    expect(after.completedDeliveries[0]).toMatchObject({
      artistId: "a1",
      stageId: "main-stage",
      stageSize: "large"
    });
    expect(artist.state).toBe("COMPLETED");
  });

  it("queues arrivals while occupied and releases in FIFO order", () => {
    const stageSystem = new StageSystem([makeStage("main-stage", "large", 300)], 1000);
    const a1 = makeArtist("a1");
    const a2 = makeArtist("a2");
    const a3 = makeArtist("a3");

    stageSystem.handleArrival(a1, "main-stage", 0);
    stageSystem.handleArrival(a2, "main-stage", 100);
    stageSystem.handleArrival(a3, "main-stage", 200);

    expect(a1.state).toBe("PERFORMING");
    expect(a2.state).toBe("ARRIVING");
    expect(a3.state).toBe("ARRIVING");

    const firstDone = stageSystem.update(1001);
    expect(firstDone.completedDeliveries).toHaveLength(1);
    expect(firstDone.completedDeliveries[0].artistId).toBe("a1");
    expect(a2.state).toBe("PERFORMING");

    const secondDone = stageSystem.update(2002);
    expect(secondDone.completedDeliveries).toHaveLength(1);
    expect(secondDone.completedDeliveries[0].artistId).toBe("a2");
    expect(a3.state).toBe("PERFORMING");

    const thirdDone = stageSystem.update(3003);
    expect(thirdDone.completedDeliveries).toHaveLength(1);
    expect(thirdDone.completedDeliveries[0].artistId).toBe("a3");
    expect(a3.state).toBe("COMPLETED");
  });
});
