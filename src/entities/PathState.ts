import type { Vector2 } from "../utils/MathUtils";

export type PathLifecycleState = "ACTIVE" | "INVALID_FADING";

export interface PathState {
  id: string;
  artistId: string;
  rawPoints: Vector2[];
  smoothedPoints: Vector2[];
  length: number;
  targetStageId: string | null;
  stageColor: string;
  state: PathLifecycleState;
  consumedLength: number;
  alpha: number;
  createdAtMs: number;
  expiresAtMs: number | null;
}

export interface InProgressPathPreview {
  artistId: string;
  points: Vector2[];
  color: string;
}
