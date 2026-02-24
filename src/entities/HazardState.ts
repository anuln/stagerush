import type { ArtistState } from "./ArtistState";

export type HazardBlockReason = "CHATTING" | "DISTRACTED";

export interface CollisionSession {
  id: string;
  artistAId: string;
  artistBId: string;
  priorArtistAState: ArtistState;
  priorArtistBState: ArtistState;
  endsAtMs: number;
}

export interface CollisionSnapshot {
  id: string;
  artistAId: string;
  artistBId: string;
  artistA: { x: number; y: number };
  artistB: { x: number; y: number };
  remainingMs: number;
}

export interface DistractionDelaySession {
  artistId: string;
  distractionId: string;
  priorArtistState: ArtistState;
  endsAtMs: number;
}

export interface HazardBlockedArtistSnapshot {
  artistId: string;
  position: { x: number; y: number };
  reason: HazardBlockReason;
}
