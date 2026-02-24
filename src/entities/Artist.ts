import type { ArtistTier } from "../config/FestivalConfig";
import { addScaledVector, clamp, type Vector2 } from "../utils/MathUtils";
import type {
  ArtistBounds,
  ArtistConfig,
  ArtistMissReason,
  ArtistState
} from "./ArtistState";

const ACTIVE_STATES: Set<ArtistState> = new Set([
  "SPAWNING",
  "DRIFTING",
  "FOLLOWING",
  "CHATTING",
  "DISTRACTED",
  "ARRIVING"
]);

export class Artist {
  readonly id: string;
  readonly tier: ArtistTier;
  position: Vector2;
  velocity: Vector2;
  state: ArtistState;
  readonly initialTimerSeconds: number;
  timerRemainingSeconds: number;
  missReason: ArtistMissReason | null;

  constructor(config: ArtistConfig) {
    this.id = config.id;
    this.tier = config.tier;
    this.position = { ...config.position };
    this.velocity = { ...config.velocity };
    this.state = config.state ?? "DRIFTING";
    this.initialTimerSeconds = config.timerSeconds;
    this.timerRemainingSeconds = config.timerSeconds;
    this.missReason = null;
  }

  isActive(): boolean {
    return ACTIVE_STATES.has(this.state);
  }

  updateDrift(deltaSeconds: number): void {
    if (!this.isActive()) {
      return;
    }
    this.position = addScaledVector(this.position, this.velocity, deltaSeconds);
  }

  tickTimer(deltaSeconds: number): boolean {
    if (!this.isActive()) {
      return false;
    }

    this.timerRemainingSeconds = clamp(
      this.timerRemainingSeconds - deltaSeconds,
      0,
      Number.POSITIVE_INFINITY
    );

    if (this.timerRemainingSeconds === 0) {
      this.markMissed("timeout");
      return true;
    }

    return false;
  }

  checkBoundsAndMarkMissed(bounds: ArtistBounds): boolean {
    if (!this.isActive()) {
      return false;
    }

    const isOutOfBounds =
      this.position.x < bounds.minX ||
      this.position.y < bounds.minY ||
      this.position.x > bounds.maxX ||
      this.position.y > bounds.maxY;

    if (isOutOfBounds) {
      this.markMissed("bounds");
      return true;
    }

    return false;
  }

  markMissed(reason: ArtistMissReason): void {
    if (this.state === "MISSED" || this.state === "COMPLETED") {
      return;
    }
    this.state = "MISSED";
    this.missReason = reason;
  }

  markCompleted(): void {
    this.state = "COMPLETED";
  }
}
