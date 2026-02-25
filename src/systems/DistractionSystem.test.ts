import { describe, expect, it } from "vitest";
import { Artist } from "../entities/Artist";
import type { ResolvedDistraction } from "../maps/MapLoader";
import { DistractionSystem } from "./DistractionSystem";

function makeArtist(id: string, x: number, y: number, state: "DRIFTING" | "FOLLOWING" = "FOLLOWING"): Artist {
  return new Artist({
    id,
    tier: "newcomer",
    position: { x, y },
    velocity: { x: 30, y: 0 },
    timerSeconds: 20,
    state
  });
}

function makeDistraction(id: string, x: number): ResolvedDistraction {
  return {
    id,
    type: "merch_stand",
    position: { x: 0.5, y: 0.5 },
    radius: 0.08,
    delay: 2,
    appearsAtLevel: 1,
    sprite: "",
    screenPosition: { x, y: 100 },
    pixelRadius: 60
  };
}

describe("DistractionSystem", () => {
  it("applies distraction delay when artist enters active radius and resumes afterward", () => {
    const artist = makeArtist("a1", 110, 100);
    const system = new DistractionSystem([makeDistraction("d1", 100)], ["d1"]);

    const started = system.update([artist], 0);
    expect(started.started).toHaveLength(1);
    expect(artist.state).toBe("DISTRACTED");
    expect(artist.position).toEqual({ x: 100, y: 100 });

    const notDone = system.update([artist], 1999);
    expect(notDone.resolved).toHaveLength(0);
    expect(artist.state).toBe("DISTRACTED");

    const done = system.update([artist], 2001);
    expect(done.resolved).toHaveLength(1);
    expect(artist.state).toBe("FOLLOWING");
  });

  it("only triggers active distraction IDs", () => {
    const artist = makeArtist("a1", 110, 100);
    const system = new DistractionSystem([makeDistraction("d1", 100)], []);

    const result = system.update([artist], 0);
    expect(result.started).toHaveLength(0);
    expect(artist.state).toBe("FOLLOWING");
  });

  it("does not immediately retrigger distraction on the same tick session resolves", () => {
    const artist = makeArtist("a1", 110, 100, "DRIFTING");
    const system = new DistractionSystem([makeDistraction("d1", 100)], ["d1"]);

    system.update([artist], 0);
    const resolved = system.update([artist], 2001);

    expect(resolved.resolved).toHaveLength(1);
    expect(resolved.started).toHaveLength(0);
    expect(artist.state).toBe("DRIFTING");
  });

  it("prevents retriggering until distraction cooldown window elapses", () => {
    const artist = makeArtist("a1", 110, 100, "DRIFTING");
    const system = new DistractionSystem(
      [makeDistraction("d1", 100)],
      ["d1"],
      1500
    );

    system.update([artist], 0);
    const resolved = system.update([artist], 2001);
    const blockedByCooldown = system.update([artist], 2600);
    const retriggered = system.update([artist], 3600);

    expect(resolved.resolved).toHaveLength(1);
    expect(blockedByCooldown.started).toHaveLength(0);
    expect(retriggered.started).toHaveLength(1);
  });
});
