import { Container, Graphics, Text } from "pixi.js";
import { COMBO_WINDOW_MS } from "../config/ScoreConfig";
import type { StageRuntimeSnapshot } from "../entities/StageState";
import type { ComboDeliveryResult } from "../game/ComboTracker";
import { clamp } from "../utils/MathUtils";

interface ComboFeedbackFrame {
  nowMs: number;
  stageSnapshots: StageRuntimeSnapshot[];
  activeCombos: ComboDeliveryResult[];
}

export interface ComboBadgeModel {
  stageId: string;
  label: string;
  position: { x: number; y: number };
  color: number;
  alpha: number;
  scale: number;
}

function parseColor(hex: string, fallback = 0xffffff): number {
  const normalized = hex.replace("#", "");
  const parsed = Number.parseInt(normalized, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildComboBadgeModels(
  frame: ComboFeedbackFrame
): ComboBadgeModel[] {
  const stages = new Map(
    frame.stageSnapshots.map((stage) => [stage.id, stage] as const)
  );
  const models: ComboBadgeModel[] = [];

  for (const combo of frame.activeCombos) {
    const stage = stages.get(combo.stageId);
    if (!stage || combo.chainLength < 2 || frame.nowMs > combo.expiresAtMs) {
      continue;
    }

    const remainingRatio = clamp(
      (combo.expiresAtMs - frame.nowMs) / COMBO_WINDOW_MS,
      0,
      1
    );
    models.push({
      stageId: stage.id,
      label: `${combo.multiplier.toFixed(1)}x`,
      position: { x: stage.position.x, y: stage.position.y - 50 },
      color: parseColor(stage.color, 0xf4f4f6),
      alpha: 0.4 + remainingRatio * 0.6,
      scale: 1 + Math.max(0, combo.chainLength - 2) * 0.12
    });
  }

  return models;
}

export class ComboFeedbackRenderer {
  private readonly layer: Container;

  constructor(layer: Container) {
    this.layer = layer;
  }

  render(frame: ComboFeedbackFrame): void {
    this.layer.removeChildren();
    const badges = buildComboBadgeModels(frame);

    for (const badge of badges) {
      const width = 58 * badge.scale;
      const height = 26 * badge.scale;
      const shadow = new Graphics();
      shadow.roundRect(
        badge.position.x - width / 2,
        badge.position.y - height / 2 + 3,
        width,
        height,
        12
      );
      shadow.fill({ color: 0x050506, alpha: 0.25 * badge.alpha });
      this.layer.addChild(shadow);

      const bg = new Graphics();
      bg.roundRect(
        badge.position.x - width / 2,
        badge.position.y - height / 2,
        width,
        height,
        12
      );
      bg.fill({ color: badge.color, alpha: 0.3 * badge.alpha });
      bg.stroke({ color: 0xffffff, width: 2, alpha: badge.alpha });
      this.layer.addChild(bg);

      const text = new Text({
        text: badge.label,
        style: {
          fontFamily: "Avenir Next, Helvetica, Arial, sans-serif",
          fontSize: 15 + Math.round((badge.scale - 1) * 6),
          fill: 0xffffff,
          stroke: {
            color: 0x111111,
            width: 2
          }
        }
      });
      text.anchor.set(0.5);
      text.position.set(badge.position.x, badge.position.y + 1);
      text.alpha = badge.alpha;
      this.layer.addChild(text);
    }
  }
}
