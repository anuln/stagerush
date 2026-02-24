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

  constructor(layer: Container) {
    this.layer = layer;
  }

  render(paths: PathState[], inProgress: InProgressPathPreview | null): void {
    this.layer.removeChildren();

    for (const path of paths) {
      const color = path.targetStageId ? parseColor(path.stageColor, 0xeeeeee) : 0x8b8b8b;
      this.layer.addChild(this.createLine(path.smoothedPoints, color, path.alpha, 4));
    }

    if (inProgress) {
      this.layer.addChild(this.createLine(inProgress.points, parseColor(inProgress.color, 0xffffff), 0.95, 3));
    }
  }

  private createLine(
    points: Array<{ x: number; y: number }>,
    color: number,
    alpha: number,
    width: number
  ): Graphics {
    const line = new Graphics();
    if (points.length <= 1) {
      return line;
    }
    line.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      line.lineTo(points[i].x, points[i].y);
    }
    line.stroke({ color, width, alpha, cap: "round", join: "round" });
    return line;
  }
}
