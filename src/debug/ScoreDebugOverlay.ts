import type { GameManagerSnapshot } from "../game/GameManager";
import type { ScreenViewModel } from "../ui/ScreenState";

function formatNumber(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? NaN)) {
    return "-";
  }
  return String(Math.max(0, Math.floor(value ?? 0)));
}

export class ScoreDebugOverlay {
  private readonly enabled: boolean;
  private readonly root: HTMLDivElement | null;

  constructor(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.root = null;
      return;
    }
    const root = document.createElement("div");
    root.className = "score-debug-overlay";
    document.body.appendChild(root);
    this.root = root;
  }

  update(snapshot: GameManagerSnapshot | null, model: ScreenViewModel | null): void {
    if (!this.enabled || !this.root) {
      return;
    }
    const runtime = snapshot?.runtime ?? null;
    const wrap = model?.sessionWrap ?? null;
    const sessionText =
      document.querySelector<HTMLElement>(
        ".screen-session-score-card .screen-score-counter"
      )?.textContent ?? "-";
    const festivalText =
      document.querySelector<HTMLElement>(
        ".screen-session-score-card.is-run-total .screen-score-counter"
      )?.textContent ?? "-";
    const lines = [
      "Score Debug",
      `screen=${snapshot?.screen ?? "UNINITIALIZED"}`,
      `runtime.levelScore=${formatNumber(runtime?.levelScore ?? null)}`,
      `level.lastLevelScore=${formatNumber(snapshot?.level.lastLevelScore ?? null)}`,
      `level.cumulativeScore=${formatNumber(snapshot?.level.cumulativeScore ?? null)}`,
      `wrap.sessionScore=${formatNumber(wrap?.sessionScore ?? null)}`,
      `wrap.festivalScore=${formatNumber(wrap?.runTotalScore ?? null)}`,
      `rendered.session=${sessionText}`,
      `rendered.festival=${festivalText}`,
      `delivered=${formatNumber(runtime?.deliveredArtists ?? null)} missed=${formatNumber(runtime?.missedArtists ?? null)}`
    ];
    this.root.textContent = lines.join("\n");
  }

  dispose(): void {
    this.root?.remove();
  }
}
