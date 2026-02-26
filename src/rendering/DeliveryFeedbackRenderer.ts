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

export type HazardFeedbackType = "chat" | "distraction";

export interface HazardFeedbackEvent {
  id: string;
  type: HazardFeedbackType;
  position: { x: number; y: number };
}

export type GuidanceBubbleTone = "neutral" | "positive" | "warning";

export interface GuidanceFeedbackEvent {
  id: string;
  text: string;
  position: { x: number; y: number };
  sticky?: boolean;
  tone?: GuidanceBubbleTone;
  durationMs?: number;
  opacity?: number;
}

interface FeedbackPopup {
  id: string;
  text: string;
  color: number;
  isCombo: boolean;
  kind: "score" | "miss" | "hazard" | "guidance";
  hazardType: HazardFeedbackType | null;
  guidanceTone: GuidanceBubbleTone;
  guidanceOpacity: number;
  position: { x: number; y: number };
  createdAtMs: number;
  durationMs: number;
}

interface DeliveryFeedbackFrame {
  nowMs: number;
  scoreEvents: ScoreEvent[];
  missEvents: MissEvent[];
  hazardEvents: HazardFeedbackEvent[];
  guidanceEvents: GuidanceFeedbackEvent[];
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

export function buildHazardBubbleText(type: HazardFeedbackType): string {
  return type === "chat" ? "..." : "!";
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
      this.pushPopup({
        id: `score-${scoreEvent.artistId}-${scoreEvent.completedAtMs}`,
        text: buildScorePopupText(scoreEvent),
        color: isCombo ? 0xffd166 : parseColor(scoreEvent.stageColor, 0x9be26d),
        isCombo,
        kind: "score",
        hazardType: null,
        guidanceTone: "neutral",
        guidanceOpacity: 1,
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
      this.pushPopup({
        id: `miss-${missEvent.artistId}-${frame.nowMs}`,
        text: missLabel,
        color: 0xff5a5a,
        isCombo: false,
        kind: "miss",
        hazardType: null,
        guidanceTone: "warning",
        guidanceOpacity: 1,
        position: { ...missEvent.position },
        createdAtMs: frame.nowMs,
        durationMs: 750
      });
    }

    for (const hazardEvent of frame.hazardEvents) {
      this.pushPopup({
        id: `hazard-${hazardEvent.id}-${frame.nowMs}`,
        text: buildHazardBubbleText(hazardEvent.type),
        color: hazardEvent.type === "chat" ? 0xf6d9ff : 0xfff0cc,
        isCombo: false,
        kind: "hazard",
        hazardType: hazardEvent.type,
        guidanceTone: "neutral",
        guidanceOpacity: 1,
        position: { ...hazardEvent.position },
        createdAtMs: frame.nowMs,
        durationMs: 920
      });
    }

    for (const guidanceEvent of frame.guidanceEvents) {
      this.pushPopup({
        id: `guidance-${guidanceEvent.id}`,
        text: guidanceEvent.text,
        color: this.resolveGuidanceColor(guidanceEvent.tone ?? "neutral"),
        isCombo: false,
        kind: "guidance",
        hazardType: null,
        guidanceTone: guidanceEvent.tone ?? "neutral",
        guidanceOpacity: clamp(guidanceEvent.opacity ?? 1, 0.35, 1),
        position: { ...guidanceEvent.position },
        createdAtMs: frame.nowMs,
        durationMs: Math.max(
          250,
          Math.floor(guidanceEvent.durationMs ?? (guidanceEvent.sticky ? 260 : 1250))
        )
      });
    }

    this.popups = this.popups.filter(
      (popup) =>
        !Number.isFinite(popup.durationMs) || frame.nowMs <= popup.createdAtMs + popup.durationMs
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
      const wobble =
        popup.kind === "hazard" || popup.kind === "guidance"
          ? Math.sin(progress * Math.PI * 2.2) * 3
          : 0;
      const label = new Text({
        text: popup.text,
        style: {
          fontFamily: "Avenir Next, Helvetica, Arial, sans-serif",
          fontSize:
            popup.kind === "hazard"
              ? 24
              : popup.kind === "guidance"
                ? 14
              : popup.text.includes("MISS") || popup.text.includes("OUT")
                ? 14
                : popup.isCombo
                  ? 22
                  : 20,
          lineHeight: popup.kind === "guidance" ? 16 : undefined,
          wordWrap: popup.kind === "guidance",
          wordWrapWidth: popup.kind === "guidance" ? 210 : undefined,
          fill: popup.kind === "hazard" || popup.kind === "guidance" ? 0x111111 : popup.color,
          stroke: {
            color: popup.kind === "hazard" || popup.kind === "guidance" ? 0xffffff : 0x111111,
            width: popup.kind === "hazard" || popup.kind === "guidance" ? 0 : 2
          }
        }
      });
      label.anchor.set(0.5, 1);
      label.position.set(
        popup.position.x + wobble,
        popup.position.y -
          18 -
          progress * (popup.kind === "hazard" || popup.kind === "guidance" ? 12 : 32)
      );
      label.alpha = (1 - progress) * (popup.kind === "guidance" ? popup.guidanceOpacity : 1);

      if (popup.kind === "hazard" || popup.kind === "guidance") {
        this.layer.addChild(this.createThoughtBubble(popup, label));
      } else {
        this.layer.addChild(this.createPopupBackground(label));
      }
      this.layer.addChild(label);
    }
  }

  private createPopupBackground(label: Text): Graphics {
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
    return bg;
  }

  private createThoughtBubble(popup: FeedbackPopup, label: Text): Graphics {
    const bg = new Graphics();
    const paddingX = popup.kind === "guidance" ? 12 : 10;
    const paddingY = popup.kind === "guidance" ? 8 : 7;
    const width = label.width + paddingX * 2;
    const height = label.height + paddingY * 2;
    const rectX = label.position.x - width / 2;
    const rectY = label.position.y - height + 4;
    const radius = 14;
    const alpha = 0.9 * label.alpha;

    bg.roundRect(rectX, rectY, width, height, radius);
    bg.fill({ color: 0xffffff, alpha });
    bg.stroke({ color: 0x0f0f11, width: 2, alpha: 0.92 * label.alpha });

    const tailBaseX = rectX + width * 0.3;
    const tailBaseY = rectY + height;
    bg.moveTo(tailBaseX - 6, tailBaseY - 1);
    bg.lineTo(tailBaseX + 9, tailBaseY - 1);
    bg.lineTo(tailBaseX - 1, tailBaseY + 10);
    bg.closePath();
    bg.fill({ color: 0xffffff, alpha });
    bg.stroke({ color: 0x0f0f11, width: 2, alpha: 0.92 * label.alpha });
    return bg;
  }

  private pushPopup(popup: FeedbackPopup): void {
    const existingIndex = this.popups.findIndex(
      (entry) => entry.id === popup.id && entry.kind === popup.kind
    );
    if (existingIndex >= 0) {
      this.popups[existingIndex] = popup;
      return;
    }
    this.popups.push(popup);
  }

  private resolveGuidanceColor(tone: GuidanceBubbleTone): number {
    if (tone === "positive") {
      return 0xb8ffcf;
    }
    if (tone === "warning") {
      return 0xffe4b3;
    }
    return 0xd7eaff;
  }
}
