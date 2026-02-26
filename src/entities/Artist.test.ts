import { describe, expect, it } from "vitest";
import { Artist } from "./Artist";

describe("Artist", () => {
  it("drifts by velocity using delta time", () => {
    const artist = new Artist({
      id: "artist-1",
      tier: "newcomer",
      position: { x: 10, y: 20 },
      velocity: { x: 30, y: -10 },
      timerSeconds: 12
    });

    artist.updateDrift(2);

    expect(artist.position.x).toBe(70);
    expect(artist.position.y).toBe(0);
  });

  it("marks artist as missed when timer expires", () => {
    const artist = new Artist({
      id: "artist-2",
      tier: "midtier",
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      timerSeconds: 1
    });

    const didExpire = artist.tickTimer(1.1);

    expect(didExpire).toBe(true);
    expect(artist.state).toBe("MISSED");
    expect(artist.missReason).toBe("timeout");
    expect(artist.timerRemainingSeconds).toBe(0);
  });

  it("marks artist missed when exiting bounds", () => {
    const artist = new Artist({
      id: "artist-3",
      tier: "headliner",
      position: { x: 50, y: 50 },
      velocity: { x: 100, y: 0 },
      timerSeconds: 10
    });

    artist.updateDrift(1);
    const wentOutOfBounds = artist.checkBoundsAndMarkMissed({
      minX: 0,
      minY: 0,
      maxX: 120,
      maxY: 120
    });

    expect(wentOutOfBounds).toBe(true);
    expect(artist.state).toBe("MISSED");
    expect(artist.missReason).toBe("bounds");
  });

});
