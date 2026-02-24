import { SCORE_MATRIX } from "../config/ScoreConfig";
import type {
  StageDeliveryCompletionEvent
} from "../entities/StageState";
import type { ComboDeliveryResult } from "./ComboTracker";

export interface ScoreEvent extends StageDeliveryCompletionEvent {
  basePoints: number;
  comboChainLength: number;
  comboMultiplier: number;
  comboExpiresAtMs: number;
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

  registerDelivery(
    delivery: StageDeliveryCompletionEvent,
    combo: ComboDeliveryResult | null = null
  ): ScoreEvent {
    const basePoints = SCORE_MATRIX[delivery.artistTier][delivery.stageSize];
    const comboMultiplier = combo?.multiplier ?? 1;
    const comboChainLength = combo?.chainLength ?? 1;
    const comboExpiresAtMs = combo?.expiresAtMs ?? delivery.completedAtMs;
    const awardedPoints = Math.round(basePoints * comboMultiplier);

    this.score += awardedPoints;
    this.lastEvent = {
      ...delivery,
      basePoints,
      comboChainLength,
      comboMultiplier,
      comboExpiresAtMs,
      awardedPoints,
      totalScore: this.score
    };
    return this.lastEvent;
  }
}
