import type { ArtistTier, StageSize } from "../config/FestivalConfig";
import type { Vector2 } from "../utils/MathUtils";

export interface StageQueueEntry {
  artistId: string;
  enqueuedAtMs: number;
}

export interface StageRuntimeSnapshot {
  id: string;
  size: StageSize;
  color: string;
  position: Vector2;
  isOccupied: boolean;
  currentArtistId: string | null;
  queueLength: number;
}

export interface StageDeliveryCompletionEvent {
  stageId: string;
  stageSize: StageSize;
  stageColor: string;
  stagePosition: Vector2;
  artistId: string;
  artistTier: ArtistTier;
  completedAtMs: number;
}
