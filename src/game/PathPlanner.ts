import type { ResolvedStage } from "../maps/MapLoader";
import type { FinalizedPathSession } from "../input/PathDrawingInput";
import type { Vector2 } from "../utils/MathUtils";
import { pathLength, resampleBySpacing, smoothCatmullRom } from "../utils/Spline";

export interface PathPlannerConfig {
  snapRadiusPx: number;
  smoothingSteps: number;
  resampleSpacingPx: number;
}

export interface PlannedPath {
  pathId: string;
  artistId: string;
  rawPoints: Vector2[];
  smoothedPoints: Vector2[];
  length: number;
  targetStageId: string | null;
  stageColor: string;
  isValid: boolean;
}

interface SnapCandidate {
  stage: ResolvedStage;
  distance: number;
}

const DEFAULT_CONFIG: PathPlannerConfig = {
  snapRadiusPx: 60,
  smoothingSteps: 8,
  resampleSpacingPx: 10
};

export class PathPlanner {
  private stages: ResolvedStage[];
  private readonly config: PathPlannerConfig;

  constructor(stages: ResolvedStage[], config: Partial<PathPlannerConfig> = {}) {
    this.stages = stages;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config
    };
  }

  setStages(stages: ResolvedStage[]): void {
    this.stages = stages;
  }

  previewSession(session: FinalizedPathSession): PlannedPath {
    return this.planSession(session, "preview");
  }

  finalizeSession(session: FinalizedPathSession): PlannedPath {
    return this.planSession(session, this.makePathId(session));
  }

  private planSession(
    session: FinalizedPathSession,
    pathId: string
  ): PlannedPath {
    const normalizedRaw = normalizeRawPoints(session.rawPoints);
    const smoothed = smoothCatmullRom(normalizedRaw, this.config.smoothingSteps);
    let resampled = resampleBySpacing(smoothed, this.config.resampleSpacingPx);
    if (resampled.length === 0) {
      resampled = normalizedRaw;
    }

    const endPoint = resampled[resampled.length - 1];
    const snapCandidate = this.findSnapCandidate(endPoint, this.config.snapRadiusPx);
    if (snapCandidate) {
      const snappedPoint = {
        x: snapCandidate.stage.screenPosition.x,
        y: snapCandidate.stage.screenPosition.y
      };
      const tail = resampled[resampled.length - 1];
      if (!tail || tail.x !== snappedPoint.x || tail.y !== snappedPoint.y) {
        resampled = [...resampled.slice(0, -1), snappedPoint];
      }
      return {
        pathId,
        artistId: session.artistId,
        rawPoints: normalizedRaw,
        smoothedPoints: resampled,
        length: pathLength(resampled),
        targetStageId: snapCandidate.stage.id,
        stageColor: snapCandidate.stage.color,
        isValid: true
      };
    }

    return {
      pathId,
      artistId: session.artistId,
      rawPoints: normalizedRaw,
      smoothedPoints: resampled,
      length: pathLength(resampled),
      targetStageId: null,
      stageColor: "#8b8b8b",
      isValid: false
    };
  }

  private findSnapCandidate(
    endPoint: Vector2,
    snapRadiusPx: number
  ): SnapCandidate | null {
    let best: SnapCandidate | null = null;
    for (const stage of this.stages) {
      const dx = stage.screenPosition.x - endPoint.x;
      const dy = stage.screenPosition.y - endPoint.y;
      const distance = Math.hypot(dx, dy);
      if (distance > snapRadiusPx) {
        continue;
      }
      if (!best || distance < best.distance) {
        best = { stage, distance };
      }
    }
    return best;
  }

  private makePathId(session: FinalizedPathSession): string {
    const last = session.rawPoints[session.rawPoints.length - 1] ?? { x: 0, y: 0 };
    return [
      session.artistId,
      Math.round(session.startedAtMs),
      Math.round(session.endedAtMs),
      session.rawPoints.length,
      Math.round(last.x),
      Math.round(last.y)
    ].join("-");
  }
}

function normalizeRawPoints(points: Vector2[]): Vector2[] {
  if (points.length === 0) {
    return [];
  }
  if (points.length === 1) {
    return [{ ...points[0] }, { ...points[0] }];
  }
  return points.map((point) => ({ ...point }));
}
