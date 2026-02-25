import type { FestivalMap, NormalizedPoint } from "../config/FestivalConfig";
import type {
  AdminAssetOverrides,
  ArtistAssetOverride
} from "../admin/AdminAssetOverrides";
import { toResolvedPath } from "../admin/AdminPreviewModel";

export interface SpriteCatalogEntry {
  id: string;
  category: "background" | "stage" | "distraction" | "artist";
  assetPath: string;
  promptText: string;
}

export interface AudioCatalogEntry {
  id: string;
  type: "music" | "sfx";
  assetPath: string;
  promptText: string;
}

export type SlotCategory =
  | "background"
  | "stage"
  | "distraction"
  | "artist"
  | "audio";

export type SlotMeta =
  | { kind: "background" }
  | { kind: "stage"; stageId: string }
  | { kind: "distraction"; distractionType: string }
  | { kind: "artist"; artistId: string; field: keyof ArtistAssetOverride }
  | { kind: "audio"; cueId: string };

export interface AssetSlot {
  id: string;
  label: string;
  category: SlotCategory;
  mediaType: "image" | "audio";
  defaultPath: string;
  overridePath: string | null;
  resolvedPath: string;
  promptText: string;
  meta: SlotMeta;
}

export interface BuildAssetSlotsOptions {
  inPlayOnly?: boolean;
  inPlayLevel?: number;
}

export function buildAssetSlots(
  map: FestivalMap,
  overrides: AdminAssetOverrides,
  spriteCatalog: SpriteCatalogEntry[],
  audioCatalog: AudioCatalogEntry[],
  options: BuildAssetSlotsOptions = {}
): AssetSlot[] {
  const slots: AssetSlot[] = [];
  const inPlayArtistIds = resolveInPlayArtistIds(
    map,
    options.inPlayLevel ?? 1,
    options.inPlayOnly !== false
  );

  const backgroundOverride = normalizeOverride(overrides.background);
  slots.push({
    id: "background",
    label: "Map Background",
    category: "background",
    mediaType: "image",
    defaultPath: map.background,
    overridePath: backgroundOverride,
    resolvedPath: toResolvedPath(backgroundOverride ?? map.background),
    promptText: resolvePromptText(map.background, spriteCatalog, audioCatalog),
    meta: { kind: "background" }
  });

  for (const stage of map.stages) {
    const overridePath = normalizeOverride(overrides.stageSprites?.[stage.id]);
    slots.push({
      id: `stage:${stage.id}`,
      label: `Stage · ${stage.id}`,
      category: "stage",
      mediaType: "image",
      defaultPath: stage.sprite,
      overridePath,
      resolvedPath: toResolvedPath(overridePath ?? stage.sprite),
      promptText: resolvePromptText(stage.sprite, spriteCatalog, audioCatalog),
      meta: { kind: "stage", stageId: stage.id }
    });
  }

  const distractionTypes = Array.from(
    new Set(map.distractions.map((entry) => entry.type))
  );
  for (const type of distractionTypes) {
    const defaultPath = map.assets.distractionSprites[type];
    const overridePath = normalizeOverride(overrides.distractionSprites?.[type]);
    slots.push({
      id: `distraction:${type}`,
      label: `Distraction · ${type}`,
      category: "distraction",
      mediaType: "image",
      defaultPath,
      overridePath,
      resolvedPath: toResolvedPath(overridePath ?? defaultPath),
      promptText: resolvePromptText(defaultPath, spriteCatalog, audioCatalog),
      meta: { kind: "distraction", distractionType: type }
    });
  }

  for (const artist of map.assets.artists) {
    if (inPlayArtistIds && !inPlayArtistIds.has(artist.id)) {
      continue;
    }
    const artistOverrides = overrides.artistSprites?.[artist.id];
    slots.push({
      id: `artist:${artist.id}:idle`,
      label: `Artist · ${artist.id} · idle`,
      category: "artist",
      mediaType: "image",
      defaultPath: artist.sprites.idle,
      overridePath: normalizeOverride(artistOverrides?.idle),
      resolvedPath: toResolvedPath(artistOverrides?.idle ?? artist.sprites.idle),
      promptText: resolvePromptText(artist.sprites.idle, spriteCatalog, audioCatalog),
      meta: { kind: "artist", artistId: artist.id, field: "idle" }
    });
    slots.push({
      id: `artist:${artist.id}:walk1`,
      label: `Artist · ${artist.id} · walk 1`,
      category: "artist",
      mediaType: "image",
      defaultPath: artist.sprites.walk[0],
      overridePath: normalizeOverride(artistOverrides?.walk1),
      resolvedPath: toResolvedPath(artistOverrides?.walk1 ?? artist.sprites.walk[0]),
      promptText: resolvePromptText(artist.sprites.walk[0], spriteCatalog, audioCatalog),
      meta: { kind: "artist", artistId: artist.id, field: "walk1" }
    });
    slots.push({
      id: `artist:${artist.id}:walk2`,
      label: `Artist · ${artist.id} · walk 2`,
      category: "artist",
      mediaType: "image",
      defaultPath: artist.sprites.walk[1],
      overridePath: normalizeOverride(artistOverrides?.walk2),
      resolvedPath: toResolvedPath(artistOverrides?.walk2 ?? artist.sprites.walk[1]),
      promptText: resolvePromptText(artist.sprites.walk[1], spriteCatalog, audioCatalog),
      meta: { kind: "artist", artistId: artist.id, field: "walk2" }
    });
    slots.push({
      id: `artist:${artist.id}:performing`,
      label: `Artist · ${artist.id} · performing`,
      category: "artist",
      mediaType: "image",
      defaultPath: artist.sprites.performing,
      overridePath: normalizeOverride(artistOverrides?.performing),
      resolvedPath: toResolvedPath(
        artistOverrides?.performing ?? artist.sprites.performing
      ),
      promptText: resolvePromptText(
        artist.sprites.performing,
        spriteCatalog,
        audioCatalog
      ),
      meta: { kind: "artist", artistId: artist.id, field: "performing" }
    });
  }

  for (const [cueId, defaultPath] of Object.entries(map.assets.audio)) {
    const overridePath = normalizeOverride(overrides.audioCues?.[cueId]);
    slots.push({
      id: `audio:${cueId}`,
      label: `Audio · ${cueId}`,
      category: "audio",
      mediaType: "audio",
      defaultPath,
      overridePath,
      resolvedPath: toResolvedPath(overridePath ?? defaultPath),
      promptText: resolvePromptText(defaultPath, spriteCatalog, audioCatalog),
      meta: { kind: "audio", cueId }
    });
  }

  return slots;
}

export function resolveInPlayArtistIds(
  map: FestivalMap,
  inPlayLevel: number,
  inPlayOnly = true
): Set<string> | null {
  if (!inPlayOnly) {
    return null;
  }
  const level = Math.max(1, Math.floor(inPlayLevel));
  return new Set(
    map.assets.artists
      .filter((artist) => {
        const debut = Number.isInteger(artist.debutLevel)
          ? Math.max(1, artist.debutLevel ?? 1)
          : 1;
        return debut <= level;
      })
      .map((artist) => artist.id)
  );
}

export function filterAssetSlots(
  slots: AssetSlot[],
  query: string,
  category: "all" | SlotCategory
): AssetSlot[] {
  const normalized = query.trim().toLowerCase();
  return slots.filter((slot) => {
    if (category !== "all" && slot.category !== category) {
      return false;
    }
    if (!normalized) {
      return true;
    }
    const haystack = `${slot.label} ${slot.defaultPath} ${slot.overridePath ?? ""}`;
    return haystack.toLowerCase().includes(normalized);
  });
}

export function getStagePosition(
  map: FestivalMap,
  overrides: AdminAssetOverrides,
  stageId: string
): NormalizedPoint {
  const override = overrides.stagePositions?.[stageId];
  if (override) {
    return {
      x: clamp01(override.x),
      y: clamp01(override.y)
    };
  }
  const stage = map.stages.find((entry) => entry.id === stageId);
  if (!stage) {
    return { x: 0.5, y: 0.5 };
  }
  return {
    x: clamp01(stage.position.x),
    y: clamp01(stage.position.y)
  };
}

export function setStagePositionOverride(
  overrides: AdminAssetOverrides,
  stageId: string,
  point: NormalizedPoint
): AdminAssetOverrides {
  const next = structuredClone(overrides);
  const stagePositions = { ...(next.stagePositions ?? {}) };
  stagePositions[stageId] = {
    x: clamp01(point.x),
    y: clamp01(point.y)
  };
  next.stagePositions = stagePositions;
  return next;
}

export function setOverrideForSlot(
  overrides: AdminAssetOverrides,
  meta: SlotMeta,
  value: string | null
): AdminAssetOverrides {
  const normalized = normalizeOverride(value);
  const next = structuredClone(overrides);

  if (meta.kind === "background") {
    if (!normalized) {
      delete next.background;
    } else {
      next.background = normalized;
    }
    return next;
  }

  if (meta.kind === "stage") {
    const stageSprites = { ...(next.stageSprites ?? {}) };
    mutateRecord(stageSprites, meta.stageId, normalized);
    assignOrDelete(next, "stageSprites", stageSprites);
    return next;
  }

  if (meta.kind === "distraction") {
    const distractionSprites = { ...(next.distractionSprites ?? {}) };
    mutateRecord(distractionSprites, meta.distractionType, normalized);
    assignOrDelete(next, "distractionSprites", distractionSprites);
    return next;
  }

  if (meta.kind === "artist") {
    const artistSprites = { ...(next.artistSprites ?? {}) };
    const artistEntry = { ...(artistSprites[meta.artistId] ?? {}) };
    if (!normalized) {
      delete artistEntry[meta.field];
    } else {
      artistEntry[meta.field] = normalized;
    }
    if (Object.keys(artistEntry).length === 0) {
      delete artistSprites[meta.artistId];
    } else {
      artistSprites[meta.artistId] = artistEntry;
    }
    assignOrDelete(next, "artistSprites", artistSprites);
    return next;
  }

  const audioCues = { ...(next.audioCues ?? {}) };
  mutateRecord(audioCues, meta.cueId, normalized);
  assignOrDelete(next, "audioCues", audioCues);
  return next;
}

export function resolvePromptText(
  assetPath: string,
  spriteCatalog: SpriteCatalogEntry[],
  audioCatalog: AudioCatalogEntry[]
): string {
  const normalized = normalizeAssetPath(assetPath);
  const spriteMatch = spriteCatalog.find(
    (entry) => normalizeAssetPath(entry.assetPath) === normalized
  );
  if (spriteMatch?.promptText) {
    return spriteMatch.promptText;
  }
  const audioMatch = audioCatalog.find(
    (entry) => normalizeAssetPath(entry.assetPath) === normalized
  );
  return audioMatch?.promptText ?? "";
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeAssetPath(path: string): string {
  return path.replace(/^\/+/, "");
}

function normalizeOverride(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mutateRecord(
  record: Record<string, string>,
  key: string,
  value: string | null
): void {
  if (!value) {
    delete record[key];
    return;
  }
  record[key] = value;
}

function assignOrDelete<T extends keyof AdminAssetOverrides>(
  overrides: AdminAssetOverrides,
  key: T,
  value: NonNullable<AdminAssetOverrides[T]>
): void {
  if (Object.keys(value).length === 0) {
    delete overrides[key];
    return;
  }
  overrides[key] = value;
}
