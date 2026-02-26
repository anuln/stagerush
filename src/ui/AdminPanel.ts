import type {
  FestivalMap,
  IntroPresentationConfig,
  SessionPeriod
} from "../config/FestivalConfig";
import {
  DEFAULT_SESSION_FX_CONFIG,
  resolveSessionPreviewMode
} from "../config/SessionFx";
import {
  applyAdminAssetOverrides,
  hasAdminAssetOverrides,
  saveAdminAssetOverrides,
  type AdminAssetOverrides
} from "../admin/AdminAssetOverrides";
import { toResolvedPath } from "../admin/AdminPreviewModel";
import {
  putFileToGitHub,
  readTextFileFromGitHub
} from "../admin/GitHubPublisher";
import {
  buildAssetSlots,
  filterAssetSlots,
  getDistractionPosition,
  getStagePosition,
  resolveInPlayArtistIds,
  setDistractionPositionOverride,
  setOverrideForSlot,
  setStagePositionOverride,
  type AssetSlot,
  type AudioCatalogEntry,
  type SlotCategory,
  type SpriteCatalogEntry
} from "./AdminPanelModel";

type AdminTab = "assets" | "generate" | "map" | "library" | "publish";
type ArtistSlotField =
  | "walk1"
  | "walk2"
  | "walk3"
  | "distracted"
  | "performing"
  | "performanceAudioClip";
type MapPlacementMode = "stage" | "distraction";

interface AdminPanelOptions {
  map: FestivalMap;
  mapConfigPath: string;
  festivals: Array<{ id: string; name: string }>;
  activeFestivalId: string;
  initialOverrides: AdminAssetOverrides;
  onFestivalChange: (festivalId: string) => void;
  onPreviewChange: (overrides: AdminAssetOverrides) => void;
  onApply: (overrides: AdminAssetOverrides) => void;
  onReset: () => void;
}

const GEMINI_KEY_STORAGE_KEY = "stagecall:admin:gemini-key";
const GEMINI_MODEL_DEFAULT = "gemini-2.5-flash-image";
const ELEVENLABS_KEY_STORAGE_KEY = "stagecall:admin:elevenlabs-key";
const GITHUB_TOKEN_STORAGE_KEY = "stagecall:admin:github-token";
const GITHUB_SETTINGS_STORAGE_KEY = "stagecall:admin:github-settings:v1";
const ELEVEN_SOUND_MODEL_ID = "eleven_text_to_sound_v2";
const ELEVEN_MAX_DURATION_SEC = 30;

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Failed to encode file as data URL"));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

async function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}

async function toPngDataUrl(sourceDataUrl: string): Promise<string> {
  const image = await loadImageFromDataUrl(sourceDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context unavailable");
  }
  context.drawImage(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function colorDistanceSq(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function quantize(value: number, step: number): number {
  return Math.max(0, Math.min(255, Math.round(value / step) * step));
}

async function removeBackgroundFromDataUrl(dataUrl: string): Promise<string> {
  const image = await loadImageFromDataUrl(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Canvas context unavailable");
  }
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;

  const borderCounts = new Map<string, { count: number; r: number; g: number; b: number }>();
  const readPixel = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    return {
      r: data[index],
      g: data[index + 1],
      b: data[index + 2],
      a: data[index + 3]
    };
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      if (!isBorder) {
        continue;
      }
      const pixel = readPixel(x, y);
      if (pixel.a <= 10) {
        continue;
      }
      const key = `${quantize(pixel.r, 8)},${quantize(pixel.g, 8)},${quantize(pixel.b, 8)}`;
      const current = borderCounts.get(key);
      if (current) {
        current.count += 1;
        current.r += pixel.r;
        current.g += pixel.g;
        current.b += pixel.b;
      } else {
        borderCounts.set(key, {
          count: 1,
          r: pixel.r,
          g: pixel.g,
          b: pixel.b
        });
      }
    }
  }
  const palette = Array.from(borderCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((entry) => ({
      r: Math.round(entry.r / entry.count),
      g: Math.round(entry.g / entry.count),
      b: Math.round(entry.b / entry.count)
    }));

  if (palette.length === 0) {
    return canvas.toDataURL("image/png");
  }

  const toleranceSq = 36 * 36;
  const softToleranceSq = 24 * 24;
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  const nearPalette = (r: number, g: number, b: number, tolerance: number): boolean =>
    palette.some((candidate) => colorDistanceSq({ r, g, b }, candidate) <= tolerance);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      if (!isBorder) {
        continue;
      }
      const index = y * width + x;
      const offset = index * 4;
      if (data[offset + 3] <= 10) {
        continue;
      }
      if (!nearPalette(data[offset], data[offset + 1], data[offset + 2], toleranceSq)) {
        continue;
      }
      visited[index] = 1;
      queue.push(index);
    }
  }

  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined) {
      continue;
    }
    const x = current % width;
    const y = Math.floor(current / width);
    const offset = current * 4;
    data[offset + 3] = 0;
    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1]
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      const nextIndex = ny * width + nx;
      if (visited[nextIndex] === 1) {
        continue;
      }
      const nextOffset = nextIndex * 4;
      if (data[nextOffset + 3] <= 10) {
        continue;
      }
      if (
        !nearPalette(
          data[nextOffset],
          data[nextOffset + 1],
          data[nextOffset + 2],
          toleranceSq
        )
      ) {
        continue;
      }
      visited[nextIndex] = 1;
      queue.push(nextIndex);
    }
  }

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const offset = index * 4;
      if (data[offset + 3] <= 10) {
        continue;
      }
      if (
        !nearPalette(data[offset], data[offset + 1], data[offset + 2], softToleranceSq)
      ) {
        continue;
      }
      const neighbors = [
        ((y - 1) * width + x) * 4,
        ((y + 1) * width + x) * 4,
        (y * width + x - 1) * 4,
        (y * width + x + 1) * 4
      ];
      if (neighbors.some((neighborOffset) => data[neighborOffset + 3] <= 10)) {
        data[offset + 3] = Math.min(data[offset + 3], 104);
      }
    }
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function readInlineGeminiImage(response: unknown): { mimeType: string; base64: string } | null {
  if (!response || typeof response !== "object") {
    return null;
  }
  const candidates = (
    response as {
      candidates?: Array<{
        content?: { parts?: Array<Record<string, unknown>> };
      }>;
    }
  ).candidates;
  if (!Array.isArray(candidates)) {
    return null;
  }
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) {
      continue;
    }
    for (const part of parts) {
      const inline =
        (part.inlineData as { data?: string; mimeType?: string } | undefined) ??
        (part.inline_data as { data?: string; mime_type?: string } | undefined);
      if (!inline?.data) {
        continue;
      }
      const mimeType =
        "mimeType" in inline && typeof inline.mimeType === "string"
          ? inline.mimeType
          : "mime_type" in inline && typeof inline.mime_type === "string"
            ? inline.mime_type
            : "image/png";
      return {
        mimeType,
        base64: inline.data
      };
    }
  }
  return null;
}

function summarizeAssetPath(path: string): string {
  if (path.startsWith("data:")) {
    const mimeMatch = /^data:([^;,]+)[;,]/.exec(path);
    const mime = mimeMatch?.[1] ?? "inline";
    return `inline-data (${mime})`;
  }
  if (path.startsWith("blob:")) {
    return "blob-url (session-local)";
  }
  return path;
}

function toRepoPathFromPublicUrl(path: string): string {
  const trimmed = path.trim();
  if (trimmed.startsWith("/assets/")) {
    return `public${trimmed}`;
  }
  if (trimmed.startsWith("assets/")) {
    return `public/${trimmed}`;
  }
  return trimmed.replace(/^\/+/, "");
}

function hasInlineAssetPath(path: string): boolean {
  return path.startsWith("data:") || path.startsWith("blob:");
}

function isVideoAssetPath(path: string): boolean {
  const normalized = path.trim().toLowerCase();
  if (normalized.startsWith("data:video/")) {
    return true;
  }
  return /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/.test(normalized);
}

function isImageDataUrl(path: string): boolean {
  return path.trim().toLowerCase().startsWith("data:image/");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function parseInlineDataAsset(
  value: string
): { mimeType: string; base64: string } | null {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/i.exec(value.trim());
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1].toLowerCase(),
    base64: match[2]
  };
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/ogg":
      return "ogg";
    case "audio/mp4":
      return "m4a";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    case "video/ogg":
      return "ogv";
    default:
      return "bin";
  }
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function sanitizeAssetLabel(label: string): string {
  const cleaned = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 56) : "asset";
}

function isArtistImageSlot(
  slot: AssetSlot,
  artistId: string
): slot is AssetSlot & {
  meta: { kind: "artist"; artistId: string; field: ArtistSlotField };
} {
  return (
    slot.mediaType === "image" &&
    slot.meta.kind === "artist" &&
    slot.meta.artistId === artistId
  );
}

type GeminiInlineDataPart = {
  inline_data: {
    mime_type: string;
    data: string;
  };
};

export function buildArtistSeedPrompt(basePrompt: string, seed: number): string {
  const prompt = basePrompt.trim();
  return `${prompt}

Character consistency requirements:
- Consistency seed: ${seed}
- Keep the exact same artist identity (face, hair, outfit silhouette, palette) as prior poses.
- Only change body pose/action for this frame; keep style and camera angle coherent.`;
}

export function dataUrlToInlineDataPart(dataUrl: string): GeminiInlineDataPart | null {
  const parsed = parseInlineDataAsset(dataUrl);
  if (!parsed) {
    return null;
  }
  if (!parsed.mimeType.startsWith("image/")) {
    return null;
  }
  return {
    inline_data: {
      mime_type: parsed.mimeType,
      data: parsed.base64
    }
  };
}

export function isGeminiSeedUnsupportedError(status: number, details: string): boolean {
  if (status < 400) {
    return false;
  }
  const normalized = details.toLowerCase();
  if (!normalized.includes("seed")) {
    return false;
  }
  return (
    normalized.includes("unknown name") ||
    normalized.includes("unknown field") ||
    normalized.includes("unrecognized field") ||
    normalized.includes("not supported") ||
    normalized.includes("invalid argument")
  );
}

async function resolveImagePathToDataUrl(path: string): Promise<string | null> {
  const trimmed = path.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("data:image/")) {
    return trimmed;
  }
  if (trimmed.startsWith("data:")) {
    return null;
  }
  try {
    const response = await fetch(trimmed, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) {
      return null;
    }
    return toDataUrl(blob);
  } catch {
    return null;
  }
}

export class AdminPanel {
  private map: FestivalMap;
  private readonly mapConfigPath: string;
  private readonly festivals: Array<{ id: string; name: string }>;
  private readonly activeFestivalId: string;
  private readonly onFestivalChange: AdminPanelOptions["onFestivalChange"];
  private readonly onPreviewChange: AdminPanelOptions["onPreviewChange"];
  private readonly onApply: AdminPanelOptions["onApply"];
  private readonly onReset: AdminPanelOptions["onReset"];
  private readonly root: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly fab: HTMLButtonElement;

  private draftOverrides: AdminAssetOverrides;
  private spriteCatalog: SpriteCatalogEntry[] = [];
  private audioCatalog: AudioCatalogEntry[] = [];
  private activeTab: AdminTab = "assets";
  private categoryFilter: "all" | SlotCategory = "all";
  private inPlayLevel = 1;
  private assetSearch = "";
  private selectedSlotId: string | null = null;
  private selectedMapPlacementMode: MapPlacementMode = "stage";
  private selectedStageForMap: string | null = null;
  private selectedDistractionForMap: string | null = null;
  private selectedSessionFxProfile: SessionPeriod = "morning";
  private slotCandidates = new Map<string, string>();
  private promptDraftBySlot = new Map<string, string>();
  private pathDraftBySlot = new Map<string, string>();
  private audioLengthDraftBySlot = new Map<string, string>();
  private generateStatus = "";
  private isGenerating = false;
  private geminiApiKey = "";
  private geminiModel = GEMINI_MODEL_DEFAULT;
  private rememberGeminiKey = false;
  private elevenLabsApiKey = "";
  private rememberElevenLabsKey = false;
  private selectedArtistId: string | null = null;
  private artistSeedDraftByArtist = new Map<string, string>();
  private artistAudioLengthDraftByArtist = new Map<string, string>();
  private artistSeedWarningByArtist = new Map<string, string>();
  private githubToken = "";
  private rememberGithubToken = false;
  private rememberGithubSettings = true;
  private githubOwner = "anuln";
  private githubRepo = "stagerush";
  private githubBranch = "main";
  private githubTargetPath = "";
  private githubCommitMessage = "";
  private publishStatus = "";
  private isPublishing = false;
  private isOpen = true;
  private sidebarScrollTop = 0;
  private workspaceScrollTop = 0;

  constructor(options: AdminPanelOptions) {
    this.map = options.map;
    this.mapConfigPath = options.mapConfigPath;
    this.festivals = options.festivals;
    this.activeFestivalId = options.activeFestivalId;
    this.onFestivalChange = options.onFestivalChange;
    this.onPreviewChange = options.onPreviewChange;
    this.onApply = options.onApply;
    this.onReset = options.onReset;
    this.draftOverrides = structuredClone(options.initialOverrides);

    this.selectedStageForMap = this.map.stages[0]?.id ?? null;
    this.selectedDistractionForMap = this.map.distractions[0]?.id ?? null;
    const rememberedGeminiKey = window.localStorage.getItem(GEMINI_KEY_STORAGE_KEY);
    if (rememberedGeminiKey && rememberedGeminiKey.trim().length > 0) {
      this.geminiApiKey = rememberedGeminiKey;
      this.rememberGeminiKey = true;
    }
    const rememberedElevenKey = window.localStorage.getItem(ELEVENLABS_KEY_STORAGE_KEY);
    if (rememberedElevenKey && rememberedElevenKey.trim().length > 0) {
      this.elevenLabsApiKey = rememberedElevenKey;
      this.rememberElevenLabsKey = true;
    }
    this.githubTargetPath = toRepoPathFromPublicUrl(this.mapConfigPath);
    this.githubCommitMessage = `chore(admin): update ${this.activeFestivalId} festival config`;

    const rememberedGithubToken = window.localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY);
    if (rememberedGithubToken && rememberedGithubToken.trim().length > 0) {
      this.githubToken = rememberedGithubToken;
      this.rememberGithubToken = true;
    }
    const rawGithubSettings = window.localStorage.getItem(GITHUB_SETTINGS_STORAGE_KEY);
    if (rawGithubSettings) {
      try {
        const parsed = JSON.parse(rawGithubSettings) as {
          owner?: string;
          repo?: string;
          branch?: string;
          targetPath?: string;
          remember?: boolean;
        };
        if (typeof parsed.owner === "string" && parsed.owner.trim().length > 0) {
          this.githubOwner = parsed.owner.trim();
        }
        if (typeof parsed.repo === "string" && parsed.repo.trim().length > 0) {
          this.githubRepo = parsed.repo.trim();
        }
        if (typeof parsed.branch === "string" && parsed.branch.trim().length > 0) {
          this.githubBranch = parsed.branch.trim();
        }
        if (typeof parsed.targetPath === "string" && parsed.targetPath.trim().length > 0) {
          this.githubTargetPath = parsed.targetPath.trim();
        }
        this.rememberGithubSettings = parsed.remember !== false;
      } catch {
        // Ignore malformed legacy settings.
      }
    }

    this.root = document.createElement("div");
    this.root.className = "admin-root";
    document.body.appendChild(this.root);

    this.fab = document.createElement("button");
    this.fab.type = "button";
    this.fab.className = "admin-fab";
    this.fab.textContent = "Open Admin";
    this.fab.addEventListener("click", () => {
      this.isOpen = true;
      this.render();
    });
    this.root.appendChild(this.fab);

    this.panel = document.createElement("div");
    this.panel.className = "admin-panel";
    this.root.appendChild(this.panel);

    void this.loadCatalogs();
  }

  private async loadCatalogs(): Promise<void> {
    const [sprites, audio] = await Promise.all([
      this.fetchCatalog<SpriteCatalogEntry>("/assets/admin/sprite_catalog.json"),
      this.fetchCatalog<AudioCatalogEntry>("/assets/admin/audio_catalog.json")
    ]);
    this.spriteCatalog = sprites;
    this.audioCatalog = audio;

    const slots = this.getAllSlots();
    const first = slots[0];
    if (first) {
      this.selectedSlotId = first.id;
      this.pathDraftBySlot.set(first.id, first.overridePath ?? first.defaultPath);
      this.promptDraftBySlot.set(first.id, first.promptText);
    }
    this.render();
  }

  private async fetchCatalog<T extends { id: string }>(path: string): Promise<T[]> {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) {
        return [];
      }
      const payload = (await response.json()) as { entries?: T[] };
      return Array.isArray(payload.entries) ? payload.entries : [];
    } catch {
      return [];
    }
  }

  private getAllSlots(): AssetSlot[] {
    return buildAssetSlots(
      this.map,
      this.draftOverrides,
      this.spriteCatalog,
      this.audioCatalog,
      {
        inPlayOnly: true,
        inPlayLevel: this.inPlayLevel
      }
    );
  }

  private getSelectedSlot(slots: AssetSlot[]): AssetSlot | null {
    if (!slots.some((slot) => slot.id === this.selectedSlotId)) {
      this.selectedSlotId = slots[0]?.id ?? null;
    }
    if (!this.selectedSlotId) {
      return null;
    }
    const slot = slots.find((entry) => entry.id === this.selectedSlotId) ?? null;
    if (!slot) {
      return null;
    }
    if (!this.pathDraftBySlot.has(slot.id)) {
      this.pathDraftBySlot.set(slot.id, slot.overridePath ?? slot.defaultPath);
    }
    if (!this.promptDraftBySlot.has(slot.id)) {
      this.promptDraftBySlot.set(slot.id, slot.promptText);
    }
    return slot;
  }

  private getArtistGroups(slots: AssetSlot[]): Array<{
    artistId: string;
    label: string;
    state: "override" | "default";
    slotIds: string[];
  }> {
    const groups = new Map<
      string,
      { label: string; hasOverride: boolean; slotIds: string[] }
    >();
    for (const slot of slots) {
      if (slot.meta.kind !== "artist") {
        continue;
      }
      const artistId = slot.meta.artistId;
      const artistOverride = this.draftOverrides.artistSprites?.[artistId];
      const artist = this.map.assets.artists.find(
        (entry) => entry.id === artistId
      );
      const label = artist
        ? `${artist.name} (${artist.tier})`
        : artistId;
      const current = groups.get(artistId) ?? {
        label,
        hasOverride: false,
        slotIds: []
      };
      current.hasOverride =
        current.hasOverride ||
        Boolean(slot.overridePath) ||
        Boolean(artistOverride?.seed) ||
        Boolean(artistOverride?.seedDeterminismWarning) ||
        Boolean(artistOverride?.performanceAudioLengthSec);
      current.slotIds.push(slot.id);
      groups.set(artistId, current);
    }
    return Array.from(groups.entries())
      .map(([artistId, value]) => ({
        artistId,
        label: value.label,
        state: (value.hasOverride ? "override" : "default") as "override" | "default",
        slotIds: value.slotIds
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  private isArtistEditingMode(): boolean {
    return (
      (this.activeTab === "assets" || this.activeTab === "generate") &&
      this.categoryFilter === "artist"
    );
  }

  private getArtistSlots(slots: AssetSlot[], artistId: string): AssetSlot[] {
    return slots.filter(
      (slot): slot is AssetSlot =>
        slot.meta.kind === "artist" && slot.meta.artistId === artistId
    );
  }

  private getArtistSlotByField(
    slots: AssetSlot[],
    artistId: string,
    field: ArtistSlotField
  ): AssetSlot | null {
    return (
      slots.find(
        (slot) =>
          slot.meta.kind === "artist" &&
          slot.meta.artistId === artistId &&
          slot.meta.field === field
      ) ?? null
    );
  }

  private getArtistSeedWarning(artistId: string): string {
    const draft = this.artistSeedWarningByArtist.get(artistId);
    if (draft !== undefined) {
      return draft;
    }
    const overrideWarning =
      this.draftOverrides.artistSprites?.[artistId]?.seedDeterminismWarning;
    if (overrideWarning && overrideWarning.trim().length > 0) {
      return overrideWarning;
    }
    const mapWarning = this.map.assets.artists.find(
      (artist) => artist.id === artistId
    )?.seedDeterminismWarning;
    return mapWarning?.trim() ?? "";
  }

  private setArtistSeedWarning(artistId: string, warning: string): void {
    const normalized = warning.trim();
    const next = structuredClone(this.draftOverrides);
    const artistSprites = { ...(next.artistSprites ?? {}) };
    const artistEntry = { ...(artistSprites[artistId] ?? {}) };
    if (normalized.length > 0) {
      artistEntry.seedDeterminismWarning = normalized;
      this.artistSeedWarningByArtist.set(artistId, normalized);
    } else {
      delete artistEntry.seedDeterminismWarning;
      this.artistSeedWarningByArtist.delete(artistId);
    }
    if (Object.keys(artistEntry).length > 0) {
      artistSprites[artistId] = artistEntry;
      next.artistSprites = artistSprites;
    } else {
      delete artistSprites[artistId];
      if (Object.keys(artistSprites).length > 0) {
        next.artistSprites = artistSprites;
      } else {
        delete next.artistSprites;
      }
    }
    this.draftOverrides = next;
    this.notifyPreviewChange();
  }

  private setArtistPerformanceAudioPath(artistId: string, path: string | null): void {
    const next = structuredClone(this.draftOverrides);
    const artistSprites = { ...(next.artistSprites ?? {}) };
    const artistEntry = { ...(artistSprites[artistId] ?? {}) };
    if (path && path.trim().length > 0) {
      artistEntry.performanceAudioClip = path.trim();
    } else {
      delete artistEntry.performanceAudioClip;
    }
    if (Object.keys(artistEntry).length > 0) {
      artistSprites[artistId] = artistEntry;
      next.artistSprites = artistSprites;
    } else {
      delete artistSprites[artistId];
      if (Object.keys(artistSprites).length > 0) {
        next.artistSprites = artistSprites;
      } else {
        delete next.artistSprites;
      }
    }
    this.draftOverrides = next;
    this.notifyPreviewChange();
  }

  private getArtistSeed(artistId: string): number {
    const overrideSeed = this.draftOverrides.artistSprites?.[artistId]?.seed;
    if (Number.isInteger(overrideSeed) && (overrideSeed ?? -1) >= 0) {
      return overrideSeed as number;
    }
    const mapSeed = this.map.assets.artists.find((artist) => artist.id === artistId)?.seed;
    if (Number.isInteger(mapSeed) && (mapSeed ?? -1) >= 0) {
      return mapSeed as number;
    }
    let hash = 0;
    for (let index = 0; index < artistId.length; index += 1) {
      hash = (hash * 31 + artistId.charCodeAt(index)) >>> 0;
    }
    return Math.max(1, hash % 9_999_999);
  }

  private rotateArtistSeed(artistId: string): number {
    const seed = Math.floor(Math.random() * 9_999_999);
    const next = structuredClone(this.draftOverrides);
    const artistSprites = { ...(next.artistSprites ?? {}) };
    const artistEntry = { ...(artistSprites[artistId] ?? {}) };
    artistEntry.seed = seed;
    artistEntry.seedDeterminismWarning = "";
    artistSprites[artistId] = artistEntry;
    next.artistSprites = artistSprites;
    this.draftOverrides = next;
    this.notifyPreviewChange();
    this.artistSeedDraftByArtist.set(artistId, String(seed));
    this.artistSeedWarningByArtist.delete(artistId);
    return seed;
  }

  private resetArtistSet(artistId: string): number {
    const seed = Math.floor(Math.random() * 9_999_999);
    const next = structuredClone(this.draftOverrides);
    const artistSprites = { ...(next.artistSprites ?? {}) };
    const existingEntry = artistSprites[artistId] ?? {};
    const resetEntry: Record<string, unknown> = {
      seed
    };
    if (Number.isFinite(existingEntry.performanceAudioLengthSec)) {
      resetEntry.performanceAudioLengthSec = existingEntry.performanceAudioLengthSec;
    }
    artistSprites[artistId] = resetEntry;
    next.artistSprites = artistSprites;
    this.draftOverrides = next;

    const artistSlots = this.getArtistSlots(this.getAllSlots(), artistId);
    const mapArtist = this.map.assets.artists.find((entry) => entry.id === artistId);
    for (const slot of artistSlots) {
      this.slotCandidates.delete(slot.id);
      if (slot.mediaType === "image") {
        this.pathDraftBySlot.set(slot.id, "");
      } else if (slot.meta.kind === "artist" && slot.meta.field === "performanceAudioClip") {
        this.pathDraftBySlot.set(slot.id, mapArtist?.performanceAudio?.clip ?? "");
      }
    }
    this.artistSeedDraftByArtist.set(artistId, String(seed));
    this.artistSeedWarningByArtist.delete(artistId);
    this.notifyPreviewChange();
    return seed;
  }

  private setArtistSeed(artistId: string, value: string): void {
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }
    const next = structuredClone(this.draftOverrides);
    const artistSprites = { ...(next.artistSprites ?? {}) };
    const artistEntry = { ...(artistSprites[artistId] ?? {}) };
    artistEntry.seed = parsed;
    artistEntry.seedDeterminismWarning = "";
    artistSprites[artistId] = artistEntry;
    next.artistSprites = artistSprites;
    this.draftOverrides = next;
    this.notifyPreviewChange();
    this.artistSeedDraftByArtist.set(artistId, String(parsed));
    this.artistSeedWarningByArtist.delete(artistId);
  }

  private getArtistAudioLengthSec(artistId: string): number {
    const overrideLength =
      this.draftOverrides.artistSprites?.[artistId]?.performanceAudioLengthSec;
    if (Number.isFinite(overrideLength) && (overrideLength ?? 0) > 0) {
      return Number(overrideLength);
    }
    const mapLength =
      this.map.assets.artists.find((artist) => artist.id === artistId)?.performanceAudio
        ?.lengthSec ?? 3;
    return Number.isFinite(mapLength) && mapLength > 0 ? mapLength : 3;
  }

  private setArtistAudioLengthSec(artistId: string, value: string): void {
    const parsed = Number.parseFloat(value.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    const next = structuredClone(this.draftOverrides);
    const artistSprites = { ...(next.artistSprites ?? {}) };
    const artistEntry = { ...(artistSprites[artistId] ?? {}) };
    artistEntry.performanceAudioLengthSec = Math.max(
      0.5,
      Math.min(ELEVEN_MAX_DURATION_SEC, parsed)
    );
    artistSprites[artistId] = artistEntry;
    next.artistSprites = artistSprites;
    this.draftOverrides = next;
    this.notifyPreviewChange();
    this.artistAudioLengthDraftByArtist.set(
      artistId,
      String(artistEntry.performanceAudioLengthSec)
    );
  }

  private normalizeAssetPath(path: string): string {
    return path.trim().replace(/^\/+/, "");
  }

  private getAudioLengthSecForSlot(slot: AssetSlot): number {
    if (slot.meta.kind === "artist" && slot.meta.field === "performanceAudioClip") {
      return this.getArtistAudioLengthSec(slot.meta.artistId);
    }
    const drafted = this.audioLengthDraftBySlot.get(slot.id);
    if (drafted) {
      const parsed = Number.parseFloat(drafted);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.max(0.5, Math.min(ELEVEN_MAX_DURATION_SEC, parsed));
      }
    }
    if (slot.meta.kind === "audio" && slot.meta.cueId.startsWith("bg_")) {
      return 30;
    }
    return 3;
  }

  private setAudioLengthSecForSlot(slot: AssetSlot, value: string): void {
    const parsed = Number.parseFloat(value.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    const normalized = Math.max(0.5, Math.min(ELEVEN_MAX_DURATION_SEC, parsed));
    if (slot.meta.kind === "artist" && slot.meta.field === "performanceAudioClip") {
      this.setArtistAudioLengthSec(slot.meta.artistId, String(normalized));
      return;
    }
    this.audioLengthDraftBySlot.set(slot.id, String(normalized));
  }

  private describeUsageForSlot(slot: AssetSlot): string {
    if (slot.meta.kind === "introScreen") {
      return "Used on the full-screen Start Festival intro screen before gameplay begins. Supports image or looping video with framing controls.";
    }
    if (slot.meta.kind === "artist") {
      if (slot.meta.field !== "performanceAudioClip") {
        return "";
      }
      const artistId = slot.meta.artistId;
      const artist = this.map.assets.artists.find((entry) => entry.id === artistId);
      return `Used when ${artist?.name ?? artistId} reaches a stage and begins performing.`;
    }
    if (slot.meta.kind === "audio") {
      const cue = slot.meta.cueId;
      const usageMap: Record<string, string> = {
        bg_chill: "Background music for early rounds.",
        bg_energy: "Background music for mid rounds.",
        bg_peak: "Background music for late rounds.",
        spawn: "SFX when a new artist spawns into the map.",
        path_draw: "SFX while drawing artist paths.",
        deliver: "SFX when an artist reaches a stage.",
        deliver_combo: "SFX for combo delivery moments.",
        miss: "SFX when an artist is missed.",
        chat: "SFX when artists meet/chat.",
        distraction: "SFX when a distraction triggers.",
        level_complete: "SFX when a session/round completes.",
        level_failed: "SFX when a session/round fails.",
        timer_warning: "SFX for low-time warning moments."
      };
      return usageMap[cue] ?? `Audio cue used by runtime event '${cue}'.`;
    }
    return "";
  }

  private findUsageLabelsForAssetPath(assetPath: string): string[] {
    const target = this.normalizeAssetPath(assetPath);
    if (!target) {
      return [];
    }
    const slots = this.getAllSlots();
    const labels = slots
      .filter((slot) => this.normalizeAssetPath(slot.defaultPath) === target)
      .map((slot) => slot.label);
    return Array.from(new Set(labels));
  }

  private getIntroPresentationDraft(): Required<IntroPresentationConfig> {
    const base = this.map.introPresentation ?? {};
    const draft = this.draftOverrides.introPresentation ?? {};
    return {
      fitMode: draft.fitMode ?? base.fitMode ?? "cover",
      focusX: clamp(draft.focusX ?? base.focusX ?? 50, 0, 100),
      focusY: clamp(draft.focusY ?? base.focusY ?? 50, 0, 100),
      zoom: clamp(draft.zoom ?? base.zoom ?? 1, 0.7, 2.5),
      overlayOpacity: clamp(draft.overlayOpacity ?? base.overlayOpacity ?? 0.82, 0, 1)
    };
  }

  private setIntroPresentation(partial: Partial<IntroPresentationConfig>): void {
    const current = this.getIntroPresentationDraft();
    const nextValue: IntroPresentationConfig = {
      fitMode:
        partial.fitMode ?? current.fitMode ?? "cover",
      focusX:
        partial.focusX !== undefined ? clamp(partial.focusX, 0, 100) : current.focusX,
      focusY:
        partial.focusY !== undefined ? clamp(partial.focusY, 0, 100) : current.focusY,
      zoom:
        partial.zoom !== undefined ? clamp(partial.zoom, 0.7, 2.5) : current.zoom,
      overlayOpacity:
        partial.overlayOpacity !== undefined
          ? clamp(partial.overlayOpacity, 0, 1)
          : current.overlayOpacity
    };
    this.draftOverrides = {
      ...this.draftOverrides,
      introPresentation: nextValue
    };
    this.notifyPreviewChange();
    this.render();
  }

  private resetIntroPresentation(): void {
    const next = structuredClone(this.draftOverrides);
    delete next.introPresentation;
    this.draftOverrides = next;
    this.notifyPreviewChange();
    this.render();
  }

  private getSessionFxPreviewMode(): "auto" | SessionPeriod {
    return resolveSessionPreviewMode(this.draftOverrides.sessionFxPreview);
  }

  private setSessionFxPreviewMode(mode: "auto" | SessionPeriod): void {
    const next = structuredClone(this.draftOverrides);
    if (mode === "auto") {
      delete next.sessionFxPreview;
    } else {
      next.sessionFxPreview = mode;
    }
    this.draftOverrides = next;
    this.notifyPreviewChange();
    this.render();
  }

  private getSessionFxProfileDraft(
    period: SessionPeriod
  ): Required<(typeof DEFAULT_SESSION_FX_CONFIG)[SessionPeriod]> {
    const defaults = DEFAULT_SESSION_FX_CONFIG[period];
    const fromMap = this.map.sessionFx?.[period];
    const fromOverride = this.draftOverrides.sessionFx?.[period];
    return {
      overlayColor:
        fromOverride?.overlayColor ??
        fromMap?.overlayColor ??
        defaults.overlayColor,
      overlayOpacity: clamp(
        fromOverride?.overlayOpacity ??
          fromMap?.overlayOpacity ??
          defaults.overlayOpacity,
        0,
        0.6
      ),
      particleColor:
        fromOverride?.particleColor ??
        fromMap?.particleColor ??
        defaults.particleColor,
      particleCount: Math.round(
        clamp(
          fromOverride?.particleCount ??
            fromMap?.particleCount ??
            defaults.particleCount,
          0,
          80
        )
      ),
      particleSpeed: clamp(
        fromOverride?.particleSpeed ??
          fromMap?.particleSpeed ??
          defaults.particleSpeed,
        4,
        64
      ),
      stageGlow: clamp(
        fromOverride?.stageGlow ??
          fromMap?.stageGlow ??
          defaults.stageGlow,
        0,
        1
      )
    };
  }

  private setSessionFxProfile(
    period: SessionPeriod,
    partial: Partial<(typeof DEFAULT_SESSION_FX_CONFIG)[SessionPeriod]>
  ): void {
    const current = this.getSessionFxProfileDraft(period);
    const normalized = {
      overlayColor: partial.overlayColor ?? current.overlayColor,
      overlayOpacity:
        partial.overlayOpacity !== undefined
          ? clamp(partial.overlayOpacity, 0, 0.6)
          : current.overlayOpacity,
      particleColor: partial.particleColor ?? current.particleColor,
      particleCount:
        partial.particleCount !== undefined
          ? Math.round(clamp(partial.particleCount, 0, 80))
          : current.particleCount,
      particleSpeed:
        partial.particleSpeed !== undefined
          ? clamp(partial.particleSpeed, 4, 64)
          : current.particleSpeed,
      stageGlow:
        partial.stageGlow !== undefined
          ? clamp(partial.stageGlow, 0, 1)
          : current.stageGlow
    };
    const next = structuredClone(this.draftOverrides);
    next.sessionFx = {
      ...(next.sessionFx ?? {}),
      [period]: normalized
    };
    this.draftOverrides = next;
    this.notifyPreviewChange();
    this.render();
  }

  private resetSessionFxProfile(period: SessionPeriod): void {
    const next = structuredClone(this.draftOverrides);
    if (next.sessionFx) {
      delete next.sessionFx[period];
      if (Object.keys(next.sessionFx).length === 0) {
        delete next.sessionFx;
      }
    }
    this.draftOverrides = next;
    this.notifyPreviewChange();
    this.render();
  }

  private buildSessionFxControls(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "admin-filter-card";

    const heading = document.createElement("p");
    heading.className = "admin-preview-meta";
    heading.textContent = "Session atmosphere";
    wrapper.appendChild(heading);

    const previewField = document.createElement("label");
    previewField.className = "admin-field";
    previewField.innerHTML = "<span>Preview Session</span>";
    const previewSelect = document.createElement("select");
    previewSelect.className = "admin-select";
    previewSelect.innerHTML = [
      "<option value=\"auto\">Auto (from game session)</option>",
      "<option value=\"morning\">Morning</option>",
      "<option value=\"afternoon\">Afternoon</option>",
      "<option value=\"evening\">Evening</option>"
    ].join("");
    previewSelect.value = this.getSessionFxPreviewMode();
    previewSelect.addEventListener("change", () => {
      const next = resolveSessionPreviewMode(previewSelect.value);
      this.setSessionFxPreviewMode(next);
    });
    previewField.appendChild(previewSelect);
    wrapper.appendChild(previewField);

    const profileField = document.createElement("label");
    profileField.className = "admin-field";
    profileField.innerHTML = "<span>Edit Profile</span>";
    const profileSelect = document.createElement("select");
    profileSelect.className = "admin-select";
    profileSelect.innerHTML = [
      "<option value=\"morning\">Morning</option>",
      "<option value=\"afternoon\">Afternoon</option>",
      "<option value=\"evening\">Evening</option>"
    ].join("");
    profileSelect.value = this.selectedSessionFxProfile;
    profileSelect.addEventListener("change", () => {
      const next = resolveSessionPreviewMode(profileSelect.value);
      if (next !== "auto") {
        this.selectedSessionFxProfile = next;
        this.render();
      }
    });
    profileField.appendChild(profileSelect);
    wrapper.appendChild(profileField);

    const profile = this.getSessionFxProfileDraft(this.selectedSessionFxProfile);

    const overlayColorField = document.createElement("label");
    overlayColorField.className = "admin-field";
    overlayColorField.innerHTML = "<span>Overlay Color</span>";
    const overlayColorInput = document.createElement("input");
    overlayColorInput.type = "color";
    overlayColorInput.className = "admin-input";
    overlayColorInput.value = profile.overlayColor;
    overlayColorInput.addEventListener("input", () => {
      this.setSessionFxProfile(this.selectedSessionFxProfile, {
        overlayColor: overlayColorInput.value
      });
    });
    overlayColorField.appendChild(overlayColorInput);
    wrapper.appendChild(overlayColorField);

    const overlayAlphaField = document.createElement("label");
    overlayAlphaField.className = "admin-field";
    overlayAlphaField.innerHTML = "<span>Overlay Opacity</span>";
    const overlayAlphaInput = document.createElement("input");
    overlayAlphaInput.type = "range";
    overlayAlphaInput.className = "admin-input";
    overlayAlphaInput.min = "0";
    overlayAlphaInput.max = "60";
    overlayAlphaInput.step = "1";
    overlayAlphaInput.value = String(Math.round(profile.overlayOpacity * 100));
    const overlayAlphaValue = document.createElement("small");
    overlayAlphaValue.className = "admin-preview-meta";
    overlayAlphaValue.textContent = `${Math.round(profile.overlayOpacity * 100)}%`;
    overlayAlphaInput.addEventListener("input", () => {
      const value = Number.parseFloat(overlayAlphaInput.value) / 100;
      overlayAlphaValue.textContent = `${Math.round(value * 100)}%`;
      this.setSessionFxProfile(this.selectedSessionFxProfile, {
        overlayOpacity: value
      });
    });
    overlayAlphaField.append(overlayAlphaInput, overlayAlphaValue);
    wrapper.appendChild(overlayAlphaField);

    const particleColorField = document.createElement("label");
    particleColorField.className = "admin-field";
    particleColorField.innerHTML = "<span>Particle Color</span>";
    const particleColorInput = document.createElement("input");
    particleColorInput.type = "color";
    particleColorInput.className = "admin-input";
    particleColorInput.value = profile.particleColor;
    particleColorInput.addEventListener("input", () => {
      this.setSessionFxProfile(this.selectedSessionFxProfile, {
        particleColor: particleColorInput.value
      });
    });
    particleColorField.appendChild(particleColorInput);
    wrapper.appendChild(particleColorField);

    const particleCountField = document.createElement("label");
    particleCountField.className = "admin-field";
    particleCountField.innerHTML = "<span>Particle Count</span>";
    const particleCountInput = document.createElement("input");
    particleCountInput.type = "range";
    particleCountInput.className = "admin-input";
    particleCountInput.min = "0";
    particleCountInput.max = "80";
    particleCountInput.step = "1";
    particleCountInput.value = String(profile.particleCount);
    const particleCountValue = document.createElement("small");
    particleCountValue.className = "admin-preview-meta";
    particleCountValue.textContent = String(profile.particleCount);
    particleCountInput.addEventListener("input", () => {
      const value = Math.round(Number.parseFloat(particleCountInput.value));
      particleCountValue.textContent = String(value);
      this.setSessionFxProfile(this.selectedSessionFxProfile, {
        particleCount: value
      });
    });
    particleCountField.append(particleCountInput, particleCountValue);
    wrapper.appendChild(particleCountField);

    const stageGlowField = document.createElement("label");
    stageGlowField.className = "admin-field";
    stageGlowField.innerHTML = "<span>Stage Glow</span>";
    const stageGlowInput = document.createElement("input");
    stageGlowInput.type = "range";
    stageGlowInput.className = "admin-input";
    stageGlowInput.min = "0";
    stageGlowInput.max = "100";
    stageGlowInput.step = "1";
    stageGlowInput.value = String(Math.round(profile.stageGlow * 100));
    const stageGlowValue = document.createElement("small");
    stageGlowValue.className = "admin-preview-meta";
    stageGlowValue.textContent = `${Math.round(profile.stageGlow * 100)}%`;
    stageGlowInput.addEventListener("input", () => {
      const value = Number.parseFloat(stageGlowInput.value) / 100;
      stageGlowValue.textContent = `${Math.round(value * 100)}%`;
      this.setSessionFxProfile(this.selectedSessionFxProfile, {
        stageGlow: value
      });
    });
    stageGlowField.append(stageGlowInput, stageGlowValue);
    wrapper.appendChild(stageGlowField);

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "admin-btn";
    reset.textContent = "Reset Session FX";
    reset.addEventListener("click", () => {
      this.resetSessionFxProfile(this.selectedSessionFxProfile);
    });
    wrapper.appendChild(reset);

    return wrapper;
  }

  private buildIntroFramingControls(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "admin-filter-card";

    const heading = document.createElement("p");
    heading.className = "admin-preview-meta";
    heading.textContent = "Intro framing";
    wrapper.appendChild(heading);

    const intro = this.getIntroPresentationDraft();

    const fitField = document.createElement("label");
    fitField.className = "admin-field";
    fitField.innerHTML = "<span>Fit</span>";
    const fitSelect = document.createElement("select");
    fitSelect.className = "admin-select";
    fitSelect.innerHTML =
      "<option value=\"cover\">Cover</option><option value=\"contain\">Contain</option>";
    fitSelect.value = intro.fitMode;
    fitSelect.addEventListener("change", () => {
      this.setIntroPresentation({
        fitMode: fitSelect.value === "contain" ? "contain" : "cover"
      });
    });
    fitField.appendChild(fitSelect);
    wrapper.appendChild(fitField);

    const focusXField = document.createElement("label");
    focusXField.className = "admin-field";
    focusXField.innerHTML = "<span>Focus X</span>";
    const focusXInput = document.createElement("input");
    focusXInput.type = "range";
    focusXInput.className = "admin-input";
    focusXInput.min = "0";
    focusXInput.max = "100";
    focusXInput.step = "1";
    focusXInput.value = String(Math.round(intro.focusX));
    const focusXValue = document.createElement("small");
    focusXValue.className = "admin-preview-meta";
    focusXValue.textContent = `${Math.round(intro.focusX)}%`;
    focusXInput.addEventListener("input", () => {
      const value = Number.parseFloat(focusXInput.value);
      focusXValue.textContent = `${Math.round(value)}%`;
      this.setIntroPresentation({ focusX: value });
    });
    focusXField.append(focusXInput, focusXValue);
    wrapper.appendChild(focusXField);

    const focusYField = document.createElement("label");
    focusYField.className = "admin-field";
    focusYField.innerHTML = "<span>Focus Y</span>";
    const focusYInput = document.createElement("input");
    focusYInput.type = "range";
    focusYInput.className = "admin-input";
    focusYInput.min = "0";
    focusYInput.max = "100";
    focusYInput.step = "1";
    focusYInput.value = String(Math.round(intro.focusY));
    const focusYValue = document.createElement("small");
    focusYValue.className = "admin-preview-meta";
    focusYValue.textContent = `${Math.round(intro.focusY)}%`;
    focusYInput.addEventListener("input", () => {
      const value = Number.parseFloat(focusYInput.value);
      focusYValue.textContent = `${Math.round(value)}%`;
      this.setIntroPresentation({ focusY: value });
    });
    focusYField.append(focusYInput, focusYValue);
    wrapper.appendChild(focusYField);

    const zoomField = document.createElement("label");
    zoomField.className = "admin-field";
    zoomField.innerHTML = "<span>Zoom</span>";
    const zoomInput = document.createElement("input");
    zoomInput.type = "range";
    zoomInput.className = "admin-input";
    zoomInput.min = "70";
    zoomInput.max = "250";
    zoomInput.step = "1";
    zoomInput.value = String(Math.round(intro.zoom * 100));
    const zoomValue = document.createElement("small");
    zoomValue.className = "admin-preview-meta";
    zoomValue.textContent = `${Math.round(intro.zoom * 100)}%`;
    zoomInput.addEventListener("input", () => {
      const value = Number.parseFloat(zoomInput.value) / 100;
      zoomValue.textContent = `${Math.round(value * 100)}%`;
      this.setIntroPresentation({ zoom: value });
    });
    zoomField.append(zoomInput, zoomValue);
    wrapper.appendChild(zoomField);

    const overlayField = document.createElement("label");
    overlayField.className = "admin-field";
    overlayField.innerHTML = "<span>Overlay Opacity</span>";
    const overlayInput = document.createElement("input");
    overlayInput.type = "range";
    overlayInput.className = "admin-input";
    overlayInput.min = "0";
    overlayInput.max = "100";
    overlayInput.step = "1";
    overlayInput.value = String(Math.round(intro.overlayOpacity * 100));
    const overlayValue = document.createElement("small");
    overlayValue.className = "admin-preview-meta";
    overlayValue.textContent = `${Math.round(intro.overlayOpacity * 100)}%`;
    overlayInput.addEventListener("input", () => {
      const value = Number.parseFloat(overlayInput.value) / 100;
      overlayValue.textContent = `${Math.round(value * 100)}%`;
      this.setIntroPresentation({ overlayOpacity: value });
    });
    overlayField.append(overlayInput, overlayValue);
    wrapper.appendChild(overlayField);

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "admin-btn";
    reset.textContent = "Reset Framing";
    reset.disabled = !this.draftOverrides.introPresentation;
    reset.addEventListener("click", () => {
      this.resetIntroPresentation();
    });
    wrapper.appendChild(reset);

    return wrapper;
  }

  private appendIntroFramingPreview(
    container: HTMLElement,
    mediaPath: string,
    caption: string
  ): void {
    const intro = this.getIntroPresentationDraft();
    const wrapper = document.createElement("div");
    wrapper.className = "admin-intro-sim";
    wrapper.style.setProperty("--intro-fit-mode", intro.fitMode);
    wrapper.style.setProperty("--intro-focus-x", `${intro.focusX}%`);
    wrapper.style.setProperty("--intro-focus-y", `${intro.focusY}%`);
    wrapper.style.setProperty("--intro-zoom", String(intro.zoom));
    wrapper.style.setProperty(
      "--intro-overlay-opacity",
      String(intro.overlayOpacity)
    );

    if (isVideoAssetPath(mediaPath)) {
      const video = document.createElement("video");
      video.className = "admin-intro-sim-media";
      video.src = toResolvedPath(mediaPath);
      video.controls = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      wrapper.appendChild(video);
    } else {
      const image = document.createElement("img");
      image.className = "admin-intro-sim-media";
      image.src = toResolvedPath(mediaPath);
      image.alt = "Intro framing preview";
      wrapper.appendChild(image);
    }

    const label = document.createElement("p");
    label.className = "admin-preview-meta";
    label.textContent = caption;
    container.append(label, wrapper);
  }

  private appendMediaPreview(container: HTMLElement, slot: AssetSlot, path: string): void {
    const normalizedPath = path.trim();
    if (normalizedPath.length === 0) {
      return;
    }
    const showVideo =
      slot.meta.kind === "introScreen" && isVideoAssetPath(normalizedPath);
    if (showVideo) {
      const video = document.createElement("video");
      video.className = "admin-preview-video";
      video.src = toResolvedPath(normalizedPath);
      video.controls = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      container.appendChild(video);
      return;
    }
    if (slot.mediaType === "image") {
      const image = document.createElement("img");
      image.className = "admin-preview-image";
      image.src = toResolvedPath(normalizedPath);
      image.alt = slot.label;
      container.appendChild(image);
      return;
    }
    const audio = document.createElement("audio");
    audio.className = "admin-preview-audio";
    audio.controls = true;
    audio.preload = "none";
    audio.src = toResolvedPath(normalizedPath);
    container.appendChild(audio);
  }

  private render(): void {
    this.panel.classList.toggle("is-hidden", !this.isOpen);
    this.fab.classList.toggle("is-visible", !this.isOpen);
    if (!this.isOpen) {
      return;
    }

    const existingSlotList = this.panel.querySelector<HTMLElement>(".admin-slot-list");
    if (existingSlotList) {
      this.sidebarScrollTop = existingSlotList.scrollTop;
    }
    const existingWorkspace = this.panel.querySelector<HTMLElement>(".admin-workspace");
    if (existingWorkspace) {
      this.workspaceScrollTop = existingWorkspace.scrollTop;
    }

    const slots = this.getAllSlots();
    const selectedSlot = this.getSelectedSlot(slots);
    const visibleSlots = filterAssetSlots(slots, this.assetSearch, this.categoryFilter);
    const artistGroups =
      this.categoryFilter === "artist" ? this.getArtistGroups(visibleSlots) : [];
    if (artistGroups.length > 0) {
      const isSelectedValid = artistGroups.some(
        (group) => group.artistId === this.selectedArtistId
      );
      if (!isSelectedValid) {
        this.selectedArtistId = artistGroups[0].artistId;
      }
      if (!selectedSlot && this.selectedArtistId) {
        const artistSlots = this.getArtistSlots(visibleSlots, this.selectedArtistId);
        if (artistSlots[0]) {
          this.selectedSlotId = artistSlots[0].id;
        }
      }
    } else if (this.categoryFilter === "artist") {
      this.selectedArtistId = null;
    }

    this.panel.replaceChildren();
    this.panel.appendChild(this.buildHeader());

    const shell = document.createElement("div");
    shell.className = "admin-shell";
    shell.append(
      this.buildSidebar(visibleSlots, artistGroups),
      this.buildWorkspace(slots, selectedSlot)
    );
    this.panel.appendChild(shell);

    requestAnimationFrame(() => {
      const nextSlotList = this.panel.querySelector<HTMLElement>(".admin-slot-list");
      if (nextSlotList) {
        nextSlotList.scrollTop = this.sidebarScrollTop;
      }
      const nextWorkspace = this.panel.querySelector<HTMLElement>(".admin-workspace");
      if (nextWorkspace) {
        nextWorkspace.scrollTop = this.workspaceScrollTop;
      }
    });
  }

  private buildHeader(): HTMLElement {
    const header = document.createElement("header");
    header.className = "admin-header";

    const brand = document.createElement("div");
    brand.className = "admin-brand";
    const title = document.createElement("h2");
    title.className = "admin-title";
    title.textContent = "Stage Rush Admin";
    const subtitle = document.createElement("p");
    subtitle.className = "admin-subtitle";
    subtitle.textContent = "Asset pipeline, generation, and map layout control.";
    brand.append(title, subtitle);

    const controls = document.createElement("div");
    controls.className = "admin-header-controls";

    const festivalWrap = document.createElement("label");
    festivalWrap.className = "admin-header-field";
    const festivalLabel = document.createElement("span");
    festivalLabel.textContent = "Festival";
    const festivalSelect = document.createElement("select");
    festivalSelect.className = "admin-select";
    for (const festival of this.festivals) {
      const option = document.createElement("option");
      option.value = festival.id;
      option.textContent = `${festival.name} (${festival.id})`;
      festivalSelect.appendChild(option);
    }
    festivalSelect.value = this.activeFestivalId;
    festivalSelect.addEventListener("change", () => {
      if (!festivalSelect.value || festivalSelect.value === this.activeFestivalId) {
        return;
      }
      this.onFestivalChange(festivalSelect.value);
    });
    festivalWrap.append(festivalLabel, festivalSelect);

    const actions = document.createElement("div");
    actions.className = "admin-header-actions";

    const applyButton = document.createElement("button");
    applyButton.type = "button";
    applyButton.className = "admin-btn primary";
    applyButton.textContent = "Apply + Reload";
    applyButton.addEventListener("click", () => {
      this.onApply(structuredClone(this.draftOverrides));
    });
    actions.appendChild(applyButton);

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "admin-btn";
    resetButton.textContent = "Reset";
    resetButton.addEventListener("click", () => {
      this.onReset();
    });
    actions.appendChild(resetButton);

    const hideButton = document.createElement("button");
    hideButton.type = "button";
    hideButton.className = "admin-btn";
    hideButton.textContent = "Hide";
    hideButton.addEventListener("click", () => {
      this.isOpen = false;
      this.render();
    });
    actions.appendChild(hideButton);

    controls.append(festivalWrap, actions);
    header.append(brand, controls);
    return header;
  }

  private buildSidebar(
    visibleSlots: AssetSlot[],
    artistGroups: Array<{
      artistId: string;
      label: string;
      state: "override" | "default";
      slotIds: string[];
    }>
  ): HTMLElement {
    const sidebar = document.createElement("aside");
    sidebar.className = "admin-sidebar";

    const tabs = document.createElement("div");
    tabs.className = "admin-tabs";
    const tabDefs: Array<{ id: AdminTab; label: string; hint: string }> = [
      { id: "assets", label: "Assets", hint: "Live game slots" },
      { id: "generate", label: "Generate", hint: "Create new art" },
      { id: "map", label: "Map", hint: "Pin map markers" },
      { id: "library", label: "Library", hint: "Review variants" },
      { id: "publish", label: "Publish", hint: "Apply and reload" }
    ];
    for (const tabDef of tabDefs) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "admin-tab";
      if (this.activeTab === tabDef.id) {
        button.classList.add("is-active");
      }
      const title = document.createElement("span");
      title.className = "admin-tab-title";
      title.textContent = tabDef.label;
      button.appendChild(title);

      const hint = document.createElement("span");
      hint.className = "admin-tab-hint";
      hint.textContent = tabDef.hint;
      button.appendChild(hint);
      button.addEventListener("click", () => {
        this.activeTab = tabDef.id;
        this.generateStatus = "";
        this.render();
      });
      tabs.appendChild(button);
    }
    sidebar.appendChild(tabs);

    if (this.activeTab === "assets" || this.activeTab === "generate") {
      const filters = document.createElement("div");
      filters.className = "admin-filter-card";

      const search = document.createElement("input");
      search.type = "search";
      search.className = "admin-input";
      search.placeholder = "Search assets...";
      search.value = this.assetSearch;
      search.addEventListener("input", () => {
        this.assetSearch = search.value;
        this.render();
      });
      filters.appendChild(search);

      const category = document.createElement("select");
      category.className = "admin-select";
      const categories: Array<["all" | SlotCategory, string]> = [
        ["all", "All categories"],
        ["background", "Background"],
        ["ui", "UI"],
        ["stage", "Stage"],
        ["distraction", "Distraction"],
        ["artist", "Artist"],
        ["audio", "Audio"]
      ];
      for (const [value, label] of categories) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        category.appendChild(option);
      }
      category.value = this.categoryFilter;
      category.addEventListener("change", () => {
        this.categoryFilter = category.value as "all" | SlotCategory;
        this.render();
      });
      filters.appendChild(category);

      const levelSelect = document.createElement("select");
      levelSelect.className = "admin-select";
      for (let level = 1; level <= this.map.totalLevels; level += 1) {
        const option = document.createElement("option");
        option.value = String(level);
        option.textContent = `In-play roster: Level ${level}`;
        levelSelect.appendChild(option);
      }
      levelSelect.value = String(this.inPlayLevel);
      levelSelect.addEventListener("change", () => {
        const next = Number.parseInt(levelSelect.value, 10);
        this.inPlayLevel = Number.isFinite(next)
          ? Math.max(1, Math.min(this.map.totalLevels, next))
          : 1;
        this.render();
      });
      filters.appendChild(levelSelect);
      sidebar.appendChild(filters);

      const slotList = document.createElement("div");
      slotList.className = "admin-slot-list";
      if (this.categoryFilter === "artist") {
        if (artistGroups.length === 0) {
          const empty = document.createElement("p");
          empty.className = "admin-empty";
          empty.textContent = "No artists match this filter.";
          slotList.appendChild(empty);
        } else {
          for (const group of artistGroups) {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "admin-slot-item";
            if (group.artistId === this.selectedArtistId) {
              item.classList.add("is-active");
            }
            item.innerHTML = `<strong>${group.label}</strong><span>${group.state}</span>`;
            item.addEventListener("click", () => {
              this.selectedArtistId = group.artistId;
              this.selectedSlotId = group.slotIds[0] ?? null;
              this.generateStatus = "";
              this.render();
            });
            slotList.appendChild(item);
          }
        }
      } else if (visibleSlots.length === 0) {
        const empty = document.createElement("p");
        empty.className = "admin-empty";
        empty.textContent = "No assets match this filter.";
        slotList.appendChild(empty);
      } else {
        for (const slot of visibleSlots) {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "admin-slot-item";
          if (slot.id === this.selectedSlotId) {
            item.classList.add("is-active");
          }
          const state = slot.overridePath ? "override" : "default";
          item.innerHTML = `<strong>${slot.label}</strong><span>${state}</span>`;
          item.addEventListener("click", () => {
            this.selectedSlotId = slot.id;
            this.generateStatus = "";
            this.render();
          });
          slotList.appendChild(item);
        }
      }
      sidebar.appendChild(slotList);
    } else {
      if (this.activeTab === "library") {
        const levelControls = document.createElement("div");
        levelControls.className = "admin-filter-card";
        const levelSelect = document.createElement("select");
        levelSelect.className = "admin-select";
        for (let level = 1; level <= this.map.totalLevels; level += 1) {
          const option = document.createElement("option");
          option.value = String(level);
          option.textContent = `In-play roster: Level ${level}`;
          levelSelect.appendChild(option);
        }
        levelSelect.value = String(this.inPlayLevel);
        levelSelect.addEventListener("change", () => {
          const next = Number.parseInt(levelSelect.value, 10);
          this.inPlayLevel = Number.isFinite(next)
            ? Math.max(1, Math.min(this.map.totalLevels, next))
            : 1;
          this.render();
        });
        levelControls.appendChild(levelSelect);
        sidebar.appendChild(levelControls);
      }
      const help = document.createElement("p");
      help.className = "admin-empty";
      if (this.activeTab === "map") {
        help.textContent =
          "Map mode lets you place stage and distraction markers by clicking the map.";
      } else if (this.activeTab === "library") {
        help.textContent =
          "Library mode shows all catalog prompts and generated assets.";
      } else {
        help.textContent =
          "Publish mode commits current festival map/overrides to GitHub using a PAT.";
      }
      sidebar.appendChild(help);
    }

    return sidebar;
  }

  private buildWorkspace(slots: AssetSlot[], selectedSlot: AssetSlot | null): HTMLElement {
    if (this.activeTab === "map") {
      return this.buildMapWorkspace();
    }
    if (this.activeTab === "library") {
      return this.buildLibraryWorkspace();
    }
    if (this.activeTab === "publish") {
      return this.buildPublishWorkspace();
    }
    if (this.isArtistEditingMode()) {
      return this.buildArtistWorkspace(slots);
    }

    const workspace = document.createElement("main");
    workspace.className = "admin-workspace admin-workspace-split";
    if (this.activeTab === "assets") {
      workspace.appendChild(this.buildAssetsWorkspace(selectedSlot));
    } else {
      workspace.appendChild(this.buildGenerateWorkspace(selectedSlot));
    }
    workspace.appendChild(this.buildPreviewCard(selectedSlot));
    return workspace;
  }

  private buildArtistWorkspace(slots: AssetSlot[]): HTMLElement {
    const workspace = document.createElement("main");
    workspace.className = "admin-workspace";

    const section = document.createElement("section");
    section.className = "admin-section-card";
    const groups = this.getArtistGroups(slots);
    if (groups.length === 0) {
      const empty = document.createElement("p");
      empty.className = "admin-empty";
      empty.textContent = "No artist sets available at this level/filter.";
      section.appendChild(empty);
      workspace.appendChild(section);
      return workspace;
    }

    const selectedArtistId =
      groups.find((group) => group.artistId === this.selectedArtistId)?.artistId ??
      groups[0].artistId;
    this.selectedArtistId = selectedArtistId;
    const artist = this.map.assets.artists.find((entry) => entry.id === selectedArtistId);
    const artistSlots = this.getArtistSlots(slots, selectedArtistId);
    const slotByField = new Map<ArtistSlotField, AssetSlot>();
    for (const slot of artistSlots) {
      if (slot.meta.kind === "artist") {
        slotByField.set(slot.meta.field, slot);
      }
    }

    const title = document.createElement("h3");
    title.textContent = artist ? `Artist Set · ${artist.name}` : `Artist Set · ${selectedArtistId}`;
    section.appendChild(title);

    const copy = document.createElement("p");
    copy.className = "admin-copy";
    copy.textContent = artist
      ? `${artist.tier.toUpperCase()} · ${artist.genre ?? "genre not set"} · Edit all poses and performance audio in one place.`
      : "Edit all poses and performance audio in one place.";
    section.appendChild(copy);

    const controls = document.createElement("div");
    controls.className = "admin-grid-3";

    const seedField = document.createElement("label");
    seedField.className = "admin-field";
    seedField.innerHTML = "<span>Seed</span>";
    const seedInput = document.createElement("input");
    seedInput.type = "number";
    seedInput.className = "admin-input";
    seedInput.min = "0";
    seedInput.step = "1";
    seedInput.value =
      this.artistSeedDraftByArtist.get(selectedArtistId) ??
      String(this.getArtistSeed(selectedArtistId));
    seedInput.addEventListener("change", () => {
      this.setArtistSeed(selectedArtistId, seedInput.value);
      this.render();
    });
    seedField.appendChild(seedInput);
    controls.appendChild(seedField);

    const rotateWrap = document.createElement("div");
    rotateWrap.className = "admin-field";
    rotateWrap.innerHTML = "<span>Seed Rotation</span>";
    const rotateButton = document.createElement("button");
    rotateButton.type = "button";
    rotateButton.className = "admin-btn";
    rotateButton.textContent = "Rotate Seed";
    rotateButton.addEventListener("click", () => {
      const nextSeed = this.rotateArtistSeed(selectedArtistId);
      seedInput.value = String(nextSeed);
      this.generateStatus = `Seed rotated for ${artist?.name ?? selectedArtistId}.`;
      this.render();
    });
    rotateWrap.appendChild(rotateButton);
    controls.appendChild(rotateWrap);

    const resetWrap = document.createElement("div");
    resetWrap.className = "admin-field";
    resetWrap.innerHTML = "<span>Artist Reset</span>";
    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "admin-btn";
    resetButton.textContent = "Reset Artist";
    resetButton.addEventListener("click", () => {
      const nextSeed = this.resetArtistSet(selectedArtistId);
      seedInput.value = String(nextSeed);
      this.generateStatus = `Reset ${artist?.name ?? selectedArtistId}: seed rotated and generated assets cleared.`;
      this.render();
    });
    resetWrap.appendChild(resetButton);
    controls.appendChild(resetWrap);

    const audioLengthField = document.createElement("label");
    audioLengthField.className = "admin-field";
    audioLengthField.innerHTML = "<span>Perf Audio Length (sec)</span>";
    const audioLengthInput = document.createElement("input");
    audioLengthInput.type = "number";
    audioLengthInput.step = "0.1";
    audioLengthInput.min = "0.5";
    audioLengthInput.max = String(ELEVEN_MAX_DURATION_SEC);
    audioLengthInput.className = "admin-input";
    audioLengthInput.value =
      this.artistAudioLengthDraftByArtist.get(selectedArtistId) ??
      String(this.getArtistAudioLengthSec(selectedArtistId));
    audioLengthInput.addEventListener("change", () => {
      this.setArtistAudioLengthSec(selectedArtistId, audioLengthInput.value);
      this.render();
    });
    audioLengthField.appendChild(audioLengthInput);
    controls.appendChild(audioLengthField);
    section.appendChild(controls);

    const warning = this.getArtistSeedWarning(selectedArtistId);
    if (warning.length > 0) {
      const warningNote = document.createElement("p");
      warningNote.className = "admin-status";
      warningNote.textContent = warning;
      section.appendChild(warningNote);
    }

    if (this.activeTab === "generate") {
      section.appendChild(this.buildGenerationCredentialsCard());
    }

    const grid = document.createElement("div");
    grid.className = "admin-library-list";
    const orderedFields: ArtistSlotField[] = [
      "walk1",
      "walk2",
      "walk3",
      "distracted",
      "performing",
      "performanceAudioClip"
    ];
    for (const field of orderedFields) {
      const slot = slotByField.get(field);
      if (!slot) {
        continue;
      }
      grid.appendChild(this.buildArtistSlotCard(slot, selectedArtistId));
    }
    section.appendChild(grid);

    if (this.generateStatus) {
      const status = document.createElement("p");
      status.className = "admin-status";
      status.textContent = this.generateStatus;
      section.appendChild(status);
    }

    workspace.appendChild(section);
    return workspace;
  }

  private buildGenerationCredentialsCard(): HTMLElement {
    const card = document.createElement("section");
    card.className = "admin-library-item";

    const title = document.createElement("h4");
    title.textContent = "Generation Credentials";
    card.appendChild(title);

    const geminiField = document.createElement("label");
    geminiField.className = "admin-field";
    geminiField.innerHTML = "<span>Gemini API Key</span>";
    const geminiInput = document.createElement("input");
    geminiInput.type = "password";
    geminiInput.className = "admin-input";
    geminiInput.placeholder = "AIza...";
    geminiInput.value = this.geminiApiKey;
    geminiInput.addEventListener("input", () => {
      this.geminiApiKey = geminiInput.value.trim();
      if (this.rememberGeminiKey) {
        window.localStorage.setItem(GEMINI_KEY_STORAGE_KEY, this.geminiApiKey);
      }
    });
    geminiField.appendChild(geminiInput);
    card.appendChild(geminiField);

    const geminiModelField = document.createElement("label");
    geminiModelField.className = "admin-field";
    geminiModelField.innerHTML = "<span>Gemini Model</span>";
    const geminiModelInput = document.createElement("input");
    geminiModelInput.type = "text";
    geminiModelInput.className = "admin-input";
    geminiModelInput.value = this.geminiModel;
    geminiModelInput.addEventListener("input", () => {
      this.geminiModel = geminiModelInput.value.trim() || GEMINI_MODEL_DEFAULT;
    });
    geminiModelField.appendChild(geminiModelInput);
    card.appendChild(geminiModelField);

    const rememberGemini = document.createElement("label");
    rememberGemini.className = "admin-check";
    const rememberGeminiInput = document.createElement("input");
    rememberGeminiInput.type = "checkbox";
    rememberGeminiInput.checked = this.rememberGeminiKey;
    rememberGeminiInput.addEventListener("change", () => {
      this.rememberGeminiKey = rememberGeminiInput.checked;
      if (this.rememberGeminiKey) {
        window.localStorage.setItem(GEMINI_KEY_STORAGE_KEY, this.geminiApiKey);
      } else {
        window.localStorage.removeItem(GEMINI_KEY_STORAGE_KEY);
      }
    });
    const rememberGeminiLabel = document.createElement("span");
    rememberGeminiLabel.textContent = "Remember Gemini key on this device";
    rememberGemini.append(rememberGeminiInput, rememberGeminiLabel);
    card.appendChild(rememberGemini);

    const elevenField = document.createElement("label");
    elevenField.className = "admin-field";
    elevenField.innerHTML = "<span>ElevenLabs API Key</span>";
    const elevenInput = document.createElement("input");
    elevenInput.type = "password";
    elevenInput.className = "admin-input";
    elevenInput.placeholder = "sk_...";
    elevenInput.value = this.elevenLabsApiKey;
    elevenInput.addEventListener("input", () => {
      this.elevenLabsApiKey = elevenInput.value.trim();
      if (this.rememberElevenLabsKey) {
        window.localStorage.setItem(ELEVENLABS_KEY_STORAGE_KEY, this.elevenLabsApiKey);
      }
    });
    elevenField.appendChild(elevenInput);
    card.appendChild(elevenField);

    const rememberEleven = document.createElement("label");
    rememberEleven.className = "admin-check";
    const rememberElevenInput = document.createElement("input");
    rememberElevenInput.type = "checkbox";
    rememberElevenInput.checked = this.rememberElevenLabsKey;
    rememberElevenInput.addEventListener("change", () => {
      this.rememberElevenLabsKey = rememberElevenInput.checked;
      if (this.rememberElevenLabsKey) {
        window.localStorage.setItem(ELEVENLABS_KEY_STORAGE_KEY, this.elevenLabsApiKey);
      } else {
        window.localStorage.removeItem(ELEVENLABS_KEY_STORAGE_KEY);
      }
    });
    const rememberElevenLabel = document.createElement("span");
    rememberElevenLabel.textContent = "Remember ElevenLabs key on this device";
    rememberEleven.append(rememberElevenInput, rememberElevenLabel);
    card.appendChild(rememberEleven);

    return card;
  }

  private buildArtistSlotCard(slot: AssetSlot, artistId: string): HTMLElement {
    const card = document.createElement("article");
    card.className = "admin-library-item";

    const heading = document.createElement("h4");
    heading.textContent = slot.label.replace(/^Artist\s·\s[^·]+\s·\s/i, "");
    card.appendChild(heading);

    const path = document.createElement("code");
    path.className = "admin-preview-path";
    path.textContent = summarizeAssetPath(slot.overridePath ?? slot.defaultPath);
    card.appendChild(path);
    const usage = this.describeUsageForSlot(slot);
    if (usage) {
      const usageText = document.createElement("p");
      usageText.className = "admin-copy";
      usageText.textContent = usage;
      card.appendChild(usageText);
    }

    const activePath = slot.overridePath ?? slot.defaultPath;
    this.appendMediaPreview(card, slot, activePath);

    const pathField = document.createElement("label");
    pathField.className = "admin-field";
    pathField.innerHTML = "<span>Path / Data URL</span>";
    const pathInput = document.createElement("input");
    pathInput.type = "text";
    pathInput.className = "admin-input";
    pathInput.value =
      this.pathDraftBySlot.get(slot.id) ?? slot.overridePath ?? slot.defaultPath;
    pathInput.addEventListener("input", () => {
      this.pathDraftBySlot.set(slot.id, pathInput.value);
    });
    pathField.appendChild(pathInput);
    card.appendChild(pathField);

    const pathActions = document.createElement("div");
    pathActions.className = "admin-row-inline";
    const applyPath = document.createElement("button");
    applyPath.type = "button";
    applyPath.className = "admin-btn primary";
    applyPath.textContent = "Apply Path";
    applyPath.addEventListener("click", () => {
      const value = pathInput.value.trim();
      this.draftOverrides = setOverrideForSlot(
        this.draftOverrides,
        slot.meta,
        value.length > 0 ? value : null
      );
      this.notifyPreviewChange();
      this.pathDraftBySlot.set(slot.id, value);
      this.render();
    });
    pathActions.appendChild(applyPath);

    const revert = document.createElement("button");
    revert.type = "button";
    revert.className = "admin-btn";
    revert.textContent = "Revert";
    revert.disabled = !slot.overridePath;
    revert.addEventListener("click", () => {
      this.draftOverrides = setOverrideForSlot(this.draftOverrides, slot.meta, null);
      this.pathDraftBySlot.set(slot.id, slot.defaultPath);
      this.notifyPreviewChange();
      this.render();
    });
    pathActions.appendChild(revert);
    card.appendChild(pathActions);

    const uploadField = document.createElement("label");
    uploadField.className = "admin-field";
    uploadField.innerHTML = `<span>Upload ${
      slot.meta.kind === "introScreen"
        ? "Image or Video"
        : slot.mediaType === "image"
          ? "Image"
          : "Audio"
    }</span>`;
    const uploadInput = document.createElement("input");
    uploadInput.type = "file";
    uploadInput.className = "admin-file";
    uploadInput.accept =
      slot.meta.kind === "introScreen"
        ? "image/*,video/*"
        : slot.mediaType === "image"
          ? "image/*"
          : "audio/*";
    uploadInput.addEventListener("change", async () => {
      const file = uploadInput.files?.[0];
      if (!file) {
        return;
      }
      this.slotCandidates.set(slot.id, await toDataUrl(file));
      this.generateStatus = `${slot.label} candidate updated from upload.`;
      this.render();
    });
    uploadField.appendChild(uploadInput);
    card.appendChild(uploadField);

    if (slot.meta.kind === "artist" && slot.meta.field === "performanceAudioClip") {
      const lengthField = document.createElement("label");
      lengthField.className = "admin-field";
      lengthField.innerHTML = "<span>Clip Length (seconds)</span>";
      const lengthInput = document.createElement("input");
      lengthInput.type = "number";
      lengthInput.className = "admin-input";
      lengthInput.step = "0.1";
      lengthInput.min = "0.5";
      lengthInput.max = String(ELEVEN_MAX_DURATION_SEC);
      lengthInput.value =
        this.artistAudioLengthDraftByArtist.get(artistId) ??
        String(this.getArtistAudioLengthSec(artistId));
      lengthInput.addEventListener("change", () => {
        this.setArtistAudioLengthSec(artistId, lengthInput.value);
      });
      lengthField.appendChild(lengthInput);
      card.appendChild(lengthField);
    }

    if (this.activeTab === "generate") {
      const promptField = document.createElement("label");
      promptField.className = "admin-field";
      promptField.innerHTML = "<span>Prompt</span>";
      const promptArea = document.createElement("textarea");
      promptArea.className = "admin-textarea";
      promptArea.value = this.promptDraftBySlot.get(slot.id) ?? slot.promptText;
      promptArea.addEventListener("input", () => {
        this.promptDraftBySlot.set(slot.id, promptArea.value);
      });
      promptField.appendChild(promptArea);
      card.appendChild(promptField);

      const generateActions = document.createElement("div");
      generateActions.className = "admin-row-inline";
      const generateButton = document.createElement("button");
      generateButton.type = "button";
      generateButton.className = "admin-btn primary";
      generateButton.disabled = this.isGenerating;
      generateButton.textContent = this.isGenerating ? "Generating..." : "Generate";
      generateButton.addEventListener("click", () => {
        if (slot.mediaType === "image") {
          void this.runGeminiGeneration(slot);
          return;
        }
        void this.runElevenLabsGeneration(slot);
      });
      generateActions.appendChild(generateButton);

      const resetPrompt = document.createElement("button");
      resetPrompt.type = "button";
      resetPrompt.className = "admin-btn";
      resetPrompt.textContent = "Reset Prompt";
      resetPrompt.addEventListener("click", () => {
        this.promptDraftBySlot.set(slot.id, slot.promptText);
        this.render();
      });
      generateActions.appendChild(resetPrompt);
      card.appendChild(generateActions);
    }

    const candidateActions = document.createElement("div");
    candidateActions.className = "admin-row-inline";
    const applyCandidate = document.createElement("button");
    applyCandidate.type = "button";
    applyCandidate.className = "admin-btn primary";
    applyCandidate.textContent = "Apply Candidate";
    applyCandidate.disabled = !this.slotCandidates.has(slot.id);
    applyCandidate.addEventListener("click", () => {
      void this.applyCandidateToSlot(slot);
    });
    candidateActions.appendChild(applyCandidate);

    if (slot.mediaType === "image") {
      const removeBg = document.createElement("button");
      removeBg.type = "button";
      removeBg.className = "admin-btn";
      removeBg.textContent = "Remove BG";
      removeBg.disabled =
        !this.slotCandidates.has(slot.id) ||
        (slot.meta.kind === "introScreen" &&
          !isImageDataUrl(this.slotCandidates.get(slot.id) ?? ""));
      removeBg.addEventListener("click", async () => {
        const candidate = this.slotCandidates.get(slot.id);
        if (!candidate) {
          return;
        }
        try {
          const transparent = await removeBackgroundFromDataUrl(candidate);
          this.slotCandidates.set(slot.id, transparent);
          this.generateStatus = `Background removed for ${slot.label}.`;
        } catch (error) {
          this.generateStatus = String(error);
        }
        this.render();
      });
      candidateActions.appendChild(removeBg);
    }

    const clearCandidate = document.createElement("button");
    clearCandidate.type = "button";
    clearCandidate.className = "admin-btn";
    clearCandidate.textContent = "Clear Candidate";
    clearCandidate.disabled = !this.slotCandidates.has(slot.id);
    clearCandidate.addEventListener("click", () => {
      this.slotCandidates.delete(slot.id);
      this.generateStatus = "";
      this.render();
    });
    candidateActions.appendChild(clearCandidate);
    card.appendChild(candidateActions);

    const candidate = this.slotCandidates.get(slot.id);
    if (candidate) {
      const candidateLabel = document.createElement("p");
      candidateLabel.className = "admin-preview-meta";
      candidateLabel.textContent = "Candidate Preview";
      card.appendChild(candidateLabel);
      this.appendMediaPreview(card, slot, candidate);
    }

    return card;
  }

  private async applyCandidateToSlot(slot: AssetSlot): Promise<void> {
    const candidate = this.slotCandidates.get(slot.id);
    if (!candidate) {
      return;
    }
    try {
      const normalizedCandidate = await this.normalizeCandidateForApply(slot, candidate);
      this.slotCandidates.set(slot.id, normalizedCandidate);
      this.draftOverrides = setOverrideForSlot(
        this.draftOverrides,
        slot.meta,
        normalizedCandidate
      );
      this.pathDraftBySlot.set(slot.id, normalizedCandidate);
      this.notifyPreviewChange();
      this.generateStatus = `${slot.label} applied to live preview.`;
    } catch (error) {
      this.generateStatus = String(error);
    } finally {
      this.render();
    }
  }

  private buildAssetsWorkspace(selectedSlot: AssetSlot | null): HTMLElement {
    const section = document.createElement("section");
    section.className = "admin-section-card";

    const heading = document.createElement("h3");
    heading.textContent = "Asset Replacement";
    section.appendChild(heading);

    if (!selectedSlot) {
      const empty = document.createElement("p");
      empty.className = "admin-empty";
      empty.textContent = "Select an asset from the left list.";
      section.appendChild(empty);
      return section;
    }

    const description = document.createElement("p");
    description.className = "admin-copy";
    description.textContent =
      "Replace quickly by path/URL, or upload a file as candidate and apply.";
    section.appendChild(description);

    const pathField = document.createElement("label");
    pathField.className = "admin-field";
    const pathLabel = document.createElement("span");
    pathLabel.textContent = "Path or Data URL";
    const pathInput = document.createElement("input");
    pathInput.type = "text";
    pathInput.className = "admin-input";
    pathInput.value =
      this.pathDraftBySlot.get(selectedSlot.id) ??
      selectedSlot.overridePath ??
      selectedSlot.defaultPath;
    pathInput.placeholder =
      "assets/... or https://... or data:image/... or data:video/...";
    pathInput.addEventListener("input", () => {
      this.pathDraftBySlot.set(selectedSlot.id, pathInput.value);
    });
    pathField.append(pathLabel, pathInput);
    section.appendChild(pathField);

    const pathActions = document.createElement("div");
    pathActions.className = "admin-row-inline";
    const applyPath = document.createElement("button");
    applyPath.type = "button";
    applyPath.className = "admin-btn primary";
    applyPath.textContent = "Apply Path";
    applyPath.addEventListener("click", () => {
      const value = pathInput.value.trim();
      this.draftOverrides = setOverrideForSlot(
        this.draftOverrides,
        selectedSlot.meta,
        value.length > 0 ? value : null
      );
      this.notifyPreviewChange();
      this.render();
    });
    pathActions.appendChild(applyPath);

    const revert = document.createElement("button");
    revert.type = "button";
    revert.className = "admin-btn";
    revert.textContent = "Revert to Default";
    revert.disabled = !selectedSlot.overridePath;
    revert.addEventListener("click", () => {
      this.draftOverrides = setOverrideForSlot(
        this.draftOverrides,
        selectedSlot.meta,
        null
      );
      this.pathDraftBySlot.set(selectedSlot.id, selectedSlot.defaultPath);
      this.notifyPreviewChange();
      this.render();
    });
    pathActions.appendChild(revert);
    section.appendChild(pathActions);

    const uploadField = document.createElement("label");
    uploadField.className = "admin-field";
    const uploadLabel = document.createElement("span");
    uploadLabel.textContent =
      selectedSlot.meta.kind === "introScreen"
        ? "Upload image or video"
        : selectedSlot.mediaType === "image"
          ? "Upload image"
          : "Upload audio";
    const uploadInput = document.createElement("input");
    uploadInput.type = "file";
    uploadInput.className = "admin-file";
    uploadInput.accept =
      selectedSlot.meta.kind === "introScreen"
        ? "image/*,video/*"
        : selectedSlot.mediaType === "image"
          ? "image/*"
          : "audio/*";
    uploadInput.addEventListener("change", async () => {
      const file = uploadInput.files?.[0];
      if (!file) {
        return;
      }
      const dataUrl = await toDataUrl(file);
      this.slotCandidates.set(selectedSlot.id, dataUrl);
      this.generateStatus = "Uploaded file is ready as candidate.";
      this.render();
    });
    uploadField.append(uploadLabel, uploadInput);
    section.appendChild(uploadField);

    const candidateActions = document.createElement("div");
    candidateActions.className = "admin-row-inline";
    const useCandidate = document.createElement("button");
    useCandidate.type = "button";
    useCandidate.className = "admin-btn primary";
    useCandidate.textContent = "Apply Candidate";
    useCandidate.disabled = !this.slotCandidates.has(selectedSlot.id);
    useCandidate.addEventListener("click", () => {
      void (async () => {
        const candidate = this.slotCandidates.get(selectedSlot.id);
        if (!candidate) {
          return;
        }
        const normalizedCandidate = await this.normalizeCandidateForApply(
          selectedSlot,
          candidate
        );
        this.slotCandidates.set(selectedSlot.id, normalizedCandidate);
        this.draftOverrides = setOverrideForSlot(
          this.draftOverrides,
          selectedSlot.meta,
          normalizedCandidate
        );
        this.pathDraftBySlot.set(selectedSlot.id, normalizedCandidate);
        this.notifyPreviewChange();
        this.render();
      })().catch((error: unknown) => {
        this.generateStatus = String(error);
        this.render();
      });
    });
    candidateActions.appendChild(useCandidate);

    if (selectedSlot.mediaType === "image") {
      const removeBg = document.createElement("button");
      removeBg.type = "button";
      removeBg.className = "admin-btn";
      removeBg.textContent = "Remove BG";
      removeBg.disabled =
        !this.slotCandidates.has(selectedSlot.id) ||
        (selectedSlot.meta.kind === "introScreen" &&
          !isImageDataUrl(this.slotCandidates.get(selectedSlot.id) ?? ""));
      removeBg.addEventListener("click", async () => {
        const candidate = this.slotCandidates.get(selectedSlot.id);
        if (!candidate) {
          return;
        }
        try {
          const transparent = await removeBackgroundFromDataUrl(candidate);
          this.slotCandidates.set(selectedSlot.id, transparent);
          this.generateStatus = "Background removed from candidate.";
        } catch (error) {
          this.generateStatus = String(error);
        }
        this.render();
      });
      candidateActions.appendChild(removeBg);
    }

    const clearCandidate = document.createElement("button");
    clearCandidate.type = "button";
    clearCandidate.className = "admin-btn";
    clearCandidate.textContent = "Clear Candidate";
    clearCandidate.disabled = !this.slotCandidates.has(selectedSlot.id);
    clearCandidate.addEventListener("click", () => {
      this.slotCandidates.delete(selectedSlot.id);
      this.generateStatus = "";
      this.render();
    });
    candidateActions.appendChild(clearCandidate);
    section.appendChild(candidateActions);

    const openGenerate = document.createElement("button");
    openGenerate.type = "button";
    openGenerate.className = "admin-btn";
    openGenerate.textContent = "Open Generate Tab";
    openGenerate.addEventListener("click", () => {
      this.activeTab = "generate";
      this.render();
    });
    section.appendChild(openGenerate);

    if (selectedSlot.meta.kind === "introScreen") {
      section.appendChild(this.buildIntroFramingControls());
    }

    if (this.generateStatus) {
      const status = document.createElement("p");
      status.className = "admin-status";
      status.textContent = this.generateStatus;
      section.appendChild(status);
    }
    return section;
  }

  private buildGenerateWorkspace(selectedSlot: AssetSlot | null): HTMLElement {
    const section = document.createElement("section");
    section.className = "admin-section-card";
    const heading = document.createElement("h3");
    heading.textContent = "Inline Asset Generation";
    section.appendChild(heading);

    if (!selectedSlot) {
      const empty = document.createElement("p");
      empty.className = "admin-empty";
      empty.textContent = "Select an asset in the sidebar first.";
      section.appendChild(empty);
      return section;
    }
    const usage = this.describeUsageForSlot(selectedSlot);
    if (usage) {
      const usageText = document.createElement("p");
      usageText.className = "admin-copy";
      usageText.textContent = usage;
      section.appendChild(usageText);
    }

    if (selectedSlot.mediaType === "image") {
      const keyField = document.createElement("label");
      keyField.className = "admin-field";
      const keyLabel = document.createElement("span");
      keyLabel.textContent = "Gemini API Key";
      const keyInput = document.createElement("input");
      keyInput.type = "password";
      keyInput.className = "admin-input";
      keyInput.placeholder = "AIza...";
      keyInput.value = this.geminiApiKey;
      keyInput.addEventListener("input", () => {
        this.geminiApiKey = keyInput.value.trim();
        if (this.rememberGeminiKey) {
          window.localStorage.setItem(GEMINI_KEY_STORAGE_KEY, this.geminiApiKey);
        }
      });
      keyField.append(keyLabel, keyInput);
      section.appendChild(keyField);

      const remember = document.createElement("label");
      remember.className = "admin-check";
      const rememberInput = document.createElement("input");
      rememberInput.type = "checkbox";
      rememberInput.checked = this.rememberGeminiKey;
      rememberInput.addEventListener("change", () => {
        this.rememberGeminiKey = rememberInput.checked;
        if (this.rememberGeminiKey) {
          window.localStorage.setItem(GEMINI_KEY_STORAGE_KEY, this.geminiApiKey);
        } else {
          window.localStorage.removeItem(GEMINI_KEY_STORAGE_KEY);
        }
      });
      const rememberLabel = document.createElement("span");
      rememberLabel.textContent = "Remember Gemini key on this device";
      remember.append(rememberInput, rememberLabel);
      section.appendChild(remember);

      const modelField = document.createElement("label");
      modelField.className = "admin-field";
      const modelLabel = document.createElement("span");
      modelLabel.textContent = "Model";
      const modelInput = document.createElement("input");
      modelInput.type = "text";
      modelInput.className = "admin-input";
      modelInput.value = this.geminiModel;
      modelInput.addEventListener("input", () => {
        this.geminiModel = modelInput.value.trim() || GEMINI_MODEL_DEFAULT;
      });
      modelField.append(modelLabel, modelInput);
      section.appendChild(modelField);
    } else {
      const keyField = document.createElement("label");
      keyField.className = "admin-field";
      const keyLabel = document.createElement("span");
      keyLabel.textContent = "ElevenLabs API Key";
      const keyInput = document.createElement("input");
      keyInput.type = "password";
      keyInput.className = "admin-input";
      keyInput.placeholder = "sk_...";
      keyInput.value = this.elevenLabsApiKey;
      keyInput.addEventListener("input", () => {
        this.elevenLabsApiKey = keyInput.value.trim();
        if (this.rememberElevenLabsKey) {
          window.localStorage.setItem(ELEVENLABS_KEY_STORAGE_KEY, this.elevenLabsApiKey);
        }
      });
      keyField.append(keyLabel, keyInput);
      section.appendChild(keyField);

      const remember = document.createElement("label");
      remember.className = "admin-check";
      const rememberInput = document.createElement("input");
      rememberInput.type = "checkbox";
      rememberInput.checked = this.rememberElevenLabsKey;
      rememberInput.addEventListener("change", () => {
        this.rememberElevenLabsKey = rememberInput.checked;
        if (this.rememberElevenLabsKey) {
          window.localStorage.setItem(ELEVENLABS_KEY_STORAGE_KEY, this.elevenLabsApiKey);
        } else {
          window.localStorage.removeItem(ELEVENLABS_KEY_STORAGE_KEY);
        }
      });
      const rememberLabel = document.createElement("span");
      rememberLabel.textContent = "Remember ElevenLabs key on this device";
      remember.append(rememberInput, rememberLabel);
      section.appendChild(remember);

      const lengthField = document.createElement("label");
      lengthField.className = "admin-field";
      const lengthLabel = document.createElement("span");
      lengthLabel.textContent = "Clip Length (seconds)";
      const lengthInput = document.createElement("input");
      lengthInput.type = "number";
      lengthInput.className = "admin-input";
      lengthInput.step = "0.1";
      lengthInput.min = "0.5";
      lengthInput.max = String(ELEVEN_MAX_DURATION_SEC);
      lengthInput.value = String(this.getAudioLengthSecForSlot(selectedSlot));
      lengthInput.addEventListener("change", () => {
        this.setAudioLengthSecForSlot(selectedSlot, lengthInput.value);
      });
      lengthField.append(lengthLabel, lengthInput);
      section.appendChild(lengthField);
    }

    const promptField = document.createElement("label");
    promptField.className = "admin-field";
    const promptLabel = document.createElement("span");
    promptLabel.textContent = `Prompt for ${selectedSlot.label}`;
    const promptArea = document.createElement("textarea");
    promptArea.className = "admin-textarea";
    promptArea.value =
      this.promptDraftBySlot.get(selectedSlot.id) ?? selectedSlot.promptText;
    promptArea.addEventListener("input", () => {
      this.promptDraftBySlot.set(selectedSlot.id, promptArea.value);
    });
    promptField.append(promptLabel, promptArea);
    section.appendChild(promptField);

    const promptActions = document.createElement("div");
    promptActions.className = "admin-row-inline";
    const resetPrompt = document.createElement("button");
    resetPrompt.type = "button";
    resetPrompt.className = "admin-btn";
    resetPrompt.textContent = "Reset Prompt";
    resetPrompt.addEventListener("click", () => {
      this.promptDraftBySlot.set(selectedSlot.id, selectedSlot.promptText);
      this.render();
    });
    promptActions.appendChild(resetPrompt);
    section.appendChild(promptActions);

    const actions = document.createElement("div");
    actions.className = "admin-row-inline";
    const generate = document.createElement("button");
    generate.type = "button";
    generate.className = "admin-btn primary";
    generate.textContent = this.isGenerating ? "Generating..." : "Generate";
    generate.disabled = this.isGenerating;
    generate.addEventListener("click", () => {
      if (selectedSlot.mediaType === "image") {
        void this.runGeminiGeneration(selectedSlot);
      } else {
        void this.runElevenLabsGeneration(selectedSlot);
      }
    });
    actions.appendChild(generate);

    const applyGenerated = document.createElement("button");
    applyGenerated.type = "button";
    applyGenerated.className = "admin-btn";
    applyGenerated.textContent = "Apply Generated";
    applyGenerated.disabled = !this.slotCandidates.has(selectedSlot.id);
    applyGenerated.addEventListener("click", () => {
      void (async () => {
        const candidate = this.slotCandidates.get(selectedSlot.id);
        if (!candidate) {
          return;
        }
        const normalizedCandidate = await this.normalizeCandidateForApply(
          selectedSlot,
          candidate
        );
        this.slotCandidates.set(selectedSlot.id, normalizedCandidate);
        this.draftOverrides = setOverrideForSlot(
          this.draftOverrides,
          selectedSlot.meta,
          normalizedCandidate
        );
        this.pathDraftBySlot.set(selectedSlot.id, normalizedCandidate);
        this.notifyPreviewChange();
        this.render();
      })().catch((error: unknown) => {
        this.generateStatus = String(error);
        this.render();
      });
    });
    actions.appendChild(applyGenerated);

    if (selectedSlot.mediaType === "image") {
      const clearBg = document.createElement("button");
      clearBg.type = "button";
      clearBg.className = "admin-btn";
      clearBg.textContent = "Remove BG";
      clearBg.disabled = !this.slotCandidates.has(selectedSlot.id);
      clearBg.addEventListener("click", async () => {
        const candidate = this.slotCandidates.get(selectedSlot.id);
        if (!candidate) {
          return;
        }
        try {
          const transparent = await removeBackgroundFromDataUrl(candidate);
          this.slotCandidates.set(selectedSlot.id, transparent);
          this.generateStatus = "Background removed from generated candidate.";
        } catch (error) {
          this.generateStatus = String(error);
        }
        this.render();
      });
      actions.appendChild(clearBg);
    }
    section.appendChild(actions);

    if (this.generateStatus) {
      const status = document.createElement("p");
      status.className = "admin-status";
      status.textContent = this.generateStatus;
      section.appendChild(status);
    }
    return section;
  }

  private buildMapWorkspace(): HTMLElement {
    const section = document.createElement("main");
    section.className = "admin-workspace";
    const card = document.createElement("section");
    card.className = "admin-section-card";

    const heading = document.createElement("h3");
    heading.textContent = "Map Marker Placement";
    card.appendChild(heading);

    const hasStages = this.map.stages.length > 0;
    const hasDistractions = this.map.distractions.length > 0;
    if (!hasStages && !hasDistractions) {
      const empty = document.createElement("p");
      empty.className = "admin-empty";
      empty.textContent = "No stage or distraction markers found in this festival map.";
      card.appendChild(empty);
      section.appendChild(card);
      return section;
    }

    if (this.selectedMapPlacementMode === "stage" && !hasStages && hasDistractions) {
      this.selectedMapPlacementMode = "distraction";
    }
    if (this.selectedMapPlacementMode === "distraction" && !hasDistractions && hasStages) {
      this.selectedMapPlacementMode = "stage";
    }

    const selectedStageId = this.selectedStageForMap ?? this.map.stages[0]?.id ?? null;
    const selectedDistractionId =
      this.selectedDistractionForMap ?? this.map.distractions[0]?.id ?? null;
    this.selectedStageForMap = selectedStageId;
    this.selectedDistractionForMap = selectedDistractionId;

    const mode = this.selectedMapPlacementMode;
    const selectedPoint =
      mode === "stage"
        ? selectedStageId
          ? getStagePosition(this.map, this.draftOverrides, selectedStageId)
          : { x: 0.5, y: 0.5 }
        : selectedDistractionId
          ? getDistractionPosition(this.map, this.draftOverrides, selectedDistractionId)
          : { x: 0.5, y: 0.5 };

    const controls = document.createElement("div");
    controls.className = "admin-grid-3";
    const modeField = document.createElement("label");
    modeField.className = "admin-field";
    modeField.innerHTML = "<span>Marker Type</span>";
    const modeSelect = document.createElement("select");
    modeSelect.className = "admin-select";
    if (hasStages) {
      const option = document.createElement("option");
      option.value = "stage";
      option.textContent = "Stage";
      modeSelect.appendChild(option);
    }
    if (hasDistractions) {
      const option = document.createElement("option");
      option.value = "distraction";
      option.textContent = "Distraction";
      modeSelect.appendChild(option);
    }
    modeSelect.value = mode;
    modeSelect.addEventListener("change", () => {
      this.selectedMapPlacementMode = modeSelect.value as MapPlacementMode;
      this.render();
    });
    modeField.appendChild(modeSelect);
    controls.appendChild(modeField);

    const stageField = document.createElement("label");
    stageField.className = "admin-field";
    stageField.innerHTML = `<span>${mode === "stage" ? "Stage" : "Distraction"}</span>`;
    const stageSelect = document.createElement("select");
    stageSelect.className = "admin-select";
    if (mode === "stage") {
      for (const stage of this.map.stages) {
        const option = document.createElement("option");
        option.value = stage.id;
        option.textContent = stage.id;
        stageSelect.appendChild(option);
      }
      stageSelect.value = selectedStageId ?? "";
    } else {
      for (const distraction of this.map.distractions) {
        const option = document.createElement("option");
        option.value = distraction.id;
        option.textContent = distraction.id;
        stageSelect.appendChild(option);
      }
      stageSelect.value = selectedDistractionId ?? "";
    }
    stageSelect.addEventListener("change", () => {
      if (mode === "stage") {
        this.selectedStageForMap = stageSelect.value;
      } else {
        this.selectedDistractionForMap = stageSelect.value;
      }
      this.render();
    });
    stageField.appendChild(stageSelect);
    controls.appendChild(stageField);

    const xField = document.createElement("label");
    xField.className = "admin-field";
    xField.innerHTML = "<span>X (0-1)</span>";
    const xInput = document.createElement("input");
    xInput.type = "number";
    xInput.step = "0.001";
    xInput.min = "0";
    xInput.max = "1";
    xInput.className = "admin-input";
    xInput.value = selectedPoint.x.toFixed(3);
    xInput.addEventListener("change", () => {
      if (mode === "stage" && selectedStageId) {
        this.setStageFromInputs(selectedStageId, xInput.value, yInput.value);
        return;
      }
      if (mode === "distraction" && selectedDistractionId) {
        this.setDistractionFromInputs(selectedDistractionId, xInput.value, yInput.value);
      }
    });
    xField.appendChild(xInput);
    controls.appendChild(xField);

    const yField = document.createElement("label");
    yField.className = "admin-field";
    yField.innerHTML = "<span>Y (0-1)</span>";
    const yInput = document.createElement("input");
    yInput.type = "number";
    yInput.step = "0.001";
    yInput.min = "0";
    yInput.max = "1";
    yInput.className = "admin-input";
    yInput.value = selectedPoint.y.toFixed(3);
    yInput.addEventListener("change", () => {
      if (mode === "stage" && selectedStageId) {
        this.setStageFromInputs(selectedStageId, xInput.value, yInput.value);
        return;
      }
      if (mode === "distraction" && selectedDistractionId) {
        this.setDistractionFromInputs(selectedDistractionId, xInput.value, yInput.value);
      }
    });
    yField.appendChild(yInput);
    controls.appendChild(yField);
    card.appendChild(controls);

    const mapCanvas = document.createElement("div");
    mapCanvas.className = "admin-map-canvas";
    mapCanvas.style.backgroundImage = `url(${toResolvedPath(
      this.draftOverrides.background ?? this.map.background
    )})`;

    if (mode === "stage") {
      for (const stage of this.map.stages) {
        const point = getStagePosition(this.map, this.draftOverrides, stage.id);
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = "admin-map-marker admin-map-marker-stage";
        if (stage.id === selectedStageId) {
          marker.classList.add("is-active");
        }
        marker.style.left = `${point.x * 100}%`;
        marker.style.top = `${point.y * 100}%`;
        marker.textContent = stage.id;
        marker.addEventListener("click", (event) => {
          event.stopPropagation();
          this.selectedStageForMap = stage.id;
          this.render();
        });
        mapCanvas.appendChild(marker);
      }
    } else {
      for (const distraction of this.map.distractions) {
        const point = getDistractionPosition(this.map, this.draftOverrides, distraction.id);
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = "admin-map-marker admin-map-marker-distraction";
        if (distraction.id === selectedDistractionId) {
          marker.classList.add("is-active");
        }
        marker.style.left = `${point.x * 100}%`;
        marker.style.top = `${point.y * 100}%`;
        marker.textContent = distraction.id;
        marker.addEventListener("click", (event) => {
          event.stopPropagation();
          this.selectedDistractionForMap = distraction.id;
          this.render();
        });
        mapCanvas.appendChild(marker);
      }
    }

    mapCanvas.addEventListener("click", (event) => {
      const rect = mapCanvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      if (mode === "stage" && selectedStageId) {
        this.draftOverrides = setStagePositionOverride(this.draftOverrides, selectedStageId, {
          x,
          y
        });
      } else if (mode === "distraction" && selectedDistractionId) {
        this.draftOverrides = setDistractionPositionOverride(
          this.draftOverrides,
          selectedDistractionId,
          { x, y }
        );
      }
      this.notifyPreviewChange();
      this.render();
    });
    card.appendChild(mapCanvas);

    const hint = document.createElement("p");
    hint.className = "admin-copy";
    hint.textContent =
      mode === "stage"
        ? "Click map to place selected stage marker. Marker changes apply instantly to live preview."
        : "Click map to place selected distraction marker. Marker changes apply instantly to live preview.";
    card.appendChild(hint);
    card.appendChild(this.buildSessionFxControls());

    section.appendChild(card);
    return section;
  }

  private buildLibraryWorkspace(): HTMLElement {
    const section = document.createElement("main");
    section.className = "admin-workspace";
    const card = document.createElement("section");
    card.className = "admin-section-card";

    const title = document.createElement("h3");
    title.textContent = "Prompt and Asset Library";
    card.appendChild(title);

    const inPlaySlots = this.getAllSlots();
    const allowedAssetPaths = new Set(
      inPlaySlots.map((slot) => slot.defaultPath.replace(/^\/+/, ""))
    );
    const entries = [
      ...this.spriteCatalog.map((entry) => ({
        id: entry.id,
        type: entry.category,
        assetPath: entry.assetPath,
        promptText: entry.promptText,
        mediaType: "image" as const,
        usageLabels: this.findUsageLabelsForAssetPath(entry.assetPath)
      })),
      ...this.audioCatalog.map((entry) => ({
        id: entry.id,
        type: entry.type,
        assetPath: entry.assetPath,
        promptText: entry.promptText,
        mediaType: "audio" as const,
        usageLabels: this.findUsageLabelsForAssetPath(entry.assetPath)
      }))
    ].filter((entry) =>
      allowedAssetPaths.has(entry.assetPath.replace(/^\/+/, ""))
    );

    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "admin-empty";
      empty.textContent = "Catalogs are empty or unavailable.";
      card.appendChild(empty);
      section.appendChild(card);
      return section;
    }

    const list = document.createElement("div");
    list.className = "admin-library-list";
    for (const entry of entries) {
      const item = document.createElement("article");
      item.className = "admin-library-item";

      const heading = document.createElement("h4");
      heading.textContent = `${entry.id} (${entry.type})`;
      item.appendChild(heading);

      const path = document.createElement("code");
      path.className = "admin-preview-path";
      path.textContent = entry.assetPath;
      item.appendChild(path);
      if (entry.usageLabels.length > 0) {
        const usage = document.createElement("p");
        usage.className = "admin-copy";
        usage.textContent = `Used by: ${entry.usageLabels.join(", ")}`;
        item.appendChild(usage);
      }

      if (entry.mediaType === "image") {
        const image = document.createElement("img");
        image.className = "admin-preview-image";
        image.src = toResolvedPath(entry.assetPath);
        image.alt = entry.id;
        item.appendChild(image);
      } else {
        const audio = document.createElement("audio");
        audio.className = "admin-preview-audio";
        audio.controls = true;
        audio.preload = "none";
        audio.src = toResolvedPath(entry.assetPath);
        item.appendChild(audio);
      }

      const prompt = document.createElement("pre");
      prompt.className = "admin-code";
      prompt.textContent = entry.promptText || "No prompt available.";
      item.appendChild(prompt);
      list.appendChild(item);
    }
    card.appendChild(list);
    section.appendChild(card);
    return section;
  }

  private buildPublishWorkspace(): HTMLElement {
    const workspace = document.createElement("main");
    workspace.className = "admin-workspace";
    const card = document.createElement("section");
    card.className = "admin-section-card";

    const title = document.createElement("h3");
    title.textContent = "Publish To GitHub";
    card.appendChild(title);

    const copy = document.createElement("p");
    copy.className = "admin-copy";
    copy.textContent =
      "Commits the resolved festival map (including all currently applied overrides) directly via GitHub Contents API. PAT is optional to remember and stored only in this browser.";
    card.appendChild(copy);

    const tokenField = document.createElement("label");
    tokenField.className = "admin-field";
    tokenField.innerHTML = "<span>GitHub PAT</span>";
    const tokenInput = document.createElement("input");
    tokenInput.type = "password";
    tokenInput.className = "admin-input";
    tokenInput.placeholder = "ghp_...";
    tokenInput.value = this.githubToken;
    tokenInput.addEventListener("input", () => {
      this.githubToken = tokenInput.value.trim();
      if (this.rememberGithubToken) {
        window.localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, this.githubToken);
      }
    });
    tokenField.appendChild(tokenInput);
    card.appendChild(tokenField);

    const rememberTokenRow = document.createElement("label");
    rememberTokenRow.className = "admin-check";
    const rememberTokenInput = document.createElement("input");
    rememberTokenInput.type = "checkbox";
    rememberTokenInput.checked = this.rememberGithubToken;
    rememberTokenInput.addEventListener("change", () => {
      this.rememberGithubToken = rememberTokenInput.checked;
      if (this.rememberGithubToken) {
        window.localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, this.githubToken);
      } else {
        window.localStorage.removeItem(GITHUB_TOKEN_STORAGE_KEY);
      }
    });
    const rememberTokenLabel = document.createElement("span");
    rememberTokenLabel.textContent = "Remember PAT on this device";
    rememberTokenRow.append(rememberTokenInput, rememberTokenLabel);
    card.appendChild(rememberTokenRow);

    const repoGrid = document.createElement("div");
    repoGrid.className = "admin-grid-3";
    const ownerField = document.createElement("label");
    ownerField.className = "admin-field";
    ownerField.innerHTML = "<span>Owner</span>";
    const ownerInput = document.createElement("input");
    ownerInput.type = "text";
    ownerInput.className = "admin-input";
    ownerInput.value = this.githubOwner;
    ownerInput.addEventListener("input", () => {
      this.githubOwner = ownerInput.value.trim();
      this.persistGithubSettings();
    });
    ownerField.appendChild(ownerInput);
    repoGrid.appendChild(ownerField);

    const repoField = document.createElement("label");
    repoField.className = "admin-field";
    repoField.innerHTML = "<span>Repository</span>";
    const repoInput = document.createElement("input");
    repoInput.type = "text";
    repoInput.className = "admin-input";
    repoInput.value = this.githubRepo;
    repoInput.addEventListener("input", () => {
      this.githubRepo = repoInput.value.trim();
      this.persistGithubSettings();
    });
    repoField.appendChild(repoInput);
    repoGrid.appendChild(repoField);

    const branchField = document.createElement("label");
    branchField.className = "admin-field";
    branchField.innerHTML = "<span>Branch</span>";
    const branchInput = document.createElement("input");
    branchInput.type = "text";
    branchInput.className = "admin-input";
    branchInput.value = this.githubBranch;
    branchInput.addEventListener("input", () => {
      this.githubBranch = branchInput.value.trim();
      this.persistGithubSettings();
    });
    branchField.appendChild(branchInput);
    repoGrid.appendChild(branchField);
    card.appendChild(repoGrid);

    const targetPathField = document.createElement("label");
    targetPathField.className = "admin-field";
    targetPathField.innerHTML = "<span>Festival Map Path</span>";
    const targetPathInput = document.createElement("input");
    targetPathInput.type = "text";
    targetPathInput.className = "admin-input";
    targetPathInput.value = this.githubTargetPath;
    targetPathInput.addEventListener("input", () => {
      this.githubTargetPath = targetPathInput.value.trim();
      this.persistGithubSettings();
    });
    targetPathField.appendChild(targetPathInput);
    card.appendChild(targetPathField);

    const messageField = document.createElement("label");
    messageField.className = "admin-field";
    messageField.innerHTML = "<span>Commit Message</span>";
    const messageInput = document.createElement("input");
    messageInput.type = "text";
    messageInput.className = "admin-input";
    messageInput.value = this.githubCommitMessage;
    messageInput.addEventListener("input", () => {
      this.githubCommitMessage = messageInput.value;
    });
    messageField.appendChild(messageInput);
    card.appendChild(messageField);

    const rememberSettingsRow = document.createElement("label");
    rememberSettingsRow.className = "admin-check";
    const rememberSettingsInput = document.createElement("input");
    rememberSettingsInput.type = "checkbox";
    rememberSettingsInput.checked = this.rememberGithubSettings;
    rememberSettingsInput.addEventListener("change", () => {
      this.rememberGithubSettings = rememberSettingsInput.checked;
      this.persistGithubSettings();
    });
    const rememberSettingsLabel = document.createElement("span");
    rememberSettingsLabel.textContent = "Remember owner/repo/branch/paths";
    rememberSettingsRow.append(rememberSettingsInput, rememberSettingsLabel);
    card.appendChild(rememberSettingsRow);

    const actions = document.createElement("div");
    actions.className = "admin-row-inline";
    const commitMapButton = document.createElement("button");
    commitMapButton.type = "button";
    commitMapButton.className = "admin-btn primary";
    commitMapButton.textContent = this.isPublishing
      ? "Committing..."
      : "Commit to Git";
    commitMapButton.disabled = this.isPublishing;
    commitMapButton.addEventListener("click", () => {
      void this.commitFestivalMapToGitHub();
    });
    actions.appendChild(commitMapButton);

    card.appendChild(actions);

    if (this.publishStatus) {
      const status = document.createElement("p");
      status.className = "admin-status";
      status.textContent = this.publishStatus;
      card.appendChild(status);
    }

    workspace.appendChild(card);
    return workspace;
  }

  private buildPreviewCard(selectedSlot: AssetSlot | null): HTMLElement {
    const card = document.createElement("aside");
    card.className = "admin-section-card admin-preview-card";

    const title = document.createElement("h3");
    title.textContent = "Live Preview";
    card.appendChild(title);

    if (!selectedSlot) {
      const empty = document.createElement("p");
      empty.className = "admin-empty";
      empty.textContent = "Select an asset to preview.";
      card.appendChild(empty);
      return card;
    }

    const slotLabel = document.createElement("p");
    slotLabel.className = "admin-preview-meta";
    slotLabel.textContent = `${selectedSlot.label} · Active (in-game)`;
    card.appendChild(slotLabel);
    if (selectedSlot.meta.kind === "introScreen") {
      this.appendIntroFramingPreview(
        card,
        selectedSlot.resolvedPath,
        "Intro composition preview"
      );
      this.appendMediaPreview(card, selectedSlot, selectedSlot.resolvedPath);
    } else {
      this.appendMediaPreview(card, selectedSlot, selectedSlot.resolvedPath);
    }

    const path = document.createElement("code");
    path.className = "admin-preview-path";
    path.textContent = summarizeAssetPath(
      selectedSlot.overridePath ?? selectedSlot.defaultPath
    );
    card.appendChild(path);
    const usage = this.describeUsageForSlot(selectedSlot);
    if (usage) {
      const usageText = document.createElement("p");
      usageText.className = "admin-copy";
      usageText.textContent = usage;
      card.appendChild(usageText);
    }

    const candidate = this.slotCandidates.get(selectedSlot.id);
    if (candidate) {
      const candidateLabel = document.createElement("p");
      candidateLabel.className = "admin-preview-meta";
      candidateLabel.textContent = "Candidate (not active until applied)";
      card.appendChild(candidateLabel);
      if (selectedSlot.meta.kind === "introScreen") {
        this.appendIntroFramingPreview(
          card,
          candidate,
          "Candidate intro composition"
        );
      }
      this.appendMediaPreview(card, selectedSlot, candidate);
    }

    if (selectedSlot.promptText) {
      const promptTitle = document.createElement("p");
      promptTitle.className = "admin-preview-meta";
      promptTitle.textContent = "Prompt";
      card.appendChild(promptTitle);
      const prompt = document.createElement("pre");
      prompt.className = "admin-code";
      prompt.textContent = selectedSlot.promptText;
      card.appendChild(prompt);
    }

    return card;
  }

  private setStageFromInputs(stageId: string, xRaw: string, yRaw: string): void {
    const x = Number.parseFloat(xRaw);
    const y = Number.parseFloat(yRaw);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    this.draftOverrides = setStagePositionOverride(this.draftOverrides, stageId, { x, y });
    this.notifyPreviewChange();
    this.render();
  }

  private setDistractionFromInputs(distractionId: string, xRaw: string, yRaw: string): void {
    const x = Number.parseFloat(xRaw);
    const y = Number.parseFloat(yRaw);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    this.draftOverrides = setDistractionPositionOverride(
      this.draftOverrides,
      distractionId,
      { x, y }
    );
    this.notifyPreviewChange();
    this.render();
  }

  private async runGeminiGeneration(slot: AssetSlot): Promise<void> {
    if (slot.mediaType !== "image") {
      return;
    }
    const apiKey = this.geminiApiKey.trim();
    if (!apiKey) {
      this.generateStatus = "Enter a Gemini API key first.";
      this.render();
      return;
    }

    const prompt = (this.promptDraftBySlot.get(slot.id) ?? slot.promptText ?? "").trim();
    if (!prompt) {
      this.generateStatus = "Prompt is empty.";
      this.render();
      return;
    }

    this.isGenerating = true;
    this.generateStatus = "Generating image...";
    this.render();
    try {
      const generationConfig: Record<string, unknown> = {
        responseModalities: ["TEXT", "IMAGE"]
      };
      const parts: Array<Record<string, unknown>> = [];
      let seedFallbackUsed = false;
      let referenceUsed = false;
      if (slot.meta.kind === "artist") {
        const artistSeed = this.getArtistSeed(slot.meta.artistId);
        generationConfig.seed = artistSeed;
        const referencePart = await this.buildArtistReferenceInlinePart(slot.meta.artistId);
        if (referencePart) {
          parts.push(referencePart);
          referenceUsed = true;
        }
        parts.push({
          text: buildArtistSeedPrompt(prompt, artistSeed)
        });
      } else {
        parts.push({ text: prompt });
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.geminiModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const requestGemini = async (config: Record<string, unknown>) =>
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: config
          })
        });

      let response = await requestGemini(generationConfig);
      if (!response.ok) {
        const details = await response.text();
        if (
          slot.meta.kind === "artist" &&
          "seed" in generationConfig &&
          isGeminiSeedUnsupportedError(response.status, details)
        ) {
          const retryConfig = { ...generationConfig };
          delete retryConfig.seed;
          response = await requestGemini(retryConfig);
          seedFallbackUsed = true;
          if (!response.ok) {
            const retryDetails = await response.text();
            throw new Error(`Gemini request failed (${response.status}): ${retryDetails}`);
          }
        } else {
          throw new Error(`Gemini request failed (${response.status}): ${details}`);
        }
      }
      const payload = (await response.json()) as unknown;
      const inline = readInlineGeminiImage(payload);
      if (!inline) {
        throw new Error("Gemini did not return an inline image.");
      }
      if (!inline.mimeType.startsWith("image/")) {
        throw new Error(`Gemini returned non-image payload: ${inline.mimeType}`);
      }
      let dataUrl = `data:${inline.mimeType};base64,${inline.base64}`;
      if (inline.mimeType === "image/svg+xml") {
        dataUrl = await toPngDataUrl(dataUrl);
      }
      this.slotCandidates.set(slot.id, dataUrl);
      if (slot.meta.kind === "artist") {
        if (seedFallbackUsed) {
          this.setArtistSeedWarning(
            slot.meta.artistId,
            "This model/runtime rejected generationConfig.seed. Identity consistency is now best-effort via prompt + reference image."
          );
        } else {
          this.setArtistSeedWarning(slot.meta.artistId, "");
        }
      }
      const notes: string[] = [];
      if (referenceUsed) {
        notes.push("reference image used");
      }
      if (seedFallbackUsed) {
        notes.push("seed fallback");
      }
      this.generateStatus =
        notes.length > 0
          ? `Generation complete (${notes.join(", ")}). Review candidate and apply.`
          : "Generation complete. Review candidate and apply.";
    } catch (error) {
      this.generateStatus = String(error);
    } finally {
      this.isGenerating = false;
      this.render();
    }
  }

  private async buildArtistReferenceInlinePart(
    artistId: string
  ): Promise<GeminiInlineDataPart | null> {
    const artistSlots = this.getAllSlots().filter((entry) =>
      isArtistImageSlot(entry, artistId)
    );
    if (artistSlots.length === 0) {
      return null;
    }

    const orderedFields: ArtistSlotField[] = [
      "walk1",
      "walk2",
      "walk3",
      "distracted",
      "performing"
    ];
    const prioritized = [
      ...orderedFields
        .map((field) => artistSlots.find((slot) => slot.meta.field === field))
        .filter((slot): slot is (typeof artistSlots)[number] => Boolean(slot)),
      ...artistSlots.filter(
        (slot) => !orderedFields.includes(slot.meta.field as ArtistSlotField)
      )
    ];

    for (const slot of prioritized) {
      const candidate = this.slotCandidates.get(slot.id);
      if (candidate) {
        const candidateDataUrl = await resolveImagePathToDataUrl(candidate);
        if (candidateDataUrl) {
          const inline = dataUrlToInlineDataPart(candidateDataUrl);
          if (inline) {
            return inline;
          }
        }
      }
      const overridePath = slot.overridePath?.trim() ?? "";
      if (overridePath.length > 0) {
        const overrideDataUrl = await resolveImagePathToDataUrl(overridePath);
        if (overrideDataUrl) {
          const inline = dataUrlToInlineDataPart(overrideDataUrl);
          if (inline) {
            return inline;
          }
        }
      }
    }
    return null;
  }

  private async runElevenLabsGeneration(slot: AssetSlot): Promise<void> {
    if (slot.mediaType !== "audio") {
      return;
    }
    const apiKey = this.elevenLabsApiKey.trim();
    if (!apiKey) {
      this.generateStatus = "Enter an ElevenLabs API key first.";
      this.render();
      return;
    }
    const prompt = (this.promptDraftBySlot.get(slot.id) ?? slot.promptText ?? "").trim();
    if (!prompt) {
      this.generateStatus = "Prompt is empty.";
      this.render();
      return;
    }

    const durationSec = this.getAudioLengthSecForSlot(slot);
    const shouldLoop =
      slot.meta.kind === "audio" && slot.meta.cueId.startsWith("bg_");
    this.isGenerating = true;
    this.generateStatus = "Generating audio clip...";
    this.render();
    try {
      const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
          "xi-api-key": apiKey
        },
        body: JSON.stringify({
          text: prompt,
          duration_seconds: Math.max(0.5, Math.min(ELEVEN_MAX_DURATION_SEC, durationSec)),
          model_id: ELEVEN_SOUND_MODEL_ID,
          loop: shouldLoop
        })
      });
      if (!response.ok) {
        const details = await response.text();
        throw new Error(`ElevenLabs request failed (${response.status}): ${details}`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (const value of bytes) {
        binary += String.fromCharCode(value);
      }
      const base64 = btoa(binary);
      const dataUrl = `data:audio/mpeg;base64,${base64}`;
      this.slotCandidates.set(slot.id, dataUrl);
      this.generateStatus = shouldLoop
        ? "Loop-ready audio generation complete. Review candidate and apply."
        : "Audio generation complete. Review candidate and apply.";
    } catch (error) {
      this.generateStatus = String(error);
    } finally {
      this.isGenerating = false;
      this.render();
    }
  }

  private persistGithubSettings(): void {
    if (!this.rememberGithubSettings) {
      window.localStorage.removeItem(GITHUB_SETTINGS_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      GITHUB_SETTINGS_STORAGE_KEY,
      JSON.stringify(
        {
          owner: this.githubOwner,
          repo: this.githubRepo,
          branch: this.githubBranch,
          targetPath: this.githubTargetPath,
          remember: this.rememberGithubSettings
        },
        null,
        2
      )
    );
  }

  private normalizeCommittedJson(content: string): string {
    const trimmedEnd = content.replace(/\s+$/g, "");
    return `${trimmedEnd}\n`;
  }

  private async resolveLatestMapForCommit(): Promise<{
    baseMap: FestivalMap;
    remoteContent: string | null;
  }> {
    this.publishStatus = "Fetching latest map from GitHub...";
    this.render();
    const remote = await readTextFileFromGitHub({
      token: this.githubToken,
      owner: this.githubOwner,
      repo: this.githubRepo,
      branch: this.githubBranch,
      path: this.githubTargetPath
    });

    if (!remote.exists || !remote.content) {
      return {
        baseMap: structuredClone(this.map),
        remoteContent: null
      };
    }

    try {
      const parsed = JSON.parse(remote.content) as FestivalMap;
      return {
        baseMap: parsed,
        remoteContent: this.normalizeCommittedJson(remote.content)
      };
    } catch {
      throw new Error(
        "Remote festival map is not valid JSON. Refresh the app and verify target path before committing."
      );
    }
  }

  private collectInlineAssetPaths(map: FestivalMap): string[] {
    const paths: string[] = [];
    const pushIfInline = (path: string, label: string): void => {
      if (hasInlineAssetPath(path)) {
        paths.push(`${label}: ${summarizeAssetPath(path)}`);
      }
    };

    pushIfInline(map.background, "background");
    if (map.introScreen) {
      pushIfInline(map.introScreen, "intro-screen");
    }
    for (const stage of map.stages) {
      pushIfInline(stage.sprite, `stage:${stage.id}`);
    }
    for (const distraction of map.distractions) {
      pushIfInline(distraction.sprite, `distraction:${distraction.id}`);
    }
    for (const artist of map.assets.artists) {
      if (artist.sprites.idle) {
        pushIfInline(artist.sprites.idle, `artist:${artist.id}:idle`);
      }
      if (artist.sprites.distracted) {
        pushIfInline(artist.sprites.distracted, `artist:${artist.id}:distracted`);
      }
      pushIfInline(artist.sprites.performing, `artist:${artist.id}:performing`);
      artist.sprites.walk.forEach((frame, index) => {
        pushIfInline(frame, `artist:${artist.id}:walk${index + 1}`);
      });
      if (artist.performanceAudio?.clip) {
        pushIfInline(artist.performanceAudio.clip, `artist:${artist.id}:performanceAudio`);
      }
    }
    Object.entries(map.assets.audio).forEach(([cue, path]) => {
      pushIfInline(path, `audio:${cue}`);
    });
    return paths;
  }

  private buildInlineAssetRepoPath(label: string, mimeType: string, base64: string): string {
    const ext = extensionForMimeType(mimeType);
    const hash = hashString(`${mimeType}:${base64}`);
    const safeLabel = sanitizeAssetLabel(label);
    return `public/assets/maps/${this.activeFestivalId}/committed/${safeLabel}-${hash}.${ext}`;
  }

  private async materializeInlineAssetsForCommit(map: FestivalMap): Promise<number> {
    const rewrittenByInlineValue = new Map<string, string>();

    const ensureRepoPath = async (path: string, label: string): Promise<string> => {
      if (path.startsWith("blob:")) {
        throw new Error(
          `Cannot commit blob asset '${label}'. Apply/upload as a file-backed path or data URL first.`
        );
      }
      if (!path.startsWith("data:")) {
        return path;
      }
      const cached = rewrittenByInlineValue.get(path);
      if (cached) {
        return cached;
      }
      const parsed = parseInlineDataAsset(path);
      if (!parsed) {
        throw new Error(`Unsupported inline asset format for '${label}'.`);
      }
      const repoPath = this.buildInlineAssetRepoPath(label, parsed.mimeType, parsed.base64);
      this.publishStatus = `Uploading inline asset: ${label}`;
      this.render();
      await putFileToGitHub({
        token: this.githubToken,
        owner: this.githubOwner,
        repo: this.githubRepo,
        branch: this.githubBranch,
        path: repoPath,
        message: `chore(admin): materialize ${label} asset for ${this.activeFestivalId}`,
        content: "",
        contentBase64: parsed.base64
      });
      const publicAssetPath = repoPath.startsWith("public/")
        ? repoPath.slice("public/".length)
        : repoPath;
      rewrittenByInlineValue.set(path, publicAssetPath);
      return publicAssetPath;
    };

    map.background = await ensureRepoPath(map.background, "background");
    if (map.introScreen) {
      map.introScreen = await ensureRepoPath(map.introScreen, "intro-screen");
    }

    for (const stage of map.stages) {
      stage.sprite = await ensureRepoPath(stage.sprite, `stage:${stage.id}`);
    }
    for (const [stageId, stageSprite] of Object.entries(map.assets.stageSprites)) {
      map.assets.stageSprites[stageId] = await ensureRepoPath(
        stageSprite,
        `assets.stageSprites:${stageId}`
      );
    }

    for (const distraction of map.distractions) {
      distraction.sprite = await ensureRepoPath(
        distraction.sprite,
        `distraction:${distraction.id}`
      );
    }
    for (const [type, distractionSprite] of Object.entries(map.assets.distractionSprites)) {
      map.assets.distractionSprites[type] = await ensureRepoPath(
        distractionSprite,
        `assets.distractionSprites:${type}`
      );
    }

    for (const artist of map.assets.artists) {
      for (let index = 0; index < artist.sprites.walk.length; index += 1) {
        artist.sprites.walk[index] = await ensureRepoPath(
          artist.sprites.walk[index],
          `artist:${artist.id}:walk${index + 1}`
        );
      }
      if (artist.sprites.idle) {
        artist.sprites.idle = await ensureRepoPath(
          artist.sprites.idle,
          `artist:${artist.id}:idle`
        );
      }
      if (artist.sprites.distracted) {
        artist.sprites.distracted = await ensureRepoPath(
          artist.sprites.distracted,
          `artist:${artist.id}:distracted`
        );
      }
      artist.sprites.performing = await ensureRepoPath(
        artist.sprites.performing,
        `artist:${artist.id}:performing`
      );
      if (artist.performanceAudio?.clip) {
        artist.performanceAudio.clip = await ensureRepoPath(
          artist.performanceAudio.clip,
          `artist:${artist.id}:performanceAudio`
        );
      }
    }

    for (const [cueId, cuePath] of Object.entries(map.assets.audio)) {
      map.assets.audio[cueId] = await ensureRepoPath(cuePath, `audio:${cueId}`);
    }

    return rewrittenByInlineValue.size;
  }

  private async commitFestivalMapToGitHub(): Promise<void> {
    if (this.isPublishing) {
      return;
    }
    this.isPublishing = true;
    this.publishStatus = "Committing festival map to GitHub...";
    this.render();
    try {
      const { baseMap, remoteContent } = await this.resolveLatestMapForCommit();
      const mapToCommit = hasAdminAssetOverrides(this.draftOverrides)
        ? applyAdminAssetOverrides(baseMap, this.draftOverrides)
        : baseMap;
      const inlineReferencesBeforeUpload = this.collectInlineAssetPaths(mapToCommit);
      const hasBlobInline = inlineReferencesBeforeUpload.some((entry) =>
        entry.includes("blob-url")
      );
      if (hasBlobInline) {
        throw new Error(
          `Cannot commit map config with blob assets. Convert to file/data URLs first.\n${inlineReferencesBeforeUpload
            .slice(0, 5)
            .join("\n")}`
        );
      }
      const uploadedInlineAssets = await this.materializeInlineAssetsForCommit(mapToCommit);

      const content = `${JSON.stringify(mapToCommit, null, 2)}\n`;
      if (remoteContent !== null && this.normalizeCommittedJson(content) === remoteContent) {
        this.publishStatus = "No changes to commit.";
        this.syncOverridesAfterCommit(mapToCommit);
        this.persistGithubSettings();
        return;
      }
      const result = await putFileToGitHub({
        token: this.githubToken,
        owner: this.githubOwner,
        repo: this.githubRepo,
        branch: this.githubBranch,
        path: this.githubTargetPath,
        message: this.githubCommitMessage.trim().length
          ? this.githubCommitMessage.trim()
          : `chore(admin): update ${this.activeFestivalId} festival config`,
        content
      });
      const commitLine = result.commitUrl ? `Commit: ${result.commitUrl}` : "Commit pushed.";
      const fileLine = result.fileUrl ? ` File: ${result.fileUrl}` : "";
      const uploadLine =
        uploadedInlineAssets > 0
          ? ` Uploaded ${uploadedInlineAssets} inline assets.`
          : "";
      this.publishStatus = `${commitLine}${fileLine}${uploadLine}`;
      this.syncOverridesAfterCommit(mapToCommit);
      this.persistGithubSettings();
    } catch (error) {
      this.publishStatus = String(error);
    } finally {
      this.isPublishing = false;
      this.render();
    }
  }

  private notifyPreviewChange(): void {
    this.onPreviewChange(structuredClone(this.draftOverrides));
  }

  private syncOverridesAfterCommit(committedMap: FestivalMap): void {
    this.map = structuredClone(committedMap);
    const nextOverrides = structuredClone(this.draftOverrides);

    if (nextOverrides.background) {
      nextOverrides.background = committedMap.background;
    }
    if (nextOverrides.introScreen && committedMap.introScreen) {
      nextOverrides.introScreen = committedMap.introScreen;
    }
    if (nextOverrides.introPresentation && committedMap.introPresentation) {
      nextOverrides.introPresentation = {
        ...committedMap.introPresentation
      };
    }
    if (nextOverrides.sessionFx && committedMap.sessionFx) {
      nextOverrides.sessionFx = structuredClone(committedMap.sessionFx);
    }

    if (nextOverrides.stageSprites) {
      for (const stageId of Object.keys(nextOverrides.stageSprites)) {
        const stageFromMap = committedMap.stages.find((stage) => stage.id === stageId);
        const stageFromAssets = committedMap.assets.stageSprites[stageId];
        const resolved = stageFromMap?.sprite ?? stageFromAssets;
        if (resolved) {
          nextOverrides.stageSprites[stageId] = resolved;
        }
      }
    }

    if (nextOverrides.distractionSprites) {
      for (const distractionType of Object.keys(nextOverrides.distractionSprites)) {
        const distractionFromMap = committedMap.distractions.find(
          (entry) => entry.type === distractionType
        );
        const distractionFromAssets =
          committedMap.assets.distractionSprites[distractionType];
        const resolved = distractionFromMap?.sprite ?? distractionFromAssets;
        if (resolved) {
          nextOverrides.distractionSprites[distractionType] = resolved;
        }
      }
    }

    if (nextOverrides.audioCues) {
      for (const cueId of Object.keys(nextOverrides.audioCues)) {
        const resolved = committedMap.assets.audio[cueId];
        if (resolved) {
          nextOverrides.audioCues[cueId] = resolved;
        }
      }
    }

    if (nextOverrides.artistSprites) {
      for (const [artistId, artistOverride] of Object.entries(
        nextOverrides.artistSprites
      )) {
        const committedArtist = committedMap.assets.artists.find(
          (artist) => artist.id === artistId
        );
        if (!committedArtist) {
          continue;
        }
        if (artistOverride.walk1) {
          artistOverride.walk1 = committedArtist.sprites.walk[0] ?? artistOverride.walk1;
        }
        if (artistOverride.walk2) {
          artistOverride.walk2 = committedArtist.sprites.walk[1] ?? artistOverride.walk2;
        }
        if (artistOverride.walk3) {
          artistOverride.walk3 = committedArtist.sprites.walk[2] ?? artistOverride.walk3;
        }
        if (artistOverride.idle && committedArtist.sprites.idle) {
          artistOverride.idle = committedArtist.sprites.idle;
        }
        if (artistOverride.distracted && committedArtist.sprites.distracted) {
          artistOverride.distracted = committedArtist.sprites.distracted;
        }
        if (artistOverride.performing) {
          artistOverride.performing = committedArtist.sprites.performing;
        }
        if (
          artistOverride.performanceAudioClip &&
          committedArtist.performanceAudio?.clip
        ) {
          artistOverride.performanceAudioClip = committedArtist.performanceAudio.clip;
        }
      }
    }

    this.draftOverrides = nextOverrides;
    this.slotCandidates.clear();
    this.pathDraftBySlot.clear();
    saveAdminAssetOverrides(this.activeFestivalId, this.draftOverrides);
    this.notifyPreviewChange();
  }

  private async normalizeCandidateForApply(
    slot: AssetSlot,
    candidate: string
  ): Promise<string> {
    if (slot.mediaType !== "image") {
      return candidate;
    }
    if (candidate.startsWith("data:image/svg+xml")) {
      return toPngDataUrl(candidate);
    }
    return candidate;
  }
}
