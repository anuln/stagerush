import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import {
  GLOBAL_FALLBACK_ASSET_PATHS,
  getAssetCandidatePaths
} from "../assets/GlobalAssetFallbacks";
import { GAME_CONFIG } from "../config/GameConfig";
import type { ArtistSpriteConfig } from "../config/FestivalConfig";
import { Artist } from "../entities/Artist";
import { resolveAssetPath } from "../maps/MapLoader";

const WALK_FRAME_DURATION_MS = 240;

const TIER_STYLE = {
  headliner: { radius: 14, fill: 0xe7bf2f, ring: 0xf7d154, spriteSize: 38 },
  midtier: { radius: 11, fill: 0xb8b8c2, ring: 0xc9c9d6, spriteSize: 32 },
  newcomer: { radius: 9, fill: 0xc27a43, ring: 0xd8914f, spriteSize: 28 }
} as const;

function isWalkState(state: Artist["state"]): boolean {
  return (
    state === "SPAWNING" ||
    state === "DRIFTING" ||
    state === "FOLLOWING" ||
    state === "ARRIVING"
  );
}

function isPerformingState(state: Artist["state"]): boolean {
  return state === "PERFORMING";
}

function isDistractionState(state: Artist["state"]): boolean {
  return state === "CHATTING" || state === "DISTRACTED";
}

function shouldRenderTimerBar(state: Artist["state"]): boolean {
  return (
    state === "SPAWNING" ||
    state === "DRIFTING" ||
    state === "FOLLOWING" ||
    state === "CHATTING" ||
    state === "DISTRACTED" ||
    state === "ARRIVING"
  );
}

function parseHexColor(color: string | null | undefined, fallback: number): number {
  if (!color) {
    return fallback;
  }
  const normalized = color.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return fallback;
  }
  const parsed = Number.parseInt(normalized, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
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
    return GLOBAL_FALLBACK_ASSET_PATHS.artist;
  }
  if (isPerformingState(artist.state)) {
    return profile.sprites.performing;
  }

  if (isDistractionState(artist.state)) {
    return (
      profile.sprites.distracted ??
      profile.sprites.walk[0] ??
      profile.sprites.idle ??
      GLOBAL_FALLBACK_ASSET_PATHS.artist
    );
  }

  if (isWalkState(artist.state)) {
    if (!Array.isArray(profile.sprites.walk) || profile.sprites.walk.length === 0) {
      return profile.sprites.idle ?? GLOBAL_FALLBACK_ASSET_PATHS.artist;
    }
    const frameIndex =
      Math.floor(nowMs / WALK_FRAME_DURATION_MS) % profile.sprites.walk.length;
    return profile.sprites.walk[frameIndex];
  }

  return (
    profile.sprites.walk[0] ??
    profile.sprites.idle ??
    GLOBAL_FALLBACK_ASSET_PATHS.artist
  );
}

export class ArtistRenderer {
  private readonly layer: Container;
  private readonly artistSprites: ArtistSpriteConfig[];

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
      const renderScale = GAME_CONFIG.artist.renderScale;
      const spriteSize = Math.round(style.spriteSize * renderScale);
      const container = new Container();
      container.position.set(artist.position.x, artist.position.y);

      const bounceOffset = isPerformingState(artist.state)
        ? Math.sin(
            (nowMs / 1000) * Math.PI * 2 * GAME_CONFIG.artist.performBounceHz
          ) * GAME_CONFIG.artist.performBouncePx
        : 0;

      const shadow = new Graphics();
      shadow.ellipse(
        0,
        GAME_CONFIG.artist.shadowOffsetY,
        Math.max(10, spriteSize * 0.4),
        Math.max(4, spriteSize * 0.18)
      );
      shadow.fill({
        color: 0x07090f,
        alpha: GAME_CONFIG.artist.shadowAlpha
      });
      container.addChild(shadow);

      const spritePath = resolveArtistSpritePath(artist, this.artistSprites, nowMs);
      const texture = spritePath ? this.getTexture(spritePath) : null;
      if (texture) {
        const outlineSprite = new Sprite(texture);
        outlineSprite.anchor.set(0.5);
        outlineSprite.width = spriteSize * 1.08;
        outlineSprite.height = spriteSize * 1.08;
        outlineSprite.y = -bounceOffset + 1;
        outlineSprite.tint = 0x090f1c;
        outlineSprite.alpha = 0.36;
        container.addChild(outlineSprite);

        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.width = spriteSize;
        sprite.height = spriteSize;
        sprite.y = -bounceOffset;
        if (artist.state === "MISSED") {
          sprite.tint = 0x7a7a7a;
          sprite.alpha = 0.7;
        }
        container.addChild(sprite);
      } else {
        const fallbackSize = style.radius * renderScale * 1.35;
        const fallback = new Graphics();
        fallback.roundRect(
          -fallbackSize / 2,
          -bounceOffset - fallbackSize / 2,
          fallbackSize,
          fallbackSize,
          Math.max(6, fallbackSize * 0.22)
        );
        fallback.fill(artist.state === "MISSED" ? 0x4a4a4a : style.fill);
        fallback.stroke({ color: 0x0a0f1c, width: 2.4, alpha: 0.88 });
        container.addChild(fallback);
      }

      if (shouldRenderTimerBar(artist.state)) {
        const timerProgress = artist.initialTimerSeconds
          ? artist.timerRemainingSeconds / artist.initialTimerSeconds
          : 0;
        const barWidth = Math.max(18, spriteSize * 0.68);
        const barHeight = GAME_CONFIG.artist.timerBarHeightPx;
        const barY = spriteSize * 0.5 + GAME_CONFIG.artist.timerBarPaddingY;
        const safeProgress = Math.max(0, Math.min(1, timerProgress));
        const fillWidth = barWidth * safeProgress;
        const fillRight = barWidth / 2;
        const fillLeft = fillRight - fillWidth;
        const stageColor = parseHexColor(artist.assignedStageColor, style.ring);

        const barTrack = new Graphics();
        barTrack.roundRect(-barWidth / 2, barY, barWidth, barHeight, 2);
        barTrack.fill({ color: 0x0d1220, alpha: 0.62 });
        barTrack.stroke({ color: 0x101726, width: 1, alpha: 0.5 });
        container.addChild(barTrack);

        const barFill = new Graphics();
        barFill.roundRect(fillLeft, barY, fillWidth, barHeight, 2);
        barFill.fill({ color: stageColor, alpha: 0.82 });
        container.addChild(barFill);
      }

      this.layer.addChild(container);
    }
  }

  private getTexture(path: string): Texture | null {
    const candidates = getAssetCandidatePaths("artist", path);
    for (const candidate of candidates) {
      const resolved = resolveAssetPath(candidate);
      const texture = Assets.get(resolved) as Texture | undefined;
      if (texture && texture !== Texture.EMPTY) {
        return texture;
      }
      const direct = Assets.get(candidate) as Texture | undefined;
      if (direct && direct !== Texture.EMPTY) {
        return direct;
      }
    }

    return null;
  }
}
