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
const MISSED_GHOST_START_ALPHA = 0.7;
const MISSED_GHOST_MIN_ALPHA = 0.14;
const MISSED_GHOST_FADE_MS = 12_000;

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

export function computeMissedGhostAlpha(
  nowMs: number,
  missedAtMs: number | null
): number {
  if (missedAtMs === null) {
    return MISSED_GHOST_START_ALPHA;
  }
  const elapsedMs = Math.max(0, nowMs - missedAtMs);
  const progress = Math.min(1, elapsedMs / MISSED_GHOST_FADE_MS);
  return (
    MISSED_GHOST_START_ALPHA +
    (MISSED_GHOST_MIN_ALPHA - MISSED_GHOST_START_ALPHA) * progress
  );
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
  private readonly visuals = new Map<string, ArtistVisual>();

  constructor(layer: Container, artistSprites: ArtistSpriteConfig[] = []) {
    this.layer = layer;
    this.artistSprites = artistSprites;
  }

  render(artists: Artist[], nowMs = 0): void {
    const seenArtistIds = new Set<string>();

    for (const artist of artists) {
      if (artist.state === "COMPLETED") {
        continue;
      }
      seenArtistIds.add(artist.id);

      const style = TIER_STYLE[artist.tier];
      const renderScale = GAME_CONFIG.artist.renderScale;
      const spriteSize = Math.round(style.spriteSize * renderScale);
      const visual = this.getOrCreateVisual(artist.id);
      if (artist.state === "MISSED") {
        if (visual.missedAtMs === null) {
          visual.missedAtMs = nowMs;
        }
      } else {
        visual.missedAtMs = null;
      }
      const missedGhostAlpha =
        artist.state === "MISSED"
          ? computeMissedGhostAlpha(nowMs, visual.missedAtMs)
          : 1;
      visual.container.position.set(artist.position.x, artist.position.y);

      const bounceOffset = isPerformingState(artist.state)
        ? Math.sin(
            (nowMs / 1000) * Math.PI * 2 * GAME_CONFIG.artist.performBounceHz
          ) * GAME_CONFIG.artist.performBouncePx
        : 0;

      if (visual.spriteSize !== spriteSize) {
        this.redrawShadow(visual.shadow, spriteSize);
        visual.spriteSize = spriteSize;
      }

      const spritePath = resolveArtistSpritePath(artist, this.artistSprites, nowMs);
      const texture = spritePath ? this.getTexture(spritePath) : null;
      if (texture) {
        visual.outlineSprite.visible = true;
        visual.sprite.visible = true;
        visual.fallback.visible = false;
        if (visual.texturePath !== spritePath) {
          visual.outlineSprite.texture = texture;
          visual.sprite.texture = texture;
          visual.texturePath = spritePath;
        }
        visual.outlineSprite.width = spriteSize * 1.08;
        visual.outlineSprite.height = spriteSize * 1.08;
        visual.outlineSprite.y = -bounceOffset + 1;
        visual.outlineSprite.tint = 0x090f1c;
        visual.outlineSprite.alpha =
          artist.state === "MISSED" ? Math.max(0.08, missedGhostAlpha * 0.52) : 0.36;

        visual.sprite.width = spriteSize;
        visual.sprite.height = spriteSize;
        visual.sprite.y = -bounceOffset;
        if (artist.state === "MISSED") {
          visual.sprite.tint = 0x7a7a7a;
          visual.sprite.alpha = missedGhostAlpha;
        } else {
          visual.sprite.tint = 0xffffff;
          visual.sprite.alpha = 1;
        }
      } else {
        visual.outlineSprite.visible = false;
        visual.sprite.visible = false;
        visual.texturePath = null;
        visual.fallback.visible = true;
        const fallbackSize = style.radius * renderScale * 1.35;
        visual.fallback.clear();
        visual.fallback.roundRect(
          -fallbackSize / 2,
          -bounceOffset - fallbackSize / 2,
          fallbackSize,
          fallbackSize,
          Math.max(6, fallbackSize * 0.22)
        );
        visual.fallback.fill(artist.state === "MISSED" ? 0x4a4a4a : style.fill);
        visual.fallback.stroke({ color: 0x0a0f1c, width: 2.4, alpha: 0.88 });
        visual.fallback.alpha = artist.state === "MISSED" ? missedGhostAlpha : 1;
      }
      visual.shadow.alpha =
        artist.state === "MISSED"
          ? GAME_CONFIG.artist.shadowAlpha * missedGhostAlpha
          : GAME_CONFIG.artist.shadowAlpha;

      if (shouldRenderTimerBar(artist.state)) {
        visual.barTrack.visible = true;
        visual.barFill.visible = true;
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

        if (visual.barWidth !== barWidth || visual.barY !== barY) {
          visual.barTrack.clear();
          visual.barTrack.roundRect(-barWidth / 2, barY, barWidth, barHeight, 2);
          visual.barTrack.fill({ color: 0x0d1220, alpha: 0.62 });
          visual.barTrack.stroke({ color: 0x101726, width: 1, alpha: 0.5 });
          visual.barWidth = barWidth;
          visual.barY = barY;
        }

        visual.barFill.clear();
        visual.barFill.roundRect(fillLeft, barY, fillWidth, barHeight, 2);
        visual.barFill.fill({ color: stageColor, alpha: 0.82 });
      } else {
        visual.barTrack.visible = false;
        visual.barFill.visible = false;
      }
    }

    for (const [artistId, visual] of this.visuals) {
      if (seenArtistIds.has(artistId)) {
        continue;
      }
      visual.container.removeFromParent();
      visual.container.destroy({ children: true });
      this.visuals.delete(artistId);
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

  private getOrCreateVisual(artistId: string): ArtistVisual {
    const existing = this.visuals.get(artistId);
    if (existing) {
      return existing;
    }

    const container = new Container();
    const shadow = new Graphics();
    const outlineSprite = new Sprite(Texture.EMPTY);
    outlineSprite.anchor.set(0.5);
    const sprite = new Sprite(Texture.EMPTY);
    sprite.anchor.set(0.5);
    const fallback = new Graphics();
    const barTrack = new Graphics();
    const barFill = new Graphics();

    container.addChild(
      shadow,
      outlineSprite,
      sprite,
      fallback,
      barTrack,
      barFill
    );
    this.layer.addChild(container);

    const visual: ArtistVisual = {
      container,
      shadow,
      outlineSprite,
      sprite,
      fallback,
      barTrack,
      barFill,
      texturePath: null,
      spriteSize: -1,
      barWidth: -1,
      barY: -1,
      missedAtMs: null
    };
    this.visuals.set(artistId, visual);
    return visual;
  }

  private redrawShadow(shadow: Graphics, spriteSize: number): void {
    shadow.clear();
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
  }
}

interface ArtistVisual {
  container: Container;
  shadow: Graphics;
  outlineSprite: Sprite;
  sprite: Sprite;
  fallback: Graphics;
  barTrack: Graphics;
  barFill: Graphics;
  texturePath: string | null;
  spriteSize: number;
  barWidth: number;
  barY: number;
  missedAtMs: number | null;
}
