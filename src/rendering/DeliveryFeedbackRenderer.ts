import { Container, Graphics, Text } from "pixi.js";
import type { ArtistMissReason } from "../entities/ArtistState";
import type { StageRuntimeSnapshot } from "../entities/StageState";
import type { ScoreEvent } from "../game/ScoreManager";
import { clamp } from "../utils/MathUtils";

export interface MissEvent {
  artistId: string;
  position: { x: number; y: number };
  reason: ArtistMissReason;
}

interface FeedbackPopup {
  id: string;
  text: string;
  color: number;
  isCombo: boolean;
  position: { x: number; y: number };
  createdAtMs: number;
  durationMs: number;
}

interface DeliveryFeedbackFrame {
  nowMs: number;
  scoreEvents: ScoreEvent[];
  missEvents: MissEvent[];
  stageSnapshots: StageRuntimeSnapshot[];
  viewport: { width: number; height: number };
}

function parseColor(hex: string, fallback = 0xe6e6e6): number {
  const normalized = hex.replace("#", "");
  const parsed = Number.parseInt(normalized, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildScorePopupText(event: {
  awardedPoints: number;
  comboMultiplier: number;
}): string {
  if (event.comboMultiplier <= 1) {
    return `+${event.awardedPoints}`;
  }
  return `+${event.awardedPoints} (${event.comboMultiplier.toFixed(1)}x)`;
}

export class DeliveryFeedbackRenderer {
  private readonly layer: Container;
  private popups: FeedbackPopup[] = [];

  constructor(layer: Container) {
    this.layer = layer;
  }

  render(frame: DeliveryFeedbackFrame): void {
    for (const scoreEvent of frame.scoreEvents) {
      const isCombo = scoreEvent.comboMultiplier > 1;
      this.popups.push({
        id: `score-${scoreEvent.artistId}-${scoreEvent.completedAtMs}`,
        text: buildScorePopupText(scoreEvent),
        color: isCombo ? 0xffd166 : parseColor(scoreEvent.stageColor, 0x9be26d),
        isCombo,
        position: { ...scoreEvent.stagePosition },
        createdAtMs: frame.nowMs,
        durationMs: 950
      });
    }

    for (const missEvent of frame.missEvents) {
      const missLabel =
        missEvent.reason === "timeout"
          ? "TIME OUT"
          : missEvent.reason === "bounds"
            ? "OFF STAGE"
            : "MISS";
      this.popups.push({
        id: `miss-${missEvent.artistId}-${frame.nowMs}`,
        text: missLabel,
        color: 0xff5a5a,
        isCombo: false,
        position: { ...missEvent.position },
        createdAtMs: frame.nowMs,
        durationMs: 750
      });
    }

    this.popups = this.popups.filter(
      (popup) => frame.nowMs <= popup.createdAtMs + popup.durationMs
    );

    this.layer.removeChildren();
    this.renderStageOccupancy(frame.stageSnapshots);
    this.renderPopups(frame.nowMs);
  }

  private renderStageOccupancy(stageSnapshots: StageRuntimeSnapshot[]): void {
    for (const stage of stageSnapshots) {
      if (!stage.isOccupied) {
        continue;
      }
      const color = parseColor(stage.color, 0xffffff);
      const pulse = new Graphics();
      pulse.circle(stage.position.x, stage.position.y, 58);
      pulse.stroke({
        color,
        width: 4,
        alpha: 0.7
      });
      this.layer.addChild(pulse);

      const inner = new Graphics();
      inner.circle(stage.position.x, stage.position.y, 38);
      inner.fill({ color, alpha: 0.08 });
      inner.stroke({ color: 0xffffff, width: 2, alpha: 0.32 });
      this.layer.addChild(inner);
    }
  }

  private renderPopups(nowMs: number): void {
    for (const popup of this.popups) {
      const elapsed = nowMs - popup.createdAtMs;
      const progress = clamp(elapsed / popup.durationMs, 0, 1);
      const label = new Text({
        text: popup.text,
        style: {
          fontFamily: "Avenir Next, Helvetica, Arial, sans-serif",
          fontSize: popup.text.includes("MISS") || popup.text.includes("OUT")
            ? 14
            : popup.isCombo
              ? 22
              : 20,
          fill: popup.color,
          stroke: {
            color: 0x111111,
            width: 2
          }
        }
      });
      label.anchor.set(0.5, 1);
      label.position.set(
        popup.position.x,
        popup.position.y - 18 - progress * 32
      );
      label.alpha = 1 - progress;

      const bg = new Graphics();
      const paddingX = 12;
      const paddingY = 6;
      const width = label.width + paddingX * 2;
      const height = label.height + paddingY * 2;
      bg.roundRect(
        label.position.x - width / 2,
        label.position.y - height + 4,
        width,
        height,
        10
      );
      bg.fill({ color: 0x101014, alpha: 0.42 * label.alpha });
      bg.stroke({ color: 0xffffff, width: 1, alpha: 0.18 * label.alpha });
      this.layer.addChild(bg);
      this.layer.addChild(label);
    }
  }
}
