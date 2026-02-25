import {
  COMBO_WINDOW_MS,
  getComboMultiplier
} from "../config/ScoreConfig";

interface StageComboState {
  chainLength: number;
  lastDeliveryAtMs: number;
}

export interface ComboDeliveryResult {
  stageId: string;
  chainLength: number;
  multiplier: number;
  expiresAtMs: number;
}

export class ComboTracker {
  private readonly comboWindowMs: number;
  private readonly stageStates = new Map<string, StageComboState>();

  constructor(comboWindowMs = COMBO_WINDOW_MS) {
    this.comboWindowMs = comboWindowMs;
  }

  registerDelivery(stageId: string, completedAtMs: number): ComboDeliveryResult {
    const state = this.stageStates.get(stageId);
    const withinWindow = Boolean(
      state && completedAtMs - state.lastDeliveryAtMs <= this.comboWindowMs
    );
    const chainLength = withinWindow ? (state?.chainLength ?? 0) + 1 : 1;

    this.stageStates.set(stageId, {
      chainLength,
      lastDeliveryAtMs: completedAtMs
    });

    return {
      stageId,
      chainLength,
      multiplier: getComboMultiplier(chainLength),
      expiresAtMs: completedAtMs + this.comboWindowMs
    };
  }

  getActiveChains(nowMs: number): ComboDeliveryResult[] {
    const active: ComboDeliveryResult[] = [];

    for (const [stageId, state] of this.stageStates.entries()) {
      const expiresAtMs = state.lastDeliveryAtMs + this.comboWindowMs;
      if (state.chainLength < 2 || nowMs > expiresAtMs) {
        continue;
      }

      active.push({
        stageId,
        chainLength: state.chainLength,
        multiplier: getComboMultiplier(state.chainLength),
        expiresAtMs
      });
    }

    return active.sort((a, b) => a.stageId.localeCompare(b.stageId));
  }

  getHighestActiveChain(nowMs: number): ComboDeliveryResult | null {
    const active = this.getActiveChains(nowMs);
    if (active.length === 0) {
      return null;
    }

    return active.reduce((best, entry) => {
      if (entry.multiplier === best.multiplier) {
        return entry.chainLength > best.chainLength ? entry : best;
      }
      return entry.multiplier > best.multiplier ? entry : best;
    });
  }

  breakAllChains(): void {
    this.stageStates.clear();
  }
}
