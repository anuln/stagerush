import { describe, expect, it } from "vitest";
import type { ArtistSpriteConfig } from "../config/FestivalConfig";
import { Artist } from "../entities/Artist";
import { resolveArtistSpritePath } from "./ArtistRenderer";

const artistSprites: ArtistSpriteConfig[] = [
  {
    id: "headliner-a",
    name: "Headliner A",
    tier: "headliner",
    sprites: {
      walk: [
        "artists/headliner-a-walk1.png",
        "artists/headliner-a-walk2.png",
        "artists/headliner-a-walk3.png"
      ],
      distracted: "artists/headliner-a-distracted.png",
      performing: "artists/headliner-a-performing.png"
    }
  },
  {
    id: "new-a",
    name: "New A",
    tier: "newcomer",
    sprites: {
      walk: ["artists/new-a-walk1.png", "artists/new-a-walk2.png"],
      distracted: "artists/new-a-distracted.png",
      performing: "artists/new-a-performing.png"
    }
  }
];

function makeArtist(
  id: string,
  tier: "headliner" | "midtier" | "newcomer",
  state: Artist["state"]
): Artist {
  return new Artist({
    id,
    tier,
    state,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    timerSeconds: 12
  });
}

describe("resolveArtistSpritePath", () => {
  it("cycles walk frames for active movement states", () => {
    const artist = makeArtist("headliner-1", "headliner", "DRIFTING");

    const first = resolveArtistSpritePath(artist, artistSprites, 0);
    const second = resolveArtistSpritePath(artist, artistSprites, 260);

    expect(first).toBe("artists/headliner-a-walk1.png");
    expect(second).toBe("artists/headliner-a-walk2.png");
  });

  it("uses idle/performing sprite paths for corresponding states", () => {
    const chatting = makeArtist("new-1", "newcomer", "CHATTING");
    const performing = makeArtist("new-1", "newcomer", "PERFORMING");

    expect(resolveArtistSpritePath(chatting, artistSprites, 0)).toBe(
      "artists/new-a-distracted.png"
    );
    expect(resolveArtistSpritePath(performing, artistSprites, 0)).toBe(
      "artists/new-a-performing.png"
    );
  });

  it("returns null when no sprite config exists for tier", () => {
    const artist = makeArtist("mid-1", "midtier", "DRIFTING");
    expect(resolveArtistSpritePath(artist, artistSprites, 0)).toBeNull();
  });

  it("does not use performance pose while routing when walk/idle are missing", () => {
    const sparseSprites: ArtistSpriteConfig[] = [
      {
        id: "new-solo",
        name: "New Solo",
        tier: "newcomer",
        sprites: {
          walk: [],
          performing: "artists/new-solo-performing.png"
        }
      }
    ];
    const routingArtist = makeArtist("new-3", "newcomer", "FOLLOWING");
    const performingArtist = makeArtist("new-3", "newcomer", "PERFORMING");

    expect(resolveArtistSpritePath(routingArtist, sparseSprites, 0)).toBeNull();
    expect(resolveArtistSpritePath(performingArtist, sparseSprites, 0)).toBe(
      "artists/new-solo-performing.png"
    );
  });

  it("prefers explicit sprite profile id over id-derived tier rotation", () => {
    const artist = new Artist({
      id: "headliner-999",
      tier: "headliner",
      state: "DRIFTING",
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      timerSeconds: 12,
      spriteProfileId: "headliner-a"
    });

    expect(resolveArtistSpritePath(artist, artistSprites, 0)).toBe(
      "artists/headliner-a-walk1.png"
    );
  });
});
