import { Artist } from "../entities/Artist";
import type { PlannedPath } from "../game/PathPlanner";
import type { Vector2 } from "../utils/MathUtils";
import { pathLength } from "../utils/Spline";

interface PathAssignment {
  pathId: string;
  targetStageId: string | null;
  points: Vector2[];
  segmentIndex: number;
  segmentProgress: number;
  consumedLength: number;
  totalLength: number;
  completionVelocity: Vector2;
}

export type PathBlockReason = "chat" | "distraction";

export interface PathFollowUpdate {
  artistId: string;
  pathId: string;
  consumedLength: number;
  totalLength: number;
  completed: boolean;
  targetStageId: string | null;
}

export class PathFollower {
  readonly speedPxPerSecond: number;
  private readonly assignments = new Map<string, PathAssignment>();
  private readonly pendingPaths = new Map<string, PlannedPath>();
  private readonly blockReasons = new Map<string, Set<PathBlockReason>>();

  constructor(speedPxPerSecond: number) {
    this.speedPxPerSecond = speedPxPerSecond;
  }

  assignPath(
    artist: Artist,
    plannedPath: PlannedPath
  ): "assigned" | "queued" | "ignored" {
    if (plannedPath.smoothedPoints.length < 2) {
      return "ignored";
    }

    if (this.isArtistBlocked(artist.id)) {
      this.pendingPaths.set(artist.id, plannedPath);
      return "queued";
    }

    this.applyAssignment(artist, plannedPath);
    return "assigned";
  }

  blockArtist(artistId: string, reason: PathBlockReason): void {
    const reasons = this.blockReasons.get(artistId) ?? new Set<PathBlockReason>();
    reasons.add(reason);
    this.blockReasons.set(artistId, reasons);
  }

  unblockArtist(artist: Artist, reason: PathBlockReason): void {
    const reasons = this.blockReasons.get(artist.id);
    if (!reasons) {
      return;
    }
    reasons.delete(reason);
    if (reasons.size > 0) {
      this.blockReasons.set(artist.id, reasons);
      return;
    }
    this.blockReasons.delete(artist.id);

    const pending = this.pendingPaths.get(artist.id);
    if (!pending) {
      return;
    }
    this.pendingPaths.delete(artist.id);
    this.applyAssignment(artist, pending);
  }

  isArtistBlocked(artistId: string): boolean {
    return (this.blockReasons.get(artistId)?.size ?? 0) > 0;
  }

  clearArtist(artistId: string): void {
    this.assignments.delete(artistId);
    this.pendingPaths.delete(artistId);
    this.blockReasons.delete(artistId);
  }

  private applyAssignment(artist: Artist, plannedPath: PlannedPath): void {
    const artistSpeed = this.resolveArtistSpeed(artist);
    const points = [
      { x: artist.position.x, y: artist.position.y },
      ...plannedPath.smoothedPoints.slice(1).map((point) => ({ ...point }))
    ];
    const completionVelocity = resolveCompletionVelocity(
      points,
      artistSpeed,
      artist.velocity
    );

    this.assignments.set(artist.id, {
      pathId: plannedPath.pathId,
      targetStageId: plannedPath.targetStageId,
      points,
      segmentIndex: 0,
      segmentProgress: 0,
      consumedLength: 0,
      totalLength: pathLength(points),
      completionVelocity
    });
    artist.state = "FOLLOWING";
    artist.velocity = { x: 0, y: 0 };
  }

  update(artists: Artist[], deltaSeconds: number): PathFollowUpdate[] {
    const updates: PathFollowUpdate[] = [];

    for (const artist of artists) {
      const assignment = this.assignments.get(artist.id);
      if (!assignment) {
        continue;
      }
      if (!artist.isActive()) {
        this.clearArtist(artist.id);
        continue;
      }
      if (this.isArtistBlocked(artist.id)) {
        updates.push({
          artistId: artist.id,
          pathId: assignment.pathId,
          consumedLength: Math.min(assignment.consumedLength, assignment.totalLength),
          totalLength: assignment.totalLength,
          completed: false,
          targetStageId: assignment.targetStageId
        });
        continue;
      }

      const artistSpeed = this.resolveArtistSpeed(artist);
      let remainingDistance = Math.max(0, artistSpeed * deltaSeconds);
      while (
        remainingDistance > 0 &&
        assignment.segmentIndex < assignment.points.length - 1
      ) {
        const from = assignment.points[assignment.segmentIndex];
        const to = assignment.points[assignment.segmentIndex + 1];
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const segmentLength = Math.hypot(dx, dy);

        if (segmentLength === 0) {
          assignment.segmentIndex += 1;
          assignment.segmentProgress = 0;
          artist.position = { ...to };
          continue;
        }

        const distanceToSegmentEnd = segmentLength - assignment.segmentProgress;
        const step = Math.min(distanceToSegmentEnd, remainingDistance);
        assignment.segmentProgress += step;
        assignment.consumedLength += step;
        remainingDistance -= step;

        const t = assignment.segmentProgress / segmentLength;
        artist.position = {
          x: from.x + dx * t,
          y: from.y + dy * t
        };

        if (assignment.segmentProgress >= segmentLength) {
          assignment.segmentIndex += 1;
          assignment.segmentProgress = 0;
          artist.position = { ...to };
        }
      }

      const completed = assignment.segmentIndex >= assignment.points.length - 1;
      updates.push({
        artistId: artist.id,
        pathId: assignment.pathId,
        consumedLength: Math.min(assignment.consumedLength, assignment.totalLength),
        totalLength: assignment.totalLength,
        completed,
        targetStageId: assignment.targetStageId
      });

      if (completed) {
        this.assignments.delete(artist.id);
        this.pendingPaths.delete(artist.id);
        if (assignment.targetStageId) {
          artist.state = "ARRIVING";
          artist.velocity = { x: 0, y: 0 };
        } else {
          artist.state = "DRIFTING";
          artist.velocity = { ...assignment.completionVelocity };
        }
      } else {
        artist.state = "FOLLOWING";
      }
    }

    return updates;
  }

  private resolveArtistSpeed(artist: Artist): number {
    return Math.max(1, artist.movementSpeedPxPerSecond || this.speedPxPerSecond);
  }
}

function resolveCompletionVelocity(
  points: Vector2[],
  speedPxPerSecond: number,
  fallbackVelocity: Vector2
): Vector2 {
  for (let index = points.length - 1; index > 0; index -= 1) {
    const from = points[index - 1];
    const to = points[index];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length > 0.0001) {
      return {
        x: (dx / length) * speedPxPerSecond,
        y: (dy / length) * speedPxPerSecond
      };
    }
  }

  const fallbackLength = Math.hypot(fallbackVelocity.x, fallbackVelocity.y);
  if (fallbackLength > 0.0001) {
    return {
      x: (fallbackVelocity.x / fallbackLength) * speedPxPerSecond,
      y: (fallbackVelocity.y / fallbackLength) * speedPxPerSecond
    };
  }

  return { x: 0, y: 0 };
}
