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
