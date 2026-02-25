import type { ScreenActionId, ScreenViewModel } from "./ScreenState";

export interface MenuMediaConfig {
  path: string;
  mediaType: "image" | "video";
  fitMode: "cover" | "contain";
  focusX: number;
  focusY: number;
  zoom: number;
  overlayOpacity: number;
}

export class ScreenOverlayController {
  private readonly root: HTMLDivElement;
  private lastKey = "";
  private menuMedia: MenuMediaConfig = {
    path: "/assets/ui/stage-rush-intro-mobile.png",
    mediaType: "image",
    fitMode: "cover",
    focusX: 50,
    focusY: 50,
    zoom: 1,
    overlayOpacity: 0.82
  };

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "screen-overlay is-hidden";
    document.body.appendChild(this.root);
  }

  setMenuMedia(next: MenuMediaConfig): void {
    this.menuMedia = {
      ...next,
      fitMode: next.fitMode === "contain" ? "contain" : "cover",
      focusX: Math.max(0, Math.min(100, next.focusX)),
      focusY: Math.max(0, Math.min(100, next.focusY)),
      zoom: Math.max(0.7, Math.min(2.5, next.zoom)),
      overlayOpacity: Math.max(0, Math.min(1, next.overlayOpacity))
    };
    this.lastKey = "";
  }

  render(
    model: ScreenViewModel | null,
    onAction: (actionId: ScreenActionId) => void
  ): void {
    if (!model) {
      if (!this.root.classList.contains("is-hidden")) {
        this.root.classList.add("is-hidden");
      }
      this.lastKey = "";
      return;
    }

    const key = JSON.stringify(model);
    if (this.lastKey === key && !this.root.classList.contains("is-hidden")) {
      return;
    }
    this.lastKey = key;
    this.root.classList.remove("is-hidden");
    this.root.dataset.screen = model.screen.toLowerCase();
    this.root.replaceChildren();

    const panel = document.createElement("section");
    panel.className = "screen-panel";
    if (model.screen === "MENU") {
      panel.style.setProperty("--intro-fit-mode", this.menuMedia.fitMode);
      panel.style.setProperty("--intro-focus-x", `${this.menuMedia.focusX}%`);
      panel.style.setProperty("--intro-focus-y", `${this.menuMedia.focusY}%`);
      panel.style.setProperty("--intro-zoom", String(this.menuMedia.zoom));
      panel.style.setProperty(
        "--intro-overlay-opacity",
        String(this.menuMedia.overlayOpacity)
      );
      if (this.menuMedia.mediaType === "video") {
        const media = document.createElement("video");
        media.className = "screen-menu-media";
        media.src = this.menuMedia.path;
        media.autoplay = true;
        media.loop = true;
        media.muted = true;
        media.playsInline = true;
        media.preload = "auto";
        media.setAttribute("aria-hidden", "true");
        panel.appendChild(media);
        void media.play().catch(() => {
          // Safari may defer muted autoplay until first interaction.
        });
      } else {
        const media = document.createElement("img");
        media.className = "screen-menu-media";
        media.src = this.menuMedia.path;
        media.alt = "";
        media.setAttribute("aria-hidden", "true");
        panel.appendChild(media);
      }
    }

    const title = document.createElement("h1");
    title.textContent = model.title;
    panel.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.className = "screen-subtitle";
    subtitle.textContent = model.subtitle;
    panel.appendChild(subtitle);

    const summary = document.createElement("div");
    summary.className = "screen-summary";
    model.summaryRows.forEach((row, index) => {
      const summaryRow = document.createElement("div");
      summaryRow.className = "screen-summary-row";
      summaryRow.style.setProperty("--row-index", String(index));

      const label = document.createElement("span");
      label.className = "screen-summary-label";
      label.textContent = row.label;
      const value = document.createElement("span");
      value.className = "screen-summary-value";
      value.textContent = row.value;
      summaryRow.append(label, value);
      summary.appendChild(summaryRow);
    });
    panel.appendChild(summary);

    const actions = document.createElement("div");
    actions.className = "screen-actions";
    model.actions.forEach((action, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `screen-action ${action.emphasis ?? "secondary"}`;
      button.style.setProperty("--action-index", String(index));
      button.setAttribute("aria-label", action.label);
      button.textContent = action.label;
      button.addEventListener("click", () => onAction(action.id));
      button.addEventListener(
        "touchend",
        (event) => {
          event.preventDefault();
          onAction(action.id);
        },
        { passive: false }
      );
      actions.appendChild(button);
    });
    panel.appendChild(actions);
    this.root.appendChild(panel);
  }
}
