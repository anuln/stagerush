import { describe, expect, it } from "vitest";
import { Artist } from "../entities/Artist";
import { CollisionSystem } from "./CollisionSystem";

function makeArtist(id: string, x: number, y: number, state: "DRIFTING" | "FOLLOWING" = "DRIFTING"): Artist {
  return new Artist({
    id,
    tier: "newcomer",
    position: { x, y },
    velocity: { x: 10, y: 0 },
    timerSeconds: 20,
    state
  });
}

describe("CollisionSystem", () => {
  it("triggers chat for nearby artists and restores prior state on timeout", () => {
    const a = makeArtist("a", 100, 100, "FOLLOWING");
    const b = makeArtist("b", 120, 100, "DRIFTING");
    const system = new CollisionSystem(40, 3000);

    const started = system.update([a, b], 0);
    expect(started.started).toHaveLength(1);
    expect(a.state).toBe("CHATTING");
    expect(b.state).toBe("CHATTING");

    const notYet = system.update([a, b], 2999);
    expect(notYet.resolved).toHaveLength(0);
    expect(a.state).toBe("CHATTING");

    const resolved = system.update([a, b], 3001);
    expect(resolved.resolved).toHaveLength(1);
    expect(a.state).toBe("FOLLOWING");
    expect(b.state).toBe("DRIFTING");
  });

  it("restores prior drifting velocity after chat resolves", () => {
    const a = makeArtist("a", 100, 100, "DRIFTING");
    const b = makeArtist("b", 120, 100, "DRIFTING");
    a.velocity = { x: 15, y: 9 };
    b.velocity = { x: -12, y: 7 };
    const system = new CollisionSystem(40, 1500);

    system.update([a, b], 0);
    expect(a.velocity).toEqual({ x: 0, y: 0 });
    expect(b.velocity).toEqual({ x: 0, y: 0 });

    system.update([a, b], 1501);
    expect(a.state).toBe("DRIFTING");
    expect(b.state).toBe("DRIFTING");
    expect(a.velocity).toEqual({ x: 15, y: 9 });
    expect(b.velocity).toEqual({ x: -12, y: 7 });
  });

  it("does not retrigger collisions while artists are already in active chat session", () => {
    const a = makeArtist("a", 100, 100);
    const b = makeArtist("b", 120, 100);
    const system = new CollisionSystem(40, 3000);

    const first = system.update([a, b], 0);
    const second = system.update([a, b], 1000);

    expect(first.started).toHaveLength(1);
    expect(second.started).toHaveLength(0);
  });

  it("does not immediately retrigger on the same tick a chat session resolves", () => {
    const a = makeArtist("a", 100, 100, "FOLLOWING");
    const b = makeArtist("b", 120, 100, "DRIFTING");
    const system = new CollisionSystem(40, 3000);

    system.update([a, b], 0);
    const resolved = system.update([a, b], 3001);

    expect(resolved.resolved).toHaveLength(1);
    expect(resolved.started).toHaveLength(0);
    expect(a.state).toBe("FOLLOWING");
    expect(b.state).toBe("DRIFTING");
  });

  it("prevents retriggering until cooldown window elapses", () => {
    const a = makeArtist("a", 100, 100, "FOLLOWING");
    const b = makeArtist("b", 120, 100, "DRIFTING");
    const system = new CollisionSystem(40, 2000, 1500);

    system.update([a, b], 0);
    const resolved = system.update([a, b], 2001);
    const blockedByCooldown = system.update([a, b], 2600);
    const retriggered = system.update([a, b], 3600);

    expect(resolved.resolved).toHaveLength(1);
    expect(blockedByCooldown.started).toHaveLength(0);
    expect(retriggered.started).toHaveLength(1);
  });

  it("progressively increases chat duration with an upper cap", () => {
    const a = makeArtist("a", 100, 100, "FOLLOWING");
    const b = makeArtist("b", 120, 100, "DRIFTING");
    const system = new CollisionSystem(40, 2000, 0, 250, 2400);

    system.update([a, b], 0);
    const firstStillActive = system.update([a, b], 1999);
    const firstResolved = system.update([a, b], 2001);
    const secondStarted = system.update([a, b], 2002);
    const secondStillActive = system.update([a, b], 4251);
    const secondResolved = system.update([a, b], 4253);

    expect(firstStillActive.resolved).toHaveLength(0);
    expect(firstResolved.resolved).toHaveLength(1);
    expect(secondStarted.started).toHaveLength(1);
    expect(secondStillActive.resolved).toHaveLength(0);
    expect(secondResolved.resolved).toHaveLength(1);
  });
});
