import { Container, Graphics } from "pixi.js";
import type { InProgressPathPreview, PathState } from "../entities/PathState";
import { clamp } from "../utils/MathUtils";

function parseColor(hex: string, fallback = 0x8b8b8b): number {
  const normalized = hex.replace("#", "");
  const parsed = Number.parseInt(normalized, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function advancePathLifecycles(
  paths: PathState[],
  nowMs: number,
  invalidFadeDurationMs: number
): PathState[] {
  const next: PathState[] = [];

  for (const path of paths) {
    if (path.state !== "INVALID_FADING") {
      next.push({
        ...path,
        alpha: 1
      });
      continue;
    }

    const expiresAtMs = path.expiresAtMs ?? path.createdAtMs + invalidFadeDurationMs;
    if (nowMs >= expiresAtMs) {
      continue;
    }

    const startedFadeAtMs = expiresAtMs - invalidFadeDurationMs;
    const progress = invalidFadeDurationMs > 0
      ? (nowMs - startedFadeAtMs) / invalidFadeDurationMs
      : 1;
    next.push({
      ...path,
      expiresAtMs,
      alpha: clamp(1 - progress, 0, 1)
    });
  }

  return next;
}

export class PathRenderer {
  private readonly layer: Container;
  private readonly pathGraphics = new Map<string, Graphics>();
  private readonly previewGraphic = new Graphics();

  constructor(layer: Container) {
    this.layer = layer;
    this.layer.addChild(this.previewGraphic);
  }

  render(paths: PathState[], inProgress: InProgressPathPreview | null): void {
    const seen = new Set<string>();

    for (const path of paths) {
      seen.add(path.id);
      const color = path.targetStageId ? parseColor(path.stageColor, 0xeeeeee) : 0x8b8b8b;
      const line = this.getOrCreatePathGraphic(path.id);
      this.drawLine(line, path.smoothedPoints, color, path.alpha, 4);
    }

    for (const [id, graphic] of this.pathGraphics) {
      if (seen.has(id)) {
        continue;
      }
      graphic.removeFromParent();
      graphic.destroy();
      this.pathGraphics.delete(id);
    }

    if (inProgress) {
      this.previewGraphic.visible = true;
      this.drawLine(
        this.previewGraphic,
        inProgress.points,
        parseColor(inProgress.color, 0xffffff),
        0.95,
        3
      );
      this.layer.addChild(this.previewGraphic);
      return;
    }
    this.previewGraphic.visible = false;
    this.previewGraphic.clear();
  }

  private drawLine(
    line: Graphics,
    points: Array<{ x: number; y: number }>,
    color: number,
    alpha: number,
    width: number
  ): void {
    line.clear();
    if (points.length <= 1) {
      return;
    }
    line.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      line.lineTo(points[i].x, points[i].y);
    }
    line.stroke({ color, width, alpha, cap: "round", join: "round" });
  }

  private getOrCreatePathGraphic(pathId: string): Graphics {
    const existing = this.pathGraphics.get(pathId);
    if (existing) {
      return existing;
    }
    const graphic = new Graphics();
    this.layer.addChild(graphic);
    this.pathGraphics.set(pathId, graphic);
    return graphic;
  }
}
