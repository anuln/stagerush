import type { ArtistTier } from "../config/FestivalConfig";
import type { Vector2 } from "../utils/MathUtils";

export type ArtistState =
  | "SPAWNING"
  | "DRIFTING"
  | "FOLLOWING"
  | "CHATTING"
  | "DISTRACTED"
  | "ARRIVING"
  | "PERFORMING"
  | "COMPLETED"
  | "MISSED";

export type ArtistMissReason = "timeout" | "bounds" | "manual";

export interface ArtistBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ArtistConfig {
  id: string;
  tier: ArtistTier;
  position: Vector2;
  velocity: Vector2;
  timerSeconds: number;
  state?: ArtistState;
}
