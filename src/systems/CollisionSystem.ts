import { Artist } from "../entities/Artist";
import type { ArtistState } from "../entities/ArtistState";
import type { CollisionSession, CollisionSnapshot } from "../entities/HazardState";

interface CollisionEvent {
  sessionId: string;
  artistAId: string;
  artistBId: string;
}

export interface CollisionUpdateResult {
  started: CollisionEvent[];
  resolved: CollisionEvent[];
  activeChats: CollisionSnapshot[];
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function isCollisionEligibleState(state: ArtistState): boolean {
  return state === "DRIFTING" || state === "FOLLOWING";
}

export class CollisionSystem {
  private readonly collisionRadiusPx: number;
  private readonly chatDurationMs: number;
  private readonly immunityCooldownMs: number;
  private readonly sessions = new Map<string, CollisionSession>();
  private readonly artistToSession = new Map<string, string>();
  private readonly artistCooldownUntilMs = new Map<string, number>();

  constructor(
    collisionRadiusPx = 40,
    chatDurationMs = 3000,
    immunityCooldownMs = 0
  ) {
    this.collisionRadiusPx = collisionRadiusPx;
    this.chatDurationMs = chatDurationMs;
    this.immunityCooldownMs = Math.max(0, immunityCooldownMs);
  }

  update(artists: Artist[], nowMs: number): CollisionUpdateResult {
    const artistMap = new Map<string, Artist>(artists.map((artist) => [artist.id, artist]));
    const started: CollisionEvent[] = [];
    const resolved: CollisionEvent[] = [];
    const justResolvedArtists = new Set<string>();

    for (const [sessionId, session] of this.sessions) {
      const artistA = artistMap.get(session.artistAId);
      const artistB = artistMap.get(session.artistBId);
      const shouldResolve =
        nowMs >= session.endsAtMs ||
        !artistA ||
        !artistB ||
        !artistA.isActive() ||
        !artistB.isActive();

      if (!shouldResolve) {
        continue;
      }

      if (artistA && artistA.state === "CHATTING" && artistA.isActive()) {
        artistA.state = session.priorArtistAState;
      }
      if (artistB && artistB.state === "CHATTING" && artistB.isActive()) {
        artistB.state = session.priorArtistBState;
      }

      this.sessions.delete(sessionId);
      this.artistToSession.delete(session.artistAId);
      this.artistToSession.delete(session.artistBId);
      const cooldownUntil = nowMs + this.immunityCooldownMs;
      this.artistCooldownUntilMs.set(session.artistAId, cooldownUntil);
      this.artistCooldownUntilMs.set(session.artistBId, cooldownUntil);
      justResolvedArtists.add(session.artistAId);
      justResolvedArtists.add(session.artistBId);
      resolved.push({
        sessionId,
        artistAId: session.artistAId,
        artistBId: session.artistBId
      });
    }

    for (let i = 0; i < artists.length; i += 1) {
      const artistA = artists[i];
      if (
        !artistA.isActive() ||
        this.artistToSession.has(artistA.id) ||
        justResolvedArtists.has(artistA.id) ||
        this.isInCooldown(artistA.id, nowMs) ||
        !isCollisionEligibleState(artistA.state)
      ) {
        continue;
      }

      for (let j = i + 1; j < artists.length; j += 1) {
        const artistB = artists[j];
        if (
          !artistB.isActive() ||
          this.artistToSession.has(artistB.id) ||
          justResolvedArtists.has(artistB.id) ||
          this.isInCooldown(artistB.id, nowMs) ||
          !isCollisionEligibleState(artistB.state)
        ) {
          continue;
        }

        const dx = artistA.position.x - artistB.position.x;
        const dy = artistA.position.y - artistB.position.y;
        if (dx * dx + dy * dy > this.collisionRadiusPx * this.collisionRadiusPx) {
          continue;
        }

        const sessionId = pairKey(artistA.id, artistB.id);
        if (this.sessions.has(sessionId)) {
          continue;
        }

        this.sessions.set(sessionId, {
          id: sessionId,
          artistAId: artistA.id,
          artistBId: artistB.id,
          priorArtistAState: artistA.state,
          priorArtistBState: artistB.state,
          endsAtMs: nowMs + this.chatDurationMs
        });
        this.artistToSession.set(artistA.id, sessionId);
        this.artistToSession.set(artistB.id, sessionId);

        artistA.state = "CHATTING";
        artistB.state = "CHATTING";
        artistA.velocity = { x: 0, y: 0 };
        artistB.velocity = { x: 0, y: 0 };

        started.push({
          sessionId,
          artistAId: artistA.id,
          artistBId: artistB.id
        });
        break;
      }
    }

    return {
      started,
      resolved,
      activeChats: this.getActiveChats(artistMap, nowMs)
    };
  }

  private isInCooldown(artistId: string, nowMs: number): boolean {
    const cooldownUntil = this.artistCooldownUntilMs.get(artistId);
    if (cooldownUntil === undefined) {
      return false;
    }
    if (cooldownUntil > nowMs) {
      return true;
    }
    this.artistCooldownUntilMs.delete(artistId);
    return false;
  }

  private getActiveChats(
    artists: Map<string, Artist>,
    nowMs: number
  ): CollisionSnapshot[] {
    const snapshots: CollisionSnapshot[] = [];
    for (const session of this.sessions.values()) {
      const artistA = artists.get(session.artistAId);
      const artistB = artists.get(session.artistBId);
      if (!artistA || !artistB) {
        continue;
      }
      snapshots.push({
        id: session.id,
        artistAId: session.artistAId,
        artistBId: session.artistBId,
        artistA: { ...artistA.position },
        artistB: { ...artistB.position },
        remainingMs: Math.max(0, session.endsAtMs - nowMs)
      });
    }
    return snapshots;
  }
}
