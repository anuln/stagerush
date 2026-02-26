import type { ArtistTier, StageSize } from "./FestivalConfig";

export const SCORE_MATRIX: Record<ArtistTier, Record<StageSize, number>> = {
  headliner: {
    large: 300,
    medium: 200,
    small: 100
  },
  midtier: {
    large: 100,
    medium: 300,
    small: 200
  },
  newcomer: {
    large: 50,
    medium: 100,
    small: 300
  }
};

export const COMBO_WINDOW_MS = 5000;
export const COMBO_MULTIPLIERS = [1, 1.5, 2, 3] as const;
export const MISS_PENALTIES = {
  timeout: 60,
  bounds: 90,
  manual: 0
} as const;

// Deliveries on the wrong stage are penalized but still score to preserve route triage gameplay.
export const WRONG_STAGE_DELIVERY_MULTIPLIER = 0.7;

export function getComboMultiplier(chainLength: number): number {
  if (chainLength <= 1) {
    return COMBO_MULTIPLIERS[0];
  }

  const cappedIndex = Math.min(chainLength - 1, COMBO_MULTIPLIERS.length - 1);
  return COMBO_MULTIPLIERS[cappedIndex];
}
