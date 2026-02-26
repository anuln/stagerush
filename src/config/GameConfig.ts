import type { StageSize } from "./FestivalConfig";

export interface ViewportSize {
  width: number;
  height: number;
}

export type QualityTier = "high" | "medium" | "low";

interface QualityPreset {
  resolutionScale: number;
  effectsDensity: number;
}

export interface QualityRollInput {
  currentTier: QualityTier;
  averageFps: number;
  lowWindowCount: number;
  highWindowCount: number;
}

export const GAME_CONFIG = {
  stage: {
    sizeFactors: {
      large: 0.288,
      medium: 0.216,
      small: 0.162
    } as Record<StageSize, number>,
    aspectRatio: 4 / 3,
    performanceDurationMs: 2500
  },
  artist: {
    renderScale: 1.42,
    shadowAlpha: 0.34,
    shadowOffsetY: 14,
    timerBarHeightPx: 4,
    timerBarPaddingY: 8,
    performBouncePx: 2.8,
    performBounceHz: 2.3
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
    chatDurationMs: 2000,
    chatDurationIncrementMs: 150,
    chatDurationMaxMs: 3200,
    maxEncounterStrikes: 12,
    immunityCooldownMs: 1200
  },
  round: {
    levelDurationSeconds: 60,
    performanceTiers: {
      gold: {
        minScore: 1800,
        minDeliveries: 12
      },
      silver: {
        minScore: 900,
        minDeliveries: 7
      }
    }
  },
  performance: {
    qualityPresets: {
      high: { resolutionScale: 1, effectsDensity: 1 },
      medium: { resolutionScale: 0.86, effectsDensity: 0.72 },
      low: { resolutionScale: 0.72, effectsDensity: 0.5 }
    } as Record<QualityTier, QualityPreset>,
    scaler: {
      degradeBelowFps: 48,
      recoverAboveFps: 57,
      sustainedWindows: 6,
      windowSizeFrames: 20
    }
  },
  debug: {
    showSpawnPoints: false
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

export function getQualityPreset(tier: QualityTier): QualityPreset {
  return GAME_CONFIG.performance.qualityPresets[tier];
}

const TIER_ORDER: QualityTier[] = ["low", "medium", "high"];

export function rollQualityTier(input: QualityRollInput): QualityTier {
  const scaler = GAME_CONFIG.performance.scaler;
  const tierIndex = TIER_ORDER.indexOf(input.currentTier);

  if (
    input.averageFps < scaler.degradeBelowFps &&
    input.lowWindowCount >= scaler.sustainedWindows
  ) {
    return TIER_ORDER[Math.max(0, tierIndex - 1)];
  }

  if (
    input.averageFps > scaler.recoverAboveFps &&
    input.highWindowCount >= scaler.sustainedWindows
  ) {
    return TIER_ORDER[Math.min(TIER_ORDER.length - 1, tierIndex + 1)];
  }

  return input.currentTier;
}
