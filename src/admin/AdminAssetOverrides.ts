import type {
  FestivalMap,
  IntroPresentationConfig,
  NormalizedPoint,
  SessionFxConfig,
  SessionPeriod
} from "../config/FestivalConfig";
import {
  resolveSessionPreviewMode,
  sanitizeSessionFxProfile,
  SESSION_PERIODS,
  type SessionFxPreviewMode
} from "../config/SessionFx";

export const ADMIN_OVERRIDES_STORAGE_KEY = "stagecall:admin-asset-overrides:v1";

interface AdminOverridesStore {
  version: 2;
  byFestival: Record<string, AdminAssetOverrides>;
}

export interface ArtistAssetOverride {
  walk1?: string;
  walk2?: string;
  walk3?: string;
  idle?: string;
  distracted?: string;
  performing?: string;
  performanceAudioClip?: string;
  performanceAudioLengthSec?: number;
  seed?: number;
  seedDeterminismWarning?: string;
}

export interface AdminAssetOverrides {
  background?: string;
  introScreen?: string;
  introPresentation?: IntroPresentationConfig;
  sessionFx?: SessionFxConfig;
  sessionFxPreview?: SessionFxPreviewMode;
  stageSprites?: Record<string, string>;
  stagePositions?: Record<string, NormalizedPoint>;
  distractionSprites?: Record<string, string>;
  audioCues?: Record<string, string>;
  artistSprites?: Record<string, ArtistAssetOverride>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cloneOverrides(overrides: AdminAssetOverrides): AdminAssetOverrides {
  return structuredClone(overrides);
}

function parseStore(raw: string): AdminOverridesStore | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      isObject(parsed) &&
      parsed.version === 2 &&
      isObject(parsed.byFestival)
    ) {
      return {
        version: 2,
        byFestival: parsed.byFestival as Record<string, AdminAssetOverrides>
      };
    }

    // Backward compatibility with legacy single-festival shape.
    if (isObject(parsed)) {
      return {
        version: 2,
        byFestival: {
          __legacy__: parsed as AdminAssetOverrides
        }
      };
    }
  } catch {
    return null;
  }
  return null;
}

function readStore(): AdminOverridesStore {
  if (typeof window === "undefined") {
    return { version: 2, byFestival: {} };
  }
  const raw = window.localStorage.getItem(ADMIN_OVERRIDES_STORAGE_KEY);
  if (!raw) {
    return { version: 2, byFestival: {} };
  }
  return parseStore(raw) ?? { version: 2, byFestival: {} };
}

function writeStore(store: AdminOverridesStore): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    ADMIN_OVERRIDES_STORAGE_KEY,
    JSON.stringify(store, null, 2)
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sanitizeStagePositions(
  stagePositions?: Record<string, NormalizedPoint>
): Record<string, NormalizedPoint> | undefined {
  if (!stagePositions) {
    return undefined;
  }
  const next: Record<string, NormalizedPoint> = {};
  for (const [stageId, position] of Object.entries(stagePositions)) {
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      continue;
    }
    next[stageId] = {
      x: clamp01(position.x),
      y: clamp01(position.y)
    };
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function sanitizeIntroPresentation(
  introPresentation?: IntroPresentationConfig
): IntroPresentationConfig | undefined {
  if (!introPresentation) {
    return undefined;
  }
  const next: IntroPresentationConfig = {};
  if (introPresentation.fitMode === "cover" || introPresentation.fitMode === "contain") {
    next.fitMode = introPresentation.fitMode;
  }
  if (Number.isFinite(introPresentation.focusX)) {
    next.focusX = Math.max(0, Math.min(100, Number(introPresentation.focusX)));
  }
  if (Number.isFinite(introPresentation.focusY)) {
    next.focusY = Math.max(0, Math.min(100, Number(introPresentation.focusY)));
  }
  if (Number.isFinite(introPresentation.zoom)) {
    next.zoom = Math.max(0.5, Math.min(3, Number(introPresentation.zoom)));
  }
  if (Number.isFinite(introPresentation.overlayOpacity)) {
    next.overlayOpacity = Math.max(
      0,
      Math.min(1, Number(introPresentation.overlayOpacity))
    );
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function sanitizeSessionFxConfig(
  sessionFx?: SessionFxConfig
): SessionFxConfig | undefined {
  if (!sessionFx) {
    return undefined;
  }
  const next: SessionFxConfig = {};
  for (const session of SESSION_PERIODS) {
    const source = sessionFx[session];
    if (!source) {
      continue;
    }
    const fallback = {
      overlayColor: "#FFFFFF",
      overlayOpacity: 0,
      particleColor: "#FFFFFF",
      particleCount: 0,
      particleSpeed: 12,
      stageGlow: 0
    };
    const sanitized = sanitizeSessionFxProfile(source, fallback);
    const partial: NonNullable<SessionFxConfig[SessionPeriod]> = {};
    if (source.overlayColor !== undefined) {
      partial.overlayColor = sanitized.overlayColor;
    }
    if (source.overlayOpacity !== undefined) {
      partial.overlayOpacity = sanitized.overlayOpacity;
    }
    if (source.particleColor !== undefined) {
      partial.particleColor = sanitized.particleColor;
    }
    if (source.particleCount !== undefined) {
      partial.particleCount = sanitized.particleCount;
    }
    if (source.particleSpeed !== undefined) {
      partial.particleSpeed = sanitized.particleSpeed;
    }
    if (source.stageGlow !== undefined) {
      partial.stageGlow = sanitized.stageGlow;
    }
    if (Object.keys(partial).length > 0) {
      next[session] = partial;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function loadAdminAssetOverrides(festivalId: string): AdminAssetOverrides {
  const store = readStore();
  const direct = store.byFestival[festivalId];
  if (direct) {
    return cloneOverrides(direct);
  }
  const legacy = store.byFestival.__legacy__;
  if (legacy) {
    return cloneOverrides(legacy);
  }
  return {};
}

export function saveAdminAssetOverrides(
  festivalId: string,
  overrides: AdminAssetOverrides
): void {
  const store = readStore();
  const normalized: AdminAssetOverrides = {
    ...cloneOverrides(overrides),
    introPresentation: sanitizeIntroPresentation(overrides.introPresentation),
    sessionFx: sanitizeSessionFxConfig(overrides.sessionFx),
    sessionFxPreview: resolveSessionPreviewMode(overrides.sessionFxPreview),
    stagePositions: sanitizeStagePositions(overrides.stagePositions)
  };

  if (!hasAdminAssetOverrides(normalized)) {
    delete store.byFestival[festivalId];
  } else {
    store.byFestival[festivalId] = normalized;
  }
  delete store.byFestival.__legacy__;
  writeStore(store);
}

export function clearAdminAssetOverrides(festivalId?: string): void {
  if (typeof window === "undefined") {
    return;
  }
  if (!festivalId) {
    window.localStorage.removeItem(ADMIN_OVERRIDES_STORAGE_KEY);
    return;
  }
  const store = readStore();
  delete store.byFestival[festivalId];
  delete store.byFestival.__legacy__;
  if (Object.keys(store.byFestival).length === 0) {
    window.localStorage.removeItem(ADMIN_OVERRIDES_STORAGE_KEY);
    return;
  }
  writeStore(store);
}

export function hasAdminAssetOverrides(overrides: AdminAssetOverrides): boolean {
  if (typeof overrides.background === "string" && overrides.background.length > 0) {
    return true;
  }
  if (typeof overrides.introScreen === "string" && overrides.introScreen.length > 0) {
    return true;
  }
  if (
    overrides.introPresentation &&
    Object.keys(overrides.introPresentation).length > 0
  ) {
    return true;
  }
  if (overrides.sessionFx && Object.keys(overrides.sessionFx).length > 0) {
    return true;
  }
  if (overrides.stageSprites && Object.keys(overrides.stageSprites).length > 0) {
    return true;
  }
  if (overrides.stagePositions && Object.keys(overrides.stagePositions).length > 0) {
    return true;
  }
  if (
    overrides.distractionSprites &&
    Object.keys(overrides.distractionSprites).length > 0
  ) {
    return true;
  }
  if (overrides.audioCues && Object.keys(overrides.audioCues).length > 0) {
    return true;
  }
  if (overrides.artistSprites) {
    for (const artistOverride of Object.values(overrides.artistSprites)) {
      if (
        artistOverride.walk1 ||
        artistOverride.walk2 ||
        artistOverride.walk3 ||
        artistOverride.idle ||
        artistOverride.distracted ||
        artistOverride.performing ||
        artistOverride.performanceAudioClip ||
        Number.isFinite(artistOverride.performanceAudioLengthSec) ||
        Number.isInteger(artistOverride.seed) ||
        (artistOverride.seedDeterminismWarning ?? "").length > 0
      ) {
        return true;
      }
    }
  }
  return false;
}

export function applyAdminAssetOverrides(
  map: FestivalMap,
  overrides: AdminAssetOverrides
): FestivalMap {
  const cloned = structuredClone(map);

  if (overrides.background) {
    cloned.background = overrides.background;
  }
  if (overrides.introScreen) {
    cloned.introScreen = overrides.introScreen;
  }
  if (overrides.introPresentation) {
    cloned.introPresentation = {
      ...(cloned.introPresentation ?? {}),
      ...sanitizeIntroPresentation(overrides.introPresentation)
    };
  }
  if (overrides.sessionFx) {
    cloned.sessionFx = {
      ...(cloned.sessionFx ?? {}),
      ...sanitizeSessionFxConfig(overrides.sessionFx)
    };
  }

  if (overrides.stagePositions) {
    for (const stage of cloned.stages) {
      const overridePosition = overrides.stagePositions[stage.id];
      if (!overridePosition) {
        continue;
      }
      stage.position = {
        x: clamp01(overridePosition.x),
        y: clamp01(overridePosition.y)
      };
    }
  }

  if (overrides.stageSprites) {
    for (const stage of cloned.stages) {
      const overridePath = overrides.stageSprites[stage.id];
      if (overridePath) {
        stage.sprite = overridePath;
      }
    }
    cloned.assets.stageSprites = {
      ...cloned.assets.stageSprites,
      ...overrides.stageSprites
    };
  }

  if (overrides.distractionSprites) {
    for (const distraction of cloned.distractions) {
      const overridePath = overrides.distractionSprites[distraction.type];
      if (overridePath) {
        distraction.sprite = overridePath;
      }
    }
    cloned.assets.distractionSprites = {
      ...cloned.assets.distractionSprites,
      ...overrides.distractionSprites
    };
  }

  if (overrides.audioCues) {
    cloned.assets.audio = {
      ...cloned.assets.audio,
      ...overrides.audioCues
    };
  }

  if (overrides.artistSprites) {
    for (const artist of cloned.assets.artists) {
      const artistOverride = overrides.artistSprites[artist.id];
      if (!artistOverride) {
        continue;
      }
      if (artistOverride.walk1) {
        artist.sprites.walk[0] = artistOverride.walk1;
      }
      if (artistOverride.walk2 && artist.sprites.walk.length > 1) {
        artist.sprites.walk[1] = artistOverride.walk2;
      }
      if (artistOverride.walk3) {
        if (artist.sprites.walk.length > 2) {
          artist.sprites.walk[2] = artistOverride.walk3;
        } else {
          artist.sprites.walk.push(artistOverride.walk3);
        }
      }
      if (artistOverride.idle) {
        artist.sprites.idle = artistOverride.idle;
      }
      if (artistOverride.distracted) {
        artist.sprites.distracted = artistOverride.distracted;
      }
      if (artistOverride.performing) {
        artist.sprites.performing = artistOverride.performing;
      }
      if (
        artistOverride.performanceAudioClip ||
        Number.isFinite(artistOverride.performanceAudioLengthSec)
      ) {
        artist.performanceAudio = {
          ...(artist.performanceAudio ?? {})
        };
        if (artistOverride.performanceAudioClip) {
          artist.performanceAudio.clip = artistOverride.performanceAudioClip;
        }
        if (Number.isFinite(artistOverride.performanceAudioLengthSec)) {
          artist.performanceAudio.lengthSec = artistOverride.performanceAudioLengthSec;
        }
      }
      if (Number.isInteger(artistOverride.seed) && (artistOverride.seed ?? -1) >= 0) {
        artist.seed = artistOverride.seed;
      }
      if (
        typeof artistOverride.seedDeterminismWarning === "string" &&
        artistOverride.seedDeterminismWarning.length > 0
      ) {
        artist.seedDeterminismWarning = artistOverride.seedDeterminismWarning;
      }
    }
  }

  return cloned;
}

export function isAdminModeEnabled(search = window.location.search): boolean {
  const params = new URLSearchParams(search);
  return params.get("admin") === "1";
}
