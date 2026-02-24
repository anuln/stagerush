import { SCORE_MATRIX } from "../config/ScoreConfig";
import type {
  StageDeliveryCompletionEvent
} from "../entities/StageState";

export interface ScoreEvent extends StageDeliveryCompletionEvent {
  awardedPoints: number;
  totalScore: number;
}

export class ScoreManager {
  private score = 0;
  private lastEvent: ScoreEvent | null = null;

  get totalScore(): number {
    return this.score;
  }

  get latestEvent(): ScoreEvent | null {
    return this.lastEvent;
  }

  registerDelivery(delivery: StageDeliveryCompletionEvent): ScoreEvent {
    const awardedPoints =
      SCORE_MATRIX[delivery.artistTier][delivery.stageSize];
    this.score += awardedPoints;
    this.lastEvent = {
      ...delivery,
      awardedPoints,
      totalScore: this.score
    };
    return this.lastEvent;
  }
}
