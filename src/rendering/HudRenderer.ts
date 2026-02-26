import { Container, Graphics, Text } from "pixi.js";

export interface HudRenderState {
  score: number;
  remainingLives: number;
  maxLives: number;
  remainingTimeSeconds: number;
  sessionDurationSeconds: number;
  levelNumber: number;
  dayNumber: number;
  sessionName: string;
  setsPlayed: number;
  targetSets: number;
  viewportWidth: number;
  viewportHeight: number;
  safeAreaTopPx: number;
  safeAreaBottomPx: number;
  comboMultiplier: number | null;
  stageProgress: Array<{
    stageId: string;
    deliveredSets: number;
    color: string;
    position: { x: number; y: number };
  }>;
}

export interface HudLabels {
  festivalHype: string;
  safetyStrikes: string;
  sessionTime: string;
  daySession: string;
  setsProgress: string;
  pace: string;
  stageHeat: string | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseColor(hex: string, fallback = 0x7dd9f2): number {
  const normalized = hex.replace("#", "");
  const parsed = Number.parseInt(normalized, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatScore(score: number): string {
  const whole = Math.max(0, Math.floor(score));
  return String(whole);
}

export function buildHudLabels(
  state: Pick<
    HudRenderState,
    | "score"
    | "remainingLives"
    | "maxLives"
    | "remainingTimeSeconds"
    | "sessionDurationSeconds"
    | "dayNumber"
    | "sessionName"
    | "setsPlayed"
    | "targetSets"
    | "comboMultiplier"
  >
): HudLabels {
  const strikesUsed = Math.max(
    0,
    Math.floor(Math.max(0, state.maxLives) - Math.max(0, state.remainingLives))
  );
  const safeTargetSets = Math.max(1, Math.floor(state.targetSets));
  const elapsedSeconds = Math.max(
    0,
    Math.max(0, state.sessionDurationSeconds) - Math.max(0, state.remainingTimeSeconds)
  );
  const expectedSets =
    state.sessionDurationSeconds > 0
      ? (safeTargetSets * elapsedSeconds) / state.sessionDurationSeconds
      : safeTargetSets;
  const paceDelta = Math.max(-99, Math.min(99, state.setsPlayed - expectedSets));
  const roundedPaceDelta = Math.round(paceDelta);
  const paceLabel =
    Math.abs(paceDelta) < 0.75
      ? "PACE ON TRACK"
      : roundedPaceDelta > 0
        ? `PACE +${roundedPaceDelta} AHEAD`
        : `PACE ${roundedPaceDelta} BEHIND`;

  return {
    festivalHype: `🏆 ${formatScore(state.score)} 💥${strikesUsed}`,
    safetyStrikes: `💥${strikesUsed}`,
    sessionTime: `TIME ${Math.max(0, Math.ceil(state.remainingTimeSeconds))}s`,
    daySession: `DAY ${Math.max(1, Math.floor(state.dayNumber))} · ${state.sessionName.toUpperCase()}`,
    setsProgress: `SETS ${Math.max(0, Math.floor(state.setsPlayed))}/${safeTargetSets}`,
    pace: paceLabel,
    stageHeat:
      state.comboMultiplier !== null && state.comboMultiplier > 1
        ? `HEAT ${state.comboMultiplier.toFixed(1)}x`
        : null
  };
}

interface StageBadgeVisual {
  container: Container;
  card: Graphics;
  dot: Graphics;
  label: Text;
}

export class HudRenderer {
  private readonly layer: Container;
  private readonly root = new Container();
  private readonly scoreLabel: Text;
  private readonly daySessionLabel: Text;
  private readonly timerDial = new Container();
  private readonly timerRingBase = new Graphics();
  private readonly timerRingProgress = new Graphics();
  private readonly timerCore = new Graphics();
  private readonly timerValue: Text;
  private readonly timerCaption: Text;
  private readonly stageBadgeLayer = new Container();
  private readonly bottomSecondary: Text;
  private readonly bottomHeat: Text;
  private readonly stageBadges = new Map<string, StageBadgeVisual>();

  constructor(layer: Container) {
    this.layer = layer;
    this.root.label = "hudRoot";

    this.scoreLabel = new Text({
      text: "",
      style: {
        fontFamily: "Manrope, Avenir Next, Segoe UI, sans-serif",
        fontSize: 16,
        fontWeight: "800",
        fill: 0xf4f8ff,
        letterSpacing: 0.2,
        stroke: {
          color: 0x05080f,
          width: 2
        }
      }
    });
    this.scoreLabel.alpha = 0.97;

    this.daySessionLabel = new Text({
      text: "",
      style: {
        fontFamily: "Manrope, Avenir Next, Segoe UI, sans-serif",
        fontSize: 16,
        fontWeight: "800",
        fill: 0xf4f8ff,
        letterSpacing: 0.2,
        stroke: {
          color: 0x05080f,
          width: 2
        }
      }
    });
    this.daySessionLabel.anchor.set(0.5, 0);
    this.daySessionLabel.alpha = 0.96;

    this.timerValue = new Text({
      text: "0",
      style: {
        fontFamily: "Manrope, Avenir Next, Segoe UI, sans-serif",
        fontSize: 20,
        fontWeight: "800",
        fill: 0xf5f8ff,
        stroke: {
          color: 0x04070d,
          width: 1
        }
      }
    });
    this.timerValue.anchor.set(0.5, 0.62);

    this.timerCaption = new Text({
      text: "TIME",
      style: {
        fontFamily: "Manrope, Avenir Next, Segoe UI, sans-serif",
        fontSize: 9,
        fontWeight: "700",
        fill: 0xbfd7ef,
        letterSpacing: 0.8
      }
    });
    this.timerCaption.anchor.set(0.5, 0);

    this.timerDial.addChild(
      this.timerRingBase,
      this.timerRingProgress,
      this.timerCore,
      this.timerValue,
      this.timerCaption
    );

    this.bottomSecondary = new Text({
      text: "",
      style: {
        fontFamily: "Manrope, Avenir Next, Segoe UI, sans-serif",
        fontSize: 13,
        fontWeight: "bold",
        fill: 0xf4f8ff,
        letterSpacing: 0.35,
        stroke: {
          color: 0x05080f,
          width: 2
        }
      }
    });
    this.bottomSecondary.anchor.set(0.5, 1);

    this.bottomHeat = new Text({
      text: "",
      style: {
        fontFamily: "Manrope, Avenir Next, Segoe UI, sans-serif",
        fontSize: 12,
        fontWeight: "bold",
        fill: 0xffde96,
        letterSpacing: 0.35,
        stroke: {
          color: 0x05080f,
          width: 2
        }
      }
    });
    this.bottomHeat.anchor.set(0.5, 1);

    this.root.addChild(
      this.scoreLabel,
      this.daySessionLabel,
      this.timerDial,
      this.stageBadgeLayer,
      this.bottomSecondary,
      this.bottomHeat
    );
    this.layer.addChild(this.root);
  }

  render(state: HudRenderState): void {
    if (!this.root.parent) {
      this.layer.addChild(this.root);
    }

    const labels = buildHudLabels(state);
    const safeTop = clamp(state.safeAreaTopPx, 0, 72);
    const hudSafeTop = Math.min(safeTop, 20);
    const safeBottom = clamp(state.safeAreaBottomPx, 0, 80);
    const leftPadding = Math.max(10, Math.min(20, Math.round(state.viewportWidth * 0.03)));
    const topPadding = 4;
    const topY = hudSafeTop + topPadding;
    const topLineY = topY + 1;
    const timerRadius = state.viewportWidth < 400 ? 27 : 30;
    const timerCenterX = state.viewportWidth - leftPadding - timerRadius;
    const timerCenterY = topY + timerRadius;

    this.scoreLabel.text = labels.festivalHype;
    this.scoreLabel.position.set(leftPadding, topLineY);

    this.updateTimerDial({
      x: timerCenterX,
      y: timerCenterY,
      radius: timerRadius,
      remaining: state.remainingTimeSeconds,
      duration: state.sessionDurationSeconds
    });

    const scoreBounds = this.scoreLabel.getBounds();
    const availableLeft = scoreBounds.x + scoreBounds.width + 14;
    const availableRight = timerCenterX - timerRadius - 12;
    const topSessionCenterX =
      availableRight - availableLeft > 70
        ? (availableLeft + availableRight) / 2
        : state.viewportWidth * 0.5;
    this.daySessionLabel.text = labels.daySession;
    this.daySessionLabel.position.set(topSessionCenterX, topLineY);

    this.updateStageSetBadges(
      state.stageProgress,
      state.viewportWidth,
      state.viewportHeight,
      safeTop,
      safeBottom
    );

    const bottomAnchorY = state.viewportHeight - safeBottom - 10;
    this.bottomSecondary.text = `${labels.setsProgress} · ${labels.pace}`;
    this.bottomSecondary.position.set(state.viewportWidth / 2, bottomAnchorY - 8);
    this.bottomSecondary.visible = true;

    if (labels.stageHeat) {
      this.bottomHeat.text = labels.stageHeat;
      this.bottomHeat.position.set(state.viewportWidth / 2, bottomAnchorY - 34);
      this.bottomHeat.visible = true;
    } else {
      this.bottomHeat.visible = false;
    }
  }

  private updateTimerDial(input: {
    x: number;
    y: number;
    radius: number;
    remaining: number;
    duration: number;
  }): void {
    const ratio =
      input.duration > 0 ? clamp(input.remaining / input.duration, 0, 1) : 0;
    const color =
      input.remaining <= 10 ? 0xff7d55 : input.remaining <= 20 ? 0xffcb6a : 0x7df2d2;

    this.timerRingBase.clear();
    this.timerRingBase.circle(input.x, input.y, input.radius);
    this.timerRingBase.stroke({ color: 0x30475d, width: 7, alpha: 0.72 });

    this.timerRingProgress.clear();
    this.timerRingProgress.arc(
      input.x,
      input.y,
      input.radius,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * ratio
    );
    this.timerRingProgress.stroke({ color, width: 7, alpha: 0.95, cap: "round" });

    this.timerCore.clear();
    this.timerCore.circle(input.x, input.y, input.radius - 6);
    this.timerCore.fill({ color: 0x08111f, alpha: 0.8 });

    this.timerValue.text = String(Math.max(0, Math.ceil(input.remaining)));
    this.timerValue.style.fontSize = input.radius < 33 ? 19 : 22;
    this.timerValue.position.set(input.x, input.y - 4);
    this.timerCaption.position.set(input.x, input.y + 10);
  }

  private updateStageSetBadges(
    stageProgress: HudRenderState["stageProgress"],
    viewportWidth: number,
    viewportHeight: number,
    safeTop: number,
    safeBottom: number
  ): void {
    const seen = new Set<string>();

    for (const stage of stageProgress) {
      seen.add(stage.stageId);
      const badge = this.getOrCreateStageBadge(stage.stageId);
      const labelText = `SETS ${Math.max(0, Math.floor(stage.deliveredSets))}`;
      badge.label.text = labelText;
      const horizontalPadding = 8;
      const cardWidth = Math.max(52, Math.ceil(badge.label.width + horizontalPadding * 2));
      const cardHeight = 18;
      const labelX = clamp(
        stage.position.x - cardWidth / 2,
        6,
        viewportWidth - cardWidth - 6
      );
      const labelY = clamp(
        stage.position.y + 26,
        safeTop + 6,
        viewportHeight - safeBottom - cardHeight - 6
      );

      badge.card.clear();
      badge.card.roundRect(labelX, labelY, cardWidth, cardHeight, 7);
      badge.card.fill({ color: 0x0d1728, alpha: 0.48 });
      badge.card.stroke({
        color: parseColor(stage.color, 0x75c7ff),
        width: 1,
        alpha: 0.52
      });

      badge.dot.clear();
      badge.dot.circle(labelX + 8, labelY + cardHeight / 2, 2.5);
      badge.dot.fill({ color: parseColor(stage.color, 0x75c7ff), alpha: 0.88 });

      badge.label.position.set(labelX + 14, labelY + 4);
      badge.label.alpha = 0.92;
      badge.container.visible = true;
    }

    for (const [stageId, badge] of this.stageBadges) {
      if (seen.has(stageId)) {
        continue;
      }
      badge.container.removeFromParent();
      badge.container.destroy({ children: true });
      this.stageBadges.delete(stageId);
    }
  }

  private getOrCreateStageBadge(stageId: string): StageBadgeVisual {
    const existing = this.stageBadges.get(stageId);
    if (existing) {
      return existing;
    }

    const container = new Container();
    const card = new Graphics();
    const dot = new Graphics();
    const label = new Text({
      text: "",
      style: {
        fontFamily: "Manrope, Avenir Next, Segoe UI, sans-serif",
        fontSize: 10,
        fontWeight: "700",
        fill: 0xe8f2ff,
        letterSpacing: 0.25
      }
    });
    container.addChild(card, dot, label);
    this.stageBadgeLayer.addChild(container);

    const badge = { container, card, dot, label };
    this.stageBadges.set(stageId, badge);
    return badge;
  }
}
