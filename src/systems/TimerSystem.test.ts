import { describe, expect, it } from "vitest";
import { Artist } from "../entities/Artist";
import { TimerSystem } from "./TimerSystem";

describe("TimerSystem", () => {
  it("emits timeout miss events when timers expire", () => {
    const artist = new Artist({
      id: "a-timeout",
      tier: "newcomer",
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      timerSeconds: 1
    });
    const system = new TimerSystem();

    const notYet = system.update([artist], 0.5);
    expect(notYet).toHaveLength(0);
    expect(artist.state).toBe("DRIFTING");

    const expired = system.update([artist], 0.6);
    expect(expired).toHaveLength(1);
    expect(expired[0]).toMatchObject({ artistId: "a-timeout", reason: "timeout" });
    expect(artist.state).toBe("MISSED");

    const duplicate = system.update([artist], 10);
    expect(duplicate).toHaveLength(0);
  });
});
