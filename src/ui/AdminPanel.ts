import type { FestivalMap } from "../config/FestivalConfig";
import {
  applyAdminAssetOverrides,
  hasAdminAssetOverrides,
  type AdminAssetOverrides
} from "../admin/AdminAssetOverrides";
import { toResolvedPath } from "../admin/AdminPreviewModel";
import { putFileToGitHub } from "../admin/GitHubPublisher";
import {
  buildAssetSlots,
  filterAssetSlots,
  getStagePosition,
  setOverrideForSlot,
  setStagePositionOverride,
  type AssetSlot,
  type AudioCatalogEntry,
  type SlotCategory,
  type SpriteCatalogEntry
} from "./AdminPanelModel";

type AdminTab = "assets" | "generate" | "map" | "library" | "publish";

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
const GEMINI_MODEL_DEFAULT = "gemini-2.5-flash-image-preview";
const GITHUB_TOKEN_STORAGE_KEY = "stagecall:admin:github-token";
const GITHUB_SETTINGS_STORAGE_KEY = "stagecall:admin:github-settings:v1";

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

export class AdminPanel {
  private readonly map: FestivalMap;
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
  private assetSearch = "";
  private selectedSlotId: string | null = null;
  private selectedStageForMap: string | null = null;
  private slotCandidates = new Map<string, string>();
  private promptDraftBySlot = new Map<string, string>();
  private pathDraftBySlot = new Map<string, string>();
  private generateStatus = "";
  private isGenerating = false;
  private geminiApiKey = "";
  private geminiModel = GEMINI_MODEL_DEFAULT;
  private rememberGeminiKey = false;
  private githubToken = "";
  private rememberGithubToken = false;
  private rememberGithubSettings = true;
  private githubOwner = "anuln";
  private githubRepo = "stagerush";
  private githubBranch = "main";
  private githubTargetPath = "";
  private githubSnapshotPath = "";
  private githubCommitMessage = "";
  private publishStatus = "";
  private isPublishing = false;
  private isOpen = true;

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
    const rememberedGeminiKey = window.localStorage.getItem(GEMINI_KEY_STORAGE_KEY);
    if (rememberedGeminiKey && rememberedGeminiKey.trim().length > 0) {
      this.geminiApiKey = rememberedGeminiKey;
      this.rememberGeminiKey = true;
    }
    this.githubTargetPath = toRepoPathFromPublicUrl(this.mapConfigPath);
    this.githubSnapshotPath = `public/assets/admin/snapshots/${this.activeFestivalId}.overrides.json`;
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
          snapshotPath?: string;
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
        if (
          typeof parsed.snapshotPath === "string" &&
          parsed.snapshotPath.trim().length > 0
        ) {
          this.githubSnapshotPath = parsed.snapshotPath.trim();
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
      this.audioCatalog
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

  private render(): void {
    this.panel.classList.toggle("is-hidden", !this.isOpen);
    this.fab.classList.toggle("is-visible", !this.isOpen);
    if (!this.isOpen) {
      return;
    }

    const slots = this.getAllSlots();
    const selectedSlot = this.getSelectedSlot(slots);
    const visibleSlots = filterAssetSlots(slots, this.assetSearch, this.categoryFilter);

    this.panel.replaceChildren();
    this.panel.appendChild(this.buildHeader());

    const shell = document.createElement("div");
    shell.className = "admin-shell";
    shell.append(
      this.buildSidebar(visibleSlots),
      this.buildWorkspace(selectedSlot)
    );
    this.panel.appendChild(shell);
  }

  private buildHeader(): HTMLElement {
    const header = document.createElement("header");
    header.className = "admin-header";

    const brand = document.createElement("div");
    brand.className = "admin-brand";
    const title = document.createElement("h2");
    title.className = "admin-title";
    title.textContent = "Stage Call Admin";
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

  private buildSidebar(visibleSlots: AssetSlot[]): HTMLElement {
    const sidebar = document.createElement("aside");
    sidebar.className = "admin-sidebar";

    const tabs = document.createElement("div");
    tabs.className = "admin-tabs";
    const tabDefs: Array<{ id: AdminTab; label: string }> = [
      { id: "assets", label: "Assets" },
      { id: "generate", label: "Generate" },
      { id: "map", label: "Map" },
      { id: "library", label: "Library" },
      { id: "publish", label: "Publish" }
    ];
    for (const tabDef of tabDefs) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "admin-tab";
      if (this.activeTab === tabDef.id) {
        button.classList.add("is-active");
      }
      button.textContent = tabDef.label;
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
      sidebar.appendChild(filters);

      const slotList = document.createElement("div");
      slotList.className = "admin-slot-list";
      if (visibleSlots.length === 0) {
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
      const help = document.createElement("p");
      help.className = "admin-empty";
      if (this.activeTab === "map") {
        help.textContent =
          "Map mode lets you click the map to place each stage marker.";
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

  private buildWorkspace(selectedSlot: AssetSlot | null): HTMLElement {
    if (this.activeTab === "map") {
      return this.buildMapWorkspace();
    }
    if (this.activeTab === "library") {
      return this.buildLibraryWorkspace();
    }
    if (this.activeTab === "publish") {
      return this.buildPublishWorkspace();
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
    pathInput.placeholder = "assets/maps/... or https://... or data:image/...";
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
    uploadLabel.textContent = selectedSlot.mediaType === "image" ? "Upload image" : "Upload audio";
    const uploadInput = document.createElement("input");
    uploadInput.type = "file";
    uploadInput.className = "admin-file";
    uploadInput.accept = selectedSlot.mediaType === "image" ? "image/*" : "audio/*";
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
      removeBg.disabled = !this.slotCandidates.has(selectedSlot.id);
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
    openGenerate.disabled = selectedSlot.mediaType !== "image";
    openGenerate.addEventListener("click", () => {
      this.activeTab = "generate";
      this.render();
    });
    section.appendChild(openGenerate);

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
    heading.textContent = "Inline Gemini Generation";
    section.appendChild(heading);

    if (!selectedSlot) {
      const empty = document.createElement("p");
      empty.className = "admin-empty";
      empty.textContent = "Select an image asset in the sidebar first.";
      section.appendChild(empty);
      return section;
    }
    if (selectedSlot.mediaType !== "image") {
      const empty = document.createElement("p");
      empty.className = "admin-empty";
      empty.textContent = "Generation is available only for image assets.";
      section.appendChild(empty);
      return section;
    }

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
    rememberLabel.textContent = "Remember key on this device";
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
      void this.runGeminiGeneration(selectedSlot);
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
    heading.textContent = "Map Stage Placement";
    card.appendChild(heading);

    if (this.map.stages.length === 0) {
      const empty = document.createElement("p");
      empty.className = "admin-empty";
      empty.textContent = "No stages found in this festival map.";
      card.appendChild(empty);
      section.appendChild(card);
      return section;
    }

    const selectedStageId = this.selectedStageForMap ?? this.map.stages[0].id;
    this.selectedStageForMap = selectedStageId;
    const selectedPoint = getStagePosition(this.map, this.draftOverrides, selectedStageId);

    const controls = document.createElement("div");
    controls.className = "admin-grid-3";
    const stageField = document.createElement("label");
    stageField.className = "admin-field";
    stageField.innerHTML = "<span>Stage</span>";
    const stageSelect = document.createElement("select");
    stageSelect.className = "admin-select";
    for (const stage of this.map.stages) {
      const option = document.createElement("option");
      option.value = stage.id;
      option.textContent = stage.id;
      stageSelect.appendChild(option);
    }
    stageSelect.value = selectedStageId;
    stageSelect.addEventListener("change", () => {
      this.selectedStageForMap = stageSelect.value;
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
      this.setStageFromInputs(selectedStageId, xInput.value, yInput.value);
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
      this.setStageFromInputs(selectedStageId, xInput.value, yInput.value);
    });
    yField.appendChild(yInput);
    controls.appendChild(yField);
    card.appendChild(controls);

    const mapCanvas = document.createElement("div");
    mapCanvas.className = "admin-map-canvas";
    mapCanvas.style.backgroundImage = `url(${toResolvedPath(
      this.draftOverrides.background ?? this.map.background
    )})`;

    for (const stage of this.map.stages) {
      const point = getStagePosition(this.map, this.draftOverrides, stage.id);
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "admin-map-marker";
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

    mapCanvas.addEventListener("click", (event) => {
      const rect = mapCanvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      this.draftOverrides = setStagePositionOverride(this.draftOverrides, selectedStageId, {
        x,
        y
      });
      this.notifyPreviewChange();
      this.render();
    });
    card.appendChild(mapCanvas);

    const hint = document.createElement("p");
    hint.className = "admin-copy";
    hint.textContent =
      "Click map to place selected stage marker. Marker changes apply instantly to live preview.";
    card.appendChild(hint);

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

    const entries = [
      ...this.spriteCatalog.map((entry) => ({
        id: entry.id,
        type: entry.category,
        assetPath: entry.assetPath,
        promptText: entry.promptText,
        mediaType: "image" as const
      })),
      ...this.audioCatalog.map((entry) => ({
        id: entry.id,
        type: entry.type,
        assetPath: entry.assetPath,
        promptText: entry.promptText,
        mediaType: "audio" as const
      }))
    ];

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
      "Commits festival map/override snapshots directly via GitHub Contents API. PAT is optional to remember and stored only in this browser.";
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

    const snapshotPathField = document.createElement("label");
    snapshotPathField.className = "admin-field";
    snapshotPathField.innerHTML = "<span>Overrides Snapshot Path</span>";
    const snapshotPathInput = document.createElement("input");
    snapshotPathInput.type = "text";
    snapshotPathInput.className = "admin-input";
    snapshotPathInput.value = this.githubSnapshotPath;
    snapshotPathInput.addEventListener("input", () => {
      this.githubSnapshotPath = snapshotPathInput.value.trim();
      this.persistGithubSettings();
    });
    snapshotPathField.appendChild(snapshotPathInput);
    card.appendChild(snapshotPathField);

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
      : "Commit Festival Map";
    commitMapButton.disabled = this.isPublishing;
    commitMapButton.addEventListener("click", () => {
      void this.commitFestivalMapToGitHub();
    });
    actions.appendChild(commitMapButton);

    const commitSnapshotButton = document.createElement("button");
    commitSnapshotButton.type = "button";
    commitSnapshotButton.className = "admin-btn";
    commitSnapshotButton.textContent = this.isPublishing
      ? "Committing..."
      : "Commit Overrides Snapshot";
    commitSnapshotButton.disabled = this.isPublishing;
    commitSnapshotButton.addEventListener("click", () => {
      void this.commitOverridesSnapshotToGitHub();
    });
    actions.appendChild(commitSnapshotButton);
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
    slotLabel.textContent = selectedSlot.label;
    card.appendChild(slotLabel);

    if (selectedSlot.mediaType === "image") {
      const image = document.createElement("img");
      image.className = "admin-preview-image";
      image.src = selectedSlot.resolvedPath;
      image.alt = selectedSlot.label;
      card.appendChild(image);
    } else {
      const audio = document.createElement("audio");
      audio.className = "admin-preview-audio";
      audio.controls = true;
      audio.preload = "none";
      audio.src = selectedSlot.resolvedPath;
      card.appendChild(audio);
    }

    const path = document.createElement("code");
    path.className = "admin-preview-path";
    path.textContent = summarizeAssetPath(
      selectedSlot.overridePath ?? selectedSlot.defaultPath
    );
    card.appendChild(path);

    const candidate = this.slotCandidates.get(selectedSlot.id);
    if (candidate) {
      const candidateLabel = document.createElement("p");
      candidateLabel.className = "admin-preview-meta";
      candidateLabel.textContent = "Candidate";
      card.appendChild(candidateLabel);
      if (selectedSlot.mediaType === "image") {
        const candidateImage = document.createElement("img");
        candidateImage.className = "admin-preview-image";
        candidateImage.src = candidate;
        candidateImage.alt = `${selectedSlot.label} candidate`;
        card.appendChild(candidateImage);
      } else {
        const candidateAudio = document.createElement("audio");
        candidateAudio.className = "admin-preview-audio";
        candidateAudio.controls = true;
        candidateAudio.preload = "none";
        candidateAudio.src = candidate;
        card.appendChild(candidateAudio);
      }
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
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.geminiModel)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"]
            }
          })
        }
      );
      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Gemini request failed (${response.status}): ${details}`);
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
      this.generateStatus = "Generation complete. Review candidate and apply.";
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
          snapshotPath: this.githubSnapshotPath,
          remember: this.rememberGithubSettings
        },
        null,
        2
      )
    );
  }

  private resolveMapWithOverrides(): FestivalMap {
    if (!hasAdminAssetOverrides(this.draftOverrides)) {
      return structuredClone(this.map);
    }
    return applyAdminAssetOverrides(this.map, this.draftOverrides);
  }

  private collectInlineAssetPaths(map: FestivalMap): string[] {
    const paths: string[] = [];
    const pushIfInline = (path: string, label: string): void => {
      if (hasInlineAssetPath(path)) {
        paths.push(`${label}: ${summarizeAssetPath(path)}`);
      }
    };

    pushIfInline(map.background, "background");
    for (const stage of map.stages) {
      pushIfInline(stage.sprite, `stage:${stage.id}`);
    }
    for (const distraction of map.distractions) {
      pushIfInline(distraction.sprite, `distraction:${distraction.id}`);
    }
    for (const artist of map.assets.artists) {
      pushIfInline(artist.sprites.idle, `artist:${artist.id}:idle`);
      pushIfInline(artist.sprites.performing, `artist:${artist.id}:performing`);
      artist.sprites.walk.forEach((frame, index) => {
        pushIfInline(frame, `artist:${artist.id}:walk${index + 1}`);
      });
    }
    Object.entries(map.assets.audio).forEach(([cue, path]) => {
      pushIfInline(path, `audio:${cue}`);
    });
    return paths;
  }

  private async commitFestivalMapToGitHub(): Promise<void> {
    if (this.isPublishing) {
      return;
    }
    this.isPublishing = true;
    this.publishStatus = "Committing festival map to GitHub...";
    this.render();
    try {
      const mapToCommit = this.resolveMapWithOverrides();
      const inlineReferences = this.collectInlineAssetPaths(mapToCommit);
      if (inlineReferences.length > 0) {
        throw new Error(
          `Cannot commit map config with inline assets. Convert to file paths first.\n${inlineReferences
            .slice(0, 5)
            .join("\n")}`
        );
      }
      const content = `${JSON.stringify(mapToCommit, null, 2)}\n`;
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
      this.publishStatus = `${commitLine}${fileLine}`;
      this.persistGithubSettings();
    } catch (error) {
      this.publishStatus = String(error);
    } finally {
      this.isPublishing = false;
      this.render();
    }
  }

  private async commitOverridesSnapshotToGitHub(): Promise<void> {
    if (this.isPublishing) {
      return;
    }
    this.isPublishing = true;
    this.publishStatus = "Committing overrides snapshot to GitHub...";
    this.render();
    try {
      const payload = {
        festivalId: this.activeFestivalId,
        exportedAt: new Date().toISOString(),
        mapConfigPath: this.mapConfigPath,
        overrides: this.draftOverrides
      };
      const result = await putFileToGitHub({
        token: this.githubToken,
        owner: this.githubOwner,
        repo: this.githubRepo,
        branch: this.githubBranch,
        path: this.githubSnapshotPath,
        message: this.githubCommitMessage.trim().length
          ? `${this.githubCommitMessage.trim()} (snapshot)`
          : `chore(admin): snapshot overrides for ${this.activeFestivalId}`,
        content: `${JSON.stringify(payload, null, 2)}\n`
      });
      const commitLine = result.commitUrl ? `Commit: ${result.commitUrl}` : "Commit pushed.";
      const fileLine = result.fileUrl ? ` File: ${result.fileUrl}` : "";
      this.publishStatus = `${commitLine}${fileLine}`;
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
