import type { StageSize } from "./FestivalConfig";

export interface ViewportSize {
  width: number;
  height: number;
}

export const GAME_CONFIG = {
  stage: {
    sizeFactors: {
      large: 0.2,
      medium: 0.15,
      small: 0.11
    } as Record<StageSize, number>,
    aspectRatio: 4 / 3,
    performanceDurationMs: 2500
  },
  path: {
    grabRadiusPx: 40,
    snapRadiusPx: 60,
    smoothingSteps: 8,
    resampleSpacingPx: 10,
    invalidFadeDurationMs: 500
  },
  hazards: {
    collisionRadiusPx: 40,
    chatDurationMs: 3000
  },
  debug: {
    showSpawnPoints: true
  }
} as const;

export function getStagePixelSize(
  size: StageSize,
  viewport: ViewportSize
): { width: number; height: number } {
  const factor = GAME_CONFIG.stage.sizeFactors[size];
  const base = Math.min(viewport.width, viewport.height);
  const width = Math.round(base * factor);
  const height = Math.round(width / GAME_CONFIG.stage.aspectRatio);
  return { width, height };
}
