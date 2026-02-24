import { Artist } from "../entities/Artist";
import type { PlannedPath } from "../game/PathPlanner";
import type { Vector2 } from "../utils/MathUtils";
import { pathLength } from "../utils/Spline";

interface PathAssignment {
  pathId: string;
  targetStageId: string;
  points: Vector2[];
  segmentIndex: number;
  segmentProgress: number;
  consumedLength: number;
  totalLength: number;
}

export interface PathFollowUpdate {
  artistId: string;
  pathId: string;
  consumedLength: number;
  totalLength: number;
  completed: boolean;
  targetStageId: string;
}

export class PathFollower {
  readonly speedPxPerSecond: number;
  private readonly assignments = new Map<string, PathAssignment>();

  constructor(speedPxPerSecond: number) {
    this.speedPxPerSecond = speedPxPerSecond;
  }

  assignPath(artist: Artist, plannedPath: PlannedPath): void {
    if (
      !plannedPath.isValid ||
      !plannedPath.targetStageId ||
      plannedPath.smoothedPoints.length < 2
    ) {
      return;
    }

    const points = [
      { x: artist.position.x, y: artist.position.y },
      ...plannedPath.smoothedPoints.slice(1).map((point) => ({ ...point }))
    ];

    this.assignments.set(artist.id, {
      pathId: plannedPath.pathId,
      targetStageId: plannedPath.targetStageId,
      points,
      segmentIndex: 0,
      segmentProgress: 0,
      consumedLength: 0,
      totalLength: pathLength(points)
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
        this.assignments.delete(artist.id);
        continue;
      }

      let remainingDistance = Math.max(0, this.speedPxPerSecond * deltaSeconds);
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
        artist.state = "ARRIVING";
      } else {
        artist.state = "FOLLOWING";
      }
    }

    return updates;
  }
}
