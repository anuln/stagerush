import { Artist } from "../entities/Artist";
import type { Vector2 } from "../utils/MathUtils";

export interface FinalizedPathSession {
  artistId: string;
  rawPoints: Vector2[];
  startedAtMs: number;
  endedAtMs: number;
}

export interface ActivePathSession {
  artistId: string;
  rawPoints: Vector2[];
  startedAtMs: number;
}

export class PathDrawingInput {
  private readonly getArtists: () => Artist[];
  private readonly grabRadiusPx: number;
  private readonly getNowMs: () => number;
  private activeSession: ActivePathSession | null = null;

  constructor(
    getArtists: () => Artist[],
    grabRadiusPx = 40,
    getNowMs: () => number = () =>
      typeof performance !== "undefined" ? performance.now() : Date.now()
  ) {
    this.getArtists = getArtists;
    this.grabRadiusPx = grabRadiusPx;
    this.getNowMs = getNowMs;
  }

  pointerDown(x: number, y: number, nowMs: number): boolean {
    if (this.activeSession) {
      return false;
    }

    const candidate = this.findNearestEligibleArtist({ x, y });
    if (!candidate) {
      return false;
    }

    const rawPoints: Vector2[] = [
      { x: candidate.position.x, y: candidate.position.y }
    ];

    this.activeSession = {
      artistId: candidate.id,
      rawPoints,
      startedAtMs: nowMs
    };
    return true;
  }

  pointerMove(x: number, y: number): boolean {
    if (!this.activeSession) {
      return false;
    }

    const last = this.activeSession.rawPoints[this.activeSession.rawPoints.length - 1];
    if (last.x === x && last.y === y) {
      return false;
    }

    this.activeSession.rawPoints.push({ x, y });
    return true;
  }

  pointerUp(x: number, y: number, nowMs: number): FinalizedPathSession | null {
    if (!this.activeSession) {
      return null;
    }

    this.pointerMove(x, y);

    const completed: FinalizedPathSession = {
      artistId: this.activeSession.artistId,
      rawPoints: [...this.activeSession.rawPoints],
      startedAtMs: this.activeSession.startedAtMs,
      endedAtMs: nowMs
    };
    this.activeSession = null;
    return completed;
  }

  pointerCancel(nowMs: number = this.getNowMs()): FinalizedPathSession | null {
    if (!this.activeSession) {
      return null;
    }
    const cancelled = this.activeSession;
    this.activeSession = null;
    return {
      artistId: cancelled.artistId,
      rawPoints: [...cancelled.rawPoints],
      startedAtMs: cancelled.startedAtMs,
      endedAtMs: nowMs
    };
  }

  getActiveSession(): ActivePathSession | null {
    if (!this.activeSession) {
      return null;
    }
    return {
      artistId: this.activeSession.artistId,
      rawPoints: [...this.activeSession.rawPoints],
      startedAtMs: this.activeSession.startedAtMs
    };
  }

  private findNearestEligibleArtist(position: Vector2): Artist | null {
    let nearest: Artist | null = null;
    let nearestDistanceSq = Number.POSITIVE_INFINITY;
    const maxDistanceSq = this.grabRadiusPx * this.grabRadiusPx;

    for (const artist of this.getArtists()) {
      if (!artist.isActive()) {
        continue;
      }

      const dx = artist.position.x - position.x;
      const dy = artist.position.y - position.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > maxDistanceSq || distanceSq >= nearestDistanceSq) {
        continue;
      }
      nearest = artist;
      nearestDistanceSq = distanceSq;
    }

    return nearest;
  }
}
