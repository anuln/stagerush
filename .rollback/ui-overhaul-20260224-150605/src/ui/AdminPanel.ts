import type { FestivalMap } from "../config/FestivalConfig";
import type {
  AdminAssetOverrides,
  ArtistAssetOverride
} from "../admin/AdminAssetOverrides";

interface SpriteCatalogEntry {
  id: string;
  category: "background" | "stage" | "distraction" | "artist";
  assetPath: string;
  promptText: string;
}

interface AudioCatalogEntry {
  id: string;
  type: "music" | "sfx";
  assetPath: string;
  promptText: string;
}

interface AdminPanelOptions {
  map: FestivalMap;
  initialOverrides: AdminAssetOverrides;
  onApply: (overrides: AdminAssetOverrides) => void;
  onReset: () => void;
}

const DEFAULT_OPTION_VALUE = "__default__";

export class AdminPanel {
  private readonly map: FestivalMap;
  private readonly onApply: AdminPanelOptions["onApply"];
  private readonly onReset: AdminPanelOptions["onReset"];
  private readonly root: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly toggle: HTMLButtonElement;
  private draftOverrides: AdminAssetOverrides;
  private spriteCatalog: SpriteCatalogEntry[] = [];
  private audioCatalog: AudioCatalogEntry[] = [];

  constructor(options: AdminPanelOptions) {
    this.map = options.map;
    this.onApply = options.onApply;
    this.onReset = options.onReset;
    this.draftOverrides = structuredClone(options.initialOverrides);

    this.root = document.createElement("div");
    this.root.className = "admin-root";
    document.body.appendChild(this.root);

    this.toggle = document.createElement("button");
    this.toggle.type = "button";
    this.toggle.className = "admin-toggle";
    this.toggle.textContent = "Admin";
    this.toggle.addEventListener("click", () => {
      this.panel.classList.toggle("is-open");
    });
    this.root.appendChild(this.toggle);

    this.panel = document.createElement("div");
    this.panel.className = "admin-panel";
    this.root.appendChild(this.panel);

    const heading = document.createElement("header");
    heading.className = "admin-heading";
    const title = document.createElement("h2");
    title.textContent = "Asset Lab";
    heading.appendChild(title);

    const actions = document.createElement("div");
    actions.className = "admin-actions";
    const applyButton = document.createElement("button");
    applyButton.type = "button";
    applyButton.className = "admin-btn primary";
    applyButton.textContent = "Apply + Reload";
    applyButton.addEventListener("click", () => {
      this.onApply(this.draftOverrides);
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
    heading.appendChild(actions);

    this.panel.appendChild(heading);
    this.body = document.createElement("div");
    this.body.className = "admin-body";
    this.panel.appendChild(this.body);

    void this.loadCatalogs();
  }

  private async loadCatalogs(): Promise<void> {
    const [sprites, audio] = await Promise.all([
      this.fetchCatalog<SpriteCatalogEntry>("/assets/admin/sprite_catalog.json"),
      this.fetchCatalog<AudioCatalogEntry>("/assets/admin/audio_catalog.json")
    ]);
    this.spriteCatalog = sprites;
    this.audioCatalog = audio;
    this.render();
  }

  private async fetchCatalog<T extends { id: string }>(
    path: string
  ): Promise<T[]> {
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

  private render(): void {
    this.body.replaceChildren();
    this.body.appendChild(this.buildSpriteSwapSection());
    this.body.appendChild(this.buildPromptSection());
  }

  private buildSpriteSwapSection(): HTMLElement {
    const section = document.createElement("section");
    section.className = "admin-section";
    const title = document.createElement("h3");
    title.textContent = "Sprite Overrides";
    section.appendChild(title);

    section.appendChild(
      this.buildSelectRow(
        "Background",
        this.map.background,
        this.uniquePaths("background", [this.map.background]),
        this.draftOverrides.background,
        (next) => {
          if (!next) {
            delete this.draftOverrides.background;
            return;
          }
          this.draftOverrides.background = next;
        }
      )
    );

    for (const stage of this.map.stages) {
      section.appendChild(
        this.buildSelectRow(
          `Stage: ${stage.id}`,
          stage.sprite,
          this.uniquePaths("stage", [stage.sprite]),
          this.draftOverrides.stageSprites?.[stage.id],
          (next) => {
            this.setOverrideMapValue("stageSprites", stage.id, next);
          }
        )
      );
    }

    const distractionTypes = Array.from(
      new Set(this.map.distractions.map((item) => item.type))
    );
    for (const type of distractionTypes) {
      section.appendChild(
        this.buildSelectRow(
          `Distraction: ${type}`,
          this.map.assets.distractionSprites[type],
          this.uniquePaths("distraction", [this.map.assets.distractionSprites[type]]),
          this.draftOverrides.distractionSprites?.[type],
          (next) => {
            this.setOverrideMapValue("distractionSprites", type, next);
          }
        )
      );
    }

    const artistCandidates = this.uniquePaths("artist", []);
    for (const artist of this.map.assets.artists) {
      section.appendChild(
        this.buildSelectRow(
          `Artist ${artist.id}: idle`,
          artist.sprites.idle,
          this.uniqueAssetCandidates(artist.sprites.idle, artistCandidates),
          this.draftOverrides.artistSprites?.[artist.id]?.idle,
          (next) => this.setArtistOverride(artist.id, "idle", next)
        )
      );
      section.appendChild(
        this.buildSelectRow(
          `Artist ${artist.id}: walk 1`,
          artist.sprites.walk[0],
          this.uniqueAssetCandidates(artist.sprites.walk[0], artistCandidates),
          this.draftOverrides.artistSprites?.[artist.id]?.walk1,
          (next) => this.setArtistOverride(artist.id, "walk1", next)
        )
      );
      section.appendChild(
        this.buildSelectRow(
          `Artist ${artist.id}: walk 2`,
          artist.sprites.walk[1],
          this.uniqueAssetCandidates(artist.sprites.walk[1], artistCandidates),
          this.draftOverrides.artistSprites?.[artist.id]?.walk2,
          (next) => this.setArtistOverride(artist.id, "walk2", next)
        )
      );
      section.appendChild(
        this.buildSelectRow(
          `Artist ${artist.id}: performing`,
          artist.sprites.performing,
          this.uniqueAssetCandidates(artist.sprites.performing, artistCandidates),
          this.draftOverrides.artistSprites?.[artist.id]?.performing,
          (next) => this.setArtistOverride(artist.id, "performing", next)
        )
      );
    }

    return section;
  }

  private buildPromptSection(): HTMLElement {
    const section = document.createElement("section");
    section.className = "admin-section";
    const title = document.createElement("h3");
    title.textContent = "Generation Prompts";
    section.appendChild(title);

    const spriteTitle = document.createElement("h4");
    spriteTitle.textContent = "Sprites";
    section.appendChild(spriteTitle);
    section.appendChild(this.buildPromptList(this.spriteCatalog, "No sprite prompt catalog found."));

    const audioTitle = document.createElement("h4");
    audioTitle.textContent = "Audio";
    section.appendChild(audioTitle);
    section.appendChild(this.buildPromptList(this.audioCatalog, "No audio prompt catalog found."));
    return section;
  }

  private buildPromptList(
    items: Array<{ id: string; assetPath: string; promptText: string }>,
    emptyText: string
  ): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "admin-prompts";
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "admin-empty";
      empty.textContent = emptyText;
      wrapper.appendChild(empty);
      return wrapper;
    }

    for (const item of items) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = `${item.id} -> ${item.assetPath}`;
      details.appendChild(summary);
      const prompt = document.createElement("pre");
      prompt.textContent = item.promptText;
      details.appendChild(prompt);
      wrapper.appendChild(details);
    }
    return wrapper;
  }

  private buildSelectRow(
    label: string,
    defaultPath: string,
    choices: string[],
    overridePath: string | undefined,
    onChange: (next: string | null) => void
  ): HTMLElement {
    const row = document.createElement("label");
    row.className = "admin-row";
    const labelNode = document.createElement("span");
    labelNode.textContent = label;
    row.appendChild(labelNode);

    const select = document.createElement("select");
    const defaultOption = document.createElement("option");
    defaultOption.value = DEFAULT_OPTION_VALUE;
    defaultOption.textContent = `Default (${defaultPath})`;
    select.appendChild(defaultOption);

    for (const path of choices) {
      if (!path) {
        continue;
      }
      const option = document.createElement("option");
      option.value = path;
      option.textContent = path;
      select.appendChild(option);
    }

    select.value = overridePath ?? DEFAULT_OPTION_VALUE;
    select.addEventListener("change", () => {
      const value =
        select.value === DEFAULT_OPTION_VALUE
          ? null
          : select.value.trim().length > 0
            ? select.value
            : null;
      onChange(value);
    });
    row.appendChild(select);
    return row;
  }

  private uniquePaths(
    category: SpriteCatalogEntry["category"],
    seed: string[]
  ): string[] {
    const paths = new Set(seed);
    for (const item of this.spriteCatalog) {
      if (item.category === category) {
        paths.add(item.assetPath);
      }
    }
    return Array.from(paths).filter(Boolean).sort();
  }

  private uniqueAssetCandidates(defaultPath: string, candidates: string[]): string[] {
    return Array.from(new Set([defaultPath, ...candidates])).filter(Boolean).sort();
  }

  private setOverrideMapValue(
    key: "stageSprites" | "distractionSprites",
    id: string,
    value: string | null
  ): void {
    const next = { ...(this.draftOverrides[key] ?? {}) };
    if (!value) {
      delete next[id];
    } else {
      next[id] = value;
    }
    if (Object.keys(next).length === 0) {
      delete this.draftOverrides[key];
      return;
    }
    this.draftOverrides[key] = next;
  }

  private setArtistOverride(
    artistId: string,
    field: keyof ArtistAssetOverride,
    value: string | null
  ): void {
    const overrides = { ...(this.draftOverrides.artistSprites ?? {}) };
    const current = { ...(overrides[artistId] ?? {}) };

    if (!value) {
      delete current[field];
    } else {
      current[field] = value;
    }

    if (Object.keys(current).length === 0) {
      delete overrides[artistId];
    } else {
      overrides[artistId] = current;
    }

    if (Object.keys(overrides).length === 0) {
      delete this.draftOverrides.artistSprites;
    } else {
      this.draftOverrides.artistSprites = overrides;
    }
  }
}
