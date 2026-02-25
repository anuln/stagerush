import { describe, expect, it } from "vitest";
import type { ArtistSpriteConfig } from "../config/FestivalConfig";
import { ArtistProfilePool } from "./ArtistProfilePool";

function makeArtists(): ArtistSpriteConfig[] {
  return [
    {
      id: "headliner-a",
      name: "Headliner A",
      tier: "headliner",
      debutLevel: 1,
      sprites: {
        walk: ["h-a-w1", "h-a-w2"],
        idle: "h-a-idle",
        performing: "h-a-perf"
      }
    },
    {
      id: "headliner-b",
      name: "Headliner B",
      tier: "headliner",
      debutLevel: 5,
      sprites: {
        walk: ["h-b-w1", "h-b-w2"],
        idle: "h-b-idle",
        performing: "h-b-perf"
      }
    },
    {
      id: "mid-a",
      name: "Mid A",
      tier: "midtier",
      debutLevel: 1,
      sprites: {
        walk: ["m-a-w1", "m-a-w2"],
        idle: "m-a-idle",
        performing: "m-a-perf"
      }
    },
    {
      id: "mid-b",
      name: "Mid B",
      tier: "midtier",
      debutLevel: 3,
      sprites: {
        walk: ["m-b-w1", "m-b-w2"],
        idle: "m-b-idle",
        performing: "m-b-perf"
      }
    },
    {
      id: "new-a",
      name: "New A",
      tier: "newcomer",
      debutLevel: 1,
      sprites: {
        walk: ["n-a-w1", "n-a-w2"],
        idle: "n-a-idle",
        performing: "n-a-perf"
      }
    },
    {
      id: "new-b",
      name: "New B",
      tier: "newcomer",
      debutLevel: 2,
      sprites: {
        walk: ["n-b-w1", "n-b-w2"],
        idle: "n-b-idle",
        performing: "n-b-perf"
      }
    }
  ];
}

describe("ArtistProfilePool", () => {
  it("limits picks to profiles unlocked for current level", () => {
    const pool = new ArtistProfilePool(makeArtists(), {
      levelNumber: 1,
      rng: () => 0.2
    });

    const picks = Array.from({ length: 4 }, () => pool.pickProfileId("headliner"));
    expect(picks.every((id) => id === "headliner-a")).toBe(true);
  });

  it("expands candidate roster as level increases", () => {
    const pool = new ArtistProfilePool(makeArtists(), {
      levelNumber: 5,
      rng: (() => {
        const values = [0.1, 0.9, 0.1, 0.9];
        let index = 0;
        return () => values[index++ % values.length];
      })()
    });

    const picks = Array.from({ length: 4 }, () => pool.pickProfileId("headliner"));
    expect(new Set(picks)).toEqual(new Set(["headliner-a", "headliner-b"]));
  });

  it("avoids immediate repeats when tier has multiple eligible profiles", () => {
    const pool = new ArtistProfilePool(makeArtists(), {
      levelNumber: 4,
      rng: () => 0.5
    });

    const picks = Array.from({ length: 6 }, () => pool.pickProfileId("midtier"));
    for (let index = 1; index < picks.length; index += 1) {
      expect(picks[index]).not.toBe(picks[index - 1]);
    }
  });
});
