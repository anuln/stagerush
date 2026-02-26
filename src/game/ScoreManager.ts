import {
  MISS_PENALTIES,
  SCORE_MATRIX,
  WRONG_STAGE_DELIVERY_MULTIPLIER
} from "../config/ScoreConfig";
import type { ArtistMissReason } from "../entities/ArtistState";
import type {
  StageDeliveryCompletionEvent
} from "../entities/StageState";
import type { ComboDeliveryResult } from "./ComboTracker";

export interface ScoreEvent extends StageDeliveryCompletionEvent {
  basePoints: number;
  stageMatch: boolean;
  stageMatchMultiplier: number;
  comboChainLength: number;
  comboMultiplier: number;
  comboExpiresAtMs: number;
  awardedPoints: number;
  totalScore: number;
}

export interface DeliveryScoreOptions {
  isCorrectStage?: boolean;
}

export interface PenaltyEvent {
  reason: ArtistMissReason;
  appliedPoints: number;
  totalScore: number;
}

export class ScoreManager {
  private score = 0;
  private lastEvent: ScoreEvent | null = null;
  private lastPenaltyEvent: PenaltyEvent | null = null;

  get totalScore(): number {
    return this.score;
  }

  get latestEvent(): ScoreEvent | null {
    return this.lastEvent;
  }

  get latestPenaltyEvent(): PenaltyEvent | null {
    return this.lastPenaltyEvent;
  }

  registerDelivery(
    delivery: StageDeliveryCompletionEvent,
    combo: ComboDeliveryResult | null = null,
    options: DeliveryScoreOptions = {}
  ): ScoreEvent {
    const basePoints = SCORE_MATRIX[delivery.artistTier][delivery.stageSize];
    const stageMatch = options.isCorrectStage ?? true;
    const stageMatchMultiplier = stageMatch ? 1 : WRONG_STAGE_DELIVERY_MULTIPLIER;
    const comboMultiplier = combo?.multiplier ?? 1;
    const comboChainLength = combo?.chainLength ?? 1;
    const comboExpiresAtMs = combo?.expiresAtMs ?? delivery.completedAtMs;
    const awardedPoints = Math.round(
      basePoints * comboMultiplier * stageMatchMultiplier
    );

    this.score += awardedPoints;
    this.lastEvent = {
      ...delivery,
      basePoints,
      stageMatch,
      stageMatchMultiplier,
      comboChainLength,
      comboMultiplier,
      comboExpiresAtMs,
      awardedPoints,
      totalScore: this.score
    };
    return this.lastEvent;
  }

  applyMissPenalty(reason: ArtistMissReason): PenaltyEvent {
    const penalty = MISS_PENALTIES[reason];
    const appliedPoints = Math.max(0, Math.min(this.score, penalty));
    this.score = Math.max(0, this.score - penalty);
    const event: PenaltyEvent = {
      reason,
      appliedPoints,
      totalScore: this.score
    };
    this.lastPenaltyEvent = event;
    return event;
  }
}
