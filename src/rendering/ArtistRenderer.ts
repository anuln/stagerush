import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import type { ArtistSpriteConfig } from "../config/FestivalConfig";
import { Artist } from "../entities/Artist";
import { resolveAssetPath } from "../maps/MapLoader";
import { TimerRingRenderer } from "./TimerRingRenderer";

const WALK_FRAME_DURATION_MS = 240;

const TIER_STYLE = {
  headliner: { radius: 14, fill: 0xe7bf2f, ring: 0xf7d154, spriteSize: 38 },
  midtier: { radius: 11, fill: 0xb8b8c2, ring: 0xc9c9d6, spriteSize: 32 },
  newcomer: { radius: 9, fill: 0xc27a43, ring: 0xd8914f, spriteSize: 28 }
} as const;

function isWalkState(state: Artist["state"]): boolean {
  return state === "DRIFTING" || state === "FOLLOWING";
}

function isPerformingState(state: Artist["state"]): boolean {
  return state === "PERFORMING";
}

function pickVariantIndex(artistId: string, total: number): number {
  if (total <= 1) {
    return 0;
  }

  const trailingNumberMatch = artistId.match(/(\d+)(?!.*\d)/);
  if (trailingNumberMatch) {
    const sequence = Number.parseInt(trailingNumberMatch[1], 10);
    if (Number.isFinite(sequence) && sequence > 0) {
      return (sequence - 1) % total;
    }
  }

  let hash = 0;
  for (let index = 0; index < artistId.length; index += 1) {
    hash = (hash * 33 + artistId.charCodeAt(index)) >>> 0;
  }
  return hash % total;
}

export function resolveArtistSpritePath(
  artist: Artist,
  artistSprites: ArtistSpriteConfig[],
  nowMs: number
): string | null {
  const explicitProfile = artist.spriteProfileId
    ? artistSprites.find((entry) => entry.id === artist.spriteProfileId) ?? null
    : null;
  const candidates = artistSprites.filter((entry) => entry.tier === artist.tier);
  const profile =
    explicitProfile ??
    (candidates.length > 0
      ? candidates[pickVariantIndex(artist.id, candidates.length)]
      : null);
  if (!profile) {
    return null;
  }
  if (isPerformingState(artist.state)) {
    return profile.sprites.performing;
  }

  if (isWalkState(artist.state)) {
    const frameIndex =
      Math.floor(nowMs / WALK_FRAME_DURATION_MS) % profile.sprites.walk.length;
    return profile.sprites.walk[frameIndex];
  }

  return profile.sprites.idle;
}

export class ArtistRenderer {
  private readonly layer: Container;
  private readonly artistSprites: ArtistSpriteConfig[];
  private readonly timerRingRenderer = new TimerRingRenderer();

  constructor(layer: Container, artistSprites: ArtistSpriteConfig[] = []) {
    this.layer = layer;
    this.artistSprites = artistSprites;
  }

  render(artists: Artist[], nowMs = 0): void {
    this.layer.removeChildren();

    for (const artist of artists) {
      if (artist.state === "COMPLETED") {
        continue;
      }

      const style = TIER_STYLE[artist.tier];
      const container = new Container();
      container.position.set(artist.position.x, artist.position.y);

      const timerProgress = artist.initialTimerSeconds
        ? artist.timerRemainingSeconds / artist.initialTimerSeconds
        : 0;
      container.addChild(this.timerRingRenderer.createRing(style.radius, timerProgress));

      const ring = new Graphics();
      ring.circle(0, 0, style.radius + 4);
      ring.fill({ color: style.ring, alpha: artist.state === "MISSED" ? 0.25 : 0.42 });
      ring.stroke({ color: 0x121212, width: 1, alpha: 0.65 });
      container.addChild(ring);

      const spritePath = resolveArtistSpritePath(artist, this.artistSprites, nowMs);
      const texture = spritePath ? this.getTexture(spritePath) : null;
      if (texture) {
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.width = style.spriteSize;
        sprite.height = style.spriteSize;
        if (artist.state === "MISSED") {
          sprite.tint = 0x7a7a7a;
          sprite.alpha = 0.7;
        }
        container.addChild(sprite);
      } else {
        const fallback = new Graphics();
        fallback.circle(0, 0, style.radius);
        fallback.fill(artist.state === "MISSED" ? 0x4a4a4a : style.fill);
        fallback.stroke({ color: 0x151515, width: 2 });
        container.addChild(fallback);
      }

      this.layer.addChild(container);
    }
  }

  private getTexture(path: string): Texture | null {
    const resolved = resolveAssetPath(path);
    const texture = Assets.get(resolved) as Texture | undefined;
    if (texture && texture !== Texture.EMPTY) {
      return texture;
    }

    const direct = Assets.get(path) as Texture | undefined;
    if (direct && direct !== Texture.EMPTY) {
      return direct;
    }

    return null;
  }
}
