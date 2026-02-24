import type { StageSize } from "../config/FestivalConfig";
import { Artist } from "./Artist";
import type {
  StageDeliveryCompletionEvent,
  StageRuntimeSnapshot
} from "./StageState";

interface StageConfig {
  id: string;
  size: StageSize;
  color: string;
  position: { x: number; y: number };
  performanceDurationMs: number;
}

export class Stage {
  readonly id: string;
  readonly size: StageSize;
  readonly color: string;
  readonly position: { x: number; y: number };

  private readonly performanceDurationMs: number;
  private currentArtist: Artist | null = null;
  private occupiedUntilMs: number | null = null;
  private readonly queue: Artist[] = [];

  constructor(config: StageConfig) {
    this.id = config.id;
    this.size = config.size;
    this.color = config.color;
    this.position = { ...config.position };
    this.performanceDurationMs = config.performanceDurationMs;
  }

  handleArrival(artist: Artist, nowMs: number): void {
    if (!artist.isActive()) {
      return;
    }
    if (this.currentArtist?.id === artist.id) {
      return;
    }
    if (this.queue.some((entry) => entry.id === artist.id)) {
      return;
    }

    artist.position = { ...this.position };
    artist.velocity = { x: 0, y: 0 };

    if (!this.currentArtist) {
      this.startPerformance(artist, nowMs);
      return;
    }

    artist.state = "ARRIVING";
    this.queue.push(artist);
  }

  update(nowMs: number): StageDeliveryCompletionEvent[] {
    const completed: StageDeliveryCompletionEvent[] = [];
    while (
      this.currentArtist &&
      this.occupiedUntilMs !== null &&
      nowMs >= this.occupiedUntilMs
    ) {
      const finishedArtist = this.currentArtist;
      const finishedAtMs = this.occupiedUntilMs;
      finishedArtist.markCompleted();
      completed.push({
        stageId: this.id,
        stageSize: this.size,
        stageColor: this.color,
        stagePosition: { ...this.position },
        artistId: finishedArtist.id,
        artistTier: finishedArtist.tier,
        completedAtMs: finishedAtMs
      });

      this.currentArtist = null;
      this.occupiedUntilMs = null;

      const next = this.dequeueNextPerformer();
      if (!next) {
        break;
      }
      this.startPerformance(next, finishedAtMs);
    }

    return completed;
  }

  snapshot(): StageRuntimeSnapshot {
    return {
      id: this.id,
      size: this.size,
      color: this.color,
      position: { ...this.position },
      isOccupied: this.currentArtist !== null,
      currentArtistId: this.currentArtist?.id ?? null,
      queueLength: this.queue.length
    };
  }

  private startPerformance(artist: Artist, nowMs: number): void {
    artist.state = "PERFORMING";
    artist.position = { ...this.position };
    artist.velocity = { x: 0, y: 0 };
    this.currentArtist = artist;
    this.occupiedUntilMs = nowMs + this.performanceDurationMs;
  }

  private dequeueNextPerformer(): Artist | null {
    while (this.queue.length > 0) {
      const next = this.queue.shift() ?? null;
      if (!next) {
        continue;
      }
      if (!next.isActive()) {
        continue;
      }
      return next;
    }
    return null;
  }
}
