import { Artist } from "../entities/Artist";
import type { ArtistState } from "../entities/ArtistState";
import type {
  DistractionDelaySession
} from "../entities/HazardState";
import type { ResolvedDistraction } from "../maps/MapLoader";

interface DistractionEvent {
  artistId: string;
  distractionId: string;
}

export interface DistractionUpdateResult {
  started: DistractionEvent[];
  resolved: DistractionEvent[];
}

function isDistractionEligibleState(state: ArtistState): boolean {
  return state === "DRIFTING" || state === "FOLLOWING";
}

export class DistractionSystem {
  private distractions: ResolvedDistraction[];
  private activeDistractionIds: Set<string>;
  private readonly sessions = new Map<string, DistractionDelaySession>();
  private readonly cooldownMs: number;
  private readonly artistCooldownUntilMs = new Map<string, number>();

  constructor(
    distractions: ResolvedDistraction[],
    activeDistractionIds: string[] = [],
    cooldownMs = 0
  ) {
    this.distractions = distractions;
    this.activeDistractionIds = new Set(activeDistractionIds);
    this.cooldownMs = Math.max(0, cooldownMs);
  }

  setDistractions(distractions: ResolvedDistraction[]): void {
    this.distractions = distractions;
  }

  setActiveDistractionIds(activeIds: string[]): void {
    this.activeDistractionIds = new Set(activeIds);
  }

  getActiveDistractions(): ResolvedDistraction[] {
    return this.distractions.filter((entry) => this.activeDistractionIds.has(entry.id));
  }

  update(artists: Artist[], nowMs: number): DistractionUpdateResult {
    const artistMap = new Map<string, Artist>(artists.map((artist) => [artist.id, artist]));
    const started: DistractionEvent[] = [];
    const resolved: DistractionEvent[] = [];
    const justResolvedArtists = new Set<string>();

    for (const [artistId, session] of this.sessions) {
      const artist = artistMap.get(artistId);
      const shouldResolve =
        nowMs >= session.endsAtMs || !artist || !artist.isActive();
      if (!shouldResolve) {
        continue;
      }

      if (artist && artist.state === "DISTRACTED" && artist.isActive()) {
        artist.state = session.priorArtistState;
      }

      this.sessions.delete(artistId);
      this.artistCooldownUntilMs.set(artistId, nowMs + this.cooldownMs);
      justResolvedArtists.add(artistId);
      resolved.push({
        artistId,
        distractionId: session.distractionId
      });
    }

    const activeDistractions = this.getActiveDistractions();
    if (activeDistractions.length === 0) {
      return { started, resolved };
    }

    for (const artist of artists) {
      if (
        !artist.isActive() ||
        this.sessions.has(artist.id) ||
        justResolvedArtists.has(artist.id) ||
        this.isInCooldown(artist.id, nowMs) ||
        !isDistractionEligibleState(artist.state)
      ) {
        continue;
      }

      const distraction = findTriggeredDistraction(artist, activeDistractions);
      if (!distraction) {
        continue;
      }

      this.sessions.set(artist.id, {
        artistId: artist.id,
        distractionId: distraction.id,
        priorArtistState: artist.state,
        endsAtMs: nowMs + distraction.delay * 1000
      });

      artist.state = "DISTRACTED";
      artist.velocity = { x: 0, y: 0 };
      artist.position = { ...distraction.screenPosition };
      started.push({
        artistId: artist.id,
        distractionId: distraction.id
      });
    }

    return { started, resolved };
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
}

function findTriggeredDistraction(
  artist: Artist,
  distractions: ResolvedDistraction[]
): ResolvedDistraction | null {
  let nearest: ResolvedDistraction | null = null;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;

  for (const distraction of distractions) {
    const dx = artist.position.x - distraction.screenPosition.x;
    const dy = artist.position.y - distraction.screenPosition.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq > distraction.pixelRadius * distraction.pixelRadius) {
      continue;
    }
    if (distanceSq >= nearestDistanceSq) {
      continue;
    }
    nearest = distraction;
    nearestDistanceSq = distanceSq;
  }

  return nearest;
}
