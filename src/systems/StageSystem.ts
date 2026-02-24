import { Artist } from "../entities/Artist";
import { Stage } from "../entities/Stage";
import type {
  StageDeliveryCompletionEvent,
  StageRuntimeSnapshot
} from "../entities/StageState";
import type { ResolvedStage } from "../maps/MapLoader";

export interface StageUpdateResult {
  completedDeliveries: StageDeliveryCompletionEvent[];
}

export class StageSystem {
  private readonly performanceDurationMs: number;
  private stages = new Map<string, Stage>();

  constructor(stages: ResolvedStage[], performanceDurationMs = 2500) {
    this.performanceDurationMs = performanceDurationMs;
    this.setStages(stages);
  }

  setStages(stages: ResolvedStage[]): void {
    const nextMap = new Map<string, Stage>();
    for (const stage of stages) {
      nextMap.set(
        stage.id,
        new Stage({
          id: stage.id,
          size: stage.size,
          color: stage.color,
          position: stage.screenPosition,
          performanceDurationMs: this.performanceDurationMs
        })
      );
    }
    this.stages = nextMap;
  }

  handleArrival(artist: Artist, stageId: string | null, nowMs: number): void {
    if (!stageId) {
      return;
    }
    const stage = this.stages.get(stageId);
    if (!stage) {
      return;
    }
    stage.handleArrival(artist, nowMs);
  }

  update(nowMs: number): StageUpdateResult {
    const completedDeliveries: StageDeliveryCompletionEvent[] = [];
    for (const stage of this.stages.values()) {
      completedDeliveries.push(...stage.update(nowMs));
    }
    return { completedDeliveries };
  }

  getSnapshots(): StageRuntimeSnapshot[] {
    return Array.from(this.stages.values(), (stage) => stage.snapshot());
  }
}
