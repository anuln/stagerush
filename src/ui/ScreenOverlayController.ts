import type {
  ScreenActionId,
  ScreenActionModel,
  ScreenViewModel,
  SessionWrapModel
} from "./ScreenState";

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
  private counterFrames: number[] = [];
  private counterTimers: number[] = [];
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

  private buildModelKey(model: ScreenViewModel): string {
    const summary = model.summaryRows
      .map((row) => `${row.label}:${row.value}`)
      .join("|");
    const actions = model.actions
      .map((action) => `${action.id}:${action.label}:${action.emphasis ?? ""}`)
      .join("|");
    const wrap = model.sessionWrap;
    if (!wrap) {
      return [
        model.screen,
        model.title,
        model.subtitle,
        summary,
        actions
      ].join("~");
    }
    const metrics = wrap.metrics
      .map((metric) => `${metric.id}:${metric.value}:${metric.tone ?? ""}`)
      .join("|");
    return [
      model.screen,
      model.title,
      model.subtitle,
      summary,
      actions,
      wrap.outcome,
      wrap.resultLabel,
      wrap.tier,
      String(wrap.sessionScore),
      String(wrap.runTotalScore),
      metrics,
      wrap.progress.nextLabel
    ].join("~");
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

  private clearCounterAnimations(): void {
    for (const handle of this.counterFrames) {
      cancelAnimationFrame(handle);
    }
    this.counterFrames = [];
    for (const handle of this.counterTimers) {
      window.clearTimeout(handle);
    }
    this.counterTimers = [];
  }

  private createActions(
    actionsModel: ScreenActionModel[],
    onAction: (actionId: ScreenActionId) => void
  ): HTMLDivElement {
    const actions = document.createElement("div");
    actions.className = "screen-actions";
    actionsModel.forEach((action, index) => {
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
    return actions;
  }

  private formatMetricTone(
    tone: SessionWrapModel["metrics"][number]["tone"]
  ): string {
    if (tone === "positive") {
      return "is-positive";
    }
    if (tone === "critical") {
      return "is-critical";
    }
    if (tone === "warning") {
      return "is-warning";
    }
    return "is-neutral";
  }

  private appendSessionWrap(
    panel: HTMLElement,
    model: ScreenViewModel,
    sessionWrap: SessionWrapModel,
    onAction: (actionId: ScreenActionId) => void
  ): void {
    panel.classList.add("is-session-wrap");
    panel.dataset.outcome = sessionWrap.outcome;

    const fxLayer = document.createElement("div");
    fxLayer.className = "screen-session-fx";
    const sparkleCount =
      sessionWrap.outcome === "festival_complete"
        ? 11
        : sessionWrap.outcome === "complete"
          ? 7
          : 4;
    for (let index = 0; index < sparkleCount; index += 1) {
      const spark = document.createElement("span");
      spark.className = "screen-session-spark";
      spark.style.setProperty("--spark-index", String(index));
      fxLayer.appendChild(spark);
    }
    panel.appendChild(fxLayer);

    const header = document.createElement("header");
    header.className = "screen-session-header";

    const titleBlock = document.createElement("div");
    titleBlock.className = "screen-session-title-block";
    const daySession = document.createElement("p");
    daySession.className = "screen-session-day";
    daySession.textContent = model.title;
    const result = document.createElement("h2");
    result.className = "screen-session-result";
    result.textContent = sessionWrap.resultLabel;
    titleBlock.append(daySession, result);

    const tierBadge = document.createElement("div");
    tierBadge.className = "screen-session-tier";
    const tierLabel = document.createElement("span");
    tierLabel.textContent = "Tier";
    const tierIcon = document.createElement("img");
    tierIcon.className = "screen-session-tier-icon";
    tierIcon.src = sessionWrap.tierIconPath;
    tierIcon.alt = `${sessionWrap.tier} trophy`;
    tierBadge.append(tierLabel, tierIcon);

    header.append(titleBlock, tierBadge);
    panel.appendChild(header);

    const scoreStrip = document.createElement("section");
    scoreStrip.className = "screen-session-score-strip";
    const sessionScoreCard = document.createElement("article");
    sessionScoreCard.className = "screen-session-score-card";
    sessionScoreCard.innerHTML = "<span>Session Score</span>";
    const sessionValue = document.createElement("strong");
    sessionValue.className = "screen-score-counter";
    sessionValue.dataset.counterTarget = String(sessionWrap.sessionScore);
    sessionValue.dataset.counterPrefix = "🏆 ";
    sessionScoreCard.appendChild(sessionValue);

    const runScoreCard = document.createElement("article");
    runScoreCard.className = "screen-session-score-card is-run-total";
    runScoreCard.innerHTML = "<span>Festival Score</span>";
    const runValue = document.createElement("strong");
    runValue.className = "screen-score-counter";
    runValue.dataset.counterTarget = String(sessionWrap.runTotalScore);
    runValue.dataset.counterPrefix = "⚡ ";
    runScoreCard.appendChild(runValue);
    scoreStrip.append(sessionScoreCard, runScoreCard);
    panel.appendChild(scoreStrip);

    const metrics = document.createElement("section");
    metrics.className = "screen-session-metrics";
    sessionWrap.metrics.forEach((metric) => {
      const card = document.createElement("article");
      card.className = `screen-session-metric ${this.formatMetricTone(metric.tone)}`;
      const label = document.createElement("span");
      label.className = "screen-session-metric-label";
      label.textContent = metric.label;
      const body = document.createElement("div");
      body.className = "screen-session-metric-body";
      const value = document.createElement("strong");
      value.className = "screen-session-metric-value";
      value.textContent = metric.value;
      body.appendChild(value);
      if (metric.id === "artists-routed") {
        const statusDot = document.createElement("span");
        statusDot.className = "screen-session-metric-dot";
        statusDot.classList.add(this.formatMetricTone(metric.tone));
        statusDot.setAttribute("aria-hidden", "true");
        body.appendChild(statusDot);
      }
      card.append(label, body);
      metrics.appendChild(card);
    });
    panel.appendChild(metrics);

    const progress = document.createElement("section");
    progress.className = "screen-session-progress";
    const next = document.createElement("p");
    next.className = "screen-session-next";
    next.textContent = sessionWrap.progress.nextLabel;
    progress.append(next);
    panel.appendChild(progress);

    panel.appendChild(this.createActions(model.actions, onAction));
  }

  private animateCounters(panel: HTMLElement): void {
    this.clearCounterAnimations();
    const counters = Array.from(
      panel.querySelectorAll<HTMLElement>("[data-counter-target]")
    );
    if (counters.length === 0) {
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    counters.forEach((counter) => {
      const target = Number.parseInt(counter.dataset.counterTarget ?? "0", 10);
      const prefix = counter.dataset.counterPrefix ?? "";
      const finalValue = Math.max(0, Math.floor(target));
      if (!Number.isFinite(target) || reducedMotion || finalValue <= 0) {
        counter.textContent = `${prefix}${finalValue.toLocaleString()}`;
        return;
      }

      const durationMs = Math.min(1400, Math.max(550, Math.floor(finalValue * 0.55)));
      const startedAt = performance.now();
      counter.textContent = `${prefix}0`;

      const tick = (now: number): void => {
        const elapsed = now - startedAt;
        const t = Math.max(0, Math.min(1, elapsed / durationMs));
        const eased = 1 - Math.pow(1 - t, 3);
        const value = Math.round(finalValue * eased);
        counter.textContent = `${prefix}${value.toLocaleString()}`;
        if (t < 1) {
          const handle = requestAnimationFrame(tick);
          this.counterFrames.push(handle);
          return;
        }
        counter.textContent = `${prefix}${finalValue.toLocaleString()}`;
      };

      const firstHandle = requestAnimationFrame(tick);
      this.counterFrames.push(firstHandle);
      const finalHandle = window.setTimeout(() => {
        counter.textContent = `${prefix}${finalValue.toLocaleString()}`;
      }, durationMs + 120);
      this.counterTimers.push(finalHandle);
    });
  }

  render(
    model: ScreenViewModel | null,
    onAction: (actionId: ScreenActionId) => void
  ): void {
    if (!model) {
      this.clearCounterAnimations();
      if (!this.root.classList.contains("is-hidden")) {
        this.root.classList.add("is-hidden");
      }
      this.lastKey = "";
      return;
    }

    const key = this.buildModelKey(model);
    if (this.lastKey === key && !this.root.classList.contains("is-hidden")) {
      return;
    }
    this.clearCounterAnimations();
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

    if (model.screen !== "MENU" && model.sessionWrap) {
      this.appendSessionWrap(panel, model, model.sessionWrap, onAction);
    } else {
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
      panel.appendChild(this.createActions(model.actions, onAction));
    }
    this.root.appendChild(panel);
    if (model.sessionWrap && model.screen !== "MENU") {
      this.animateCounters(panel);
    }
  }
}
