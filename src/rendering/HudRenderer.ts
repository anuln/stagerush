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

function formatStageName(stageId: string): string {
  return stageId
    .replace(/[-_]/g, " ")
    .replace(/\bstage\b/gi, "")
    .trim()
    .toUpperCase();
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
  const maxStrikes = Math.max(1, Math.floor(state.maxLives));
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

export class HudRenderer {
  private readonly layer: Container;

  constructor(layer: Container) {
    this.layer = layer;
  }

  render(state: HudRenderState): void {
    const labels = buildHudLabels(state);
    this.layer.removeChildren();

    const safeTop = clamp(state.safeAreaTopPx, 0, 72);
    const safeBottom = clamp(state.safeAreaBottomPx, 0, 80);
    const leftPadding = Math.max(10, Math.min(20, Math.round(state.viewportWidth * 0.03)));
    const topY = safeTop + 8;
    const timerRadius = state.viewportWidth < 400 ? 31 : 35;
    const timerCenterX = state.viewportWidth - leftPadding - timerRadius;
    const timerCenterY = topY + timerRadius;

    this.layer.addChild(
      this.createTopLeftScoreLabel({
        x: leftPadding,
        y: topY,
        text: labels.festivalHype
      })
    );

    this.layer.addChild(
      this.createTimerDial({
        x: timerCenterX,
        y: timerCenterY,
        radius: timerRadius,
        remaining: state.remainingTimeSeconds,
        duration: state.sessionDurationSeconds
      })
    );

    this.layer.addChild(
      this.createStageSetBadges(
        state.stageProgress,
        state.viewportWidth,
        state.viewportHeight,
        safeTop,
        safeBottom
      )
    );

    const bottomAnchorY = state.viewportHeight - safeBottom - 10;
    const bottomPrimary = this.createBottomLabel(labels.daySession, 20);
    bottomPrimary.position.set(state.viewportWidth / 2, bottomAnchorY - 26);
    this.layer.addChild(bottomPrimary);

    const secondary = this.createBottomLabel(`${labels.setsProgress} · ${labels.pace}`, 13);
    secondary.position.set(state.viewportWidth / 2, bottomAnchorY - 6);
    this.layer.addChild(secondary);

    if (labels.stageHeat) {
      const heat = this.createBottomLabel(labels.stageHeat, 12, 0xffde96);
      heat.position.set(state.viewportWidth / 2, bottomAnchorY - 48);
      this.layer.addChild(heat);
    }
  }

  private createTopLeftScoreLabel(input: {
    x: number;
    y: number;
    text: string;
  }): Container {
    const container = new Container();
    const label = new Text({
      text: input.text,
      style: {
        fontFamily: "Manrope, Avenir Next, Segoe UI, sans-serif",
        fontSize: 18,
        fontWeight: "800",
        fill: 0xf4f8ff,
        letterSpacing: 0.2,
        stroke: {
          color: 0x05080f,
          width: 2
        }
      }
    });
    label.position.set(input.x, input.y + 2);
    label.alpha = 0.97;
    container.addChild(label);
    return container;
  }

  private createTimerDial(input: {
    x: number;
    y: number;
    radius: number;
    remaining: number;
    duration: number;
  }): Container {
    const dial = new Container();
    const ratio =
      input.duration > 0 ? clamp(input.remaining / input.duration, 0, 1) : 0;
    const color =
      input.remaining <= 10 ? 0xff7d55 : input.remaining <= 20 ? 0xffcb6a : 0x7df2d2;

    const ringBase = new Graphics();
    ringBase.circle(input.x, input.y, input.radius);
    ringBase.stroke({ color: 0x30475d, width: 7, alpha: 0.72 });
    dial.addChild(ringBase);

    const ringProgress = new Graphics();
    ringProgress.arc(
      input.x,
      input.y,
      input.radius,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * ratio
    );
    ringProgress.stroke({ color, width: 7, alpha: 0.95, cap: "round" });
    dial.addChild(ringProgress);

    const core = new Graphics();
    core.circle(input.x, input.y, input.radius - 6);
    core.fill({ color: 0x08111f, alpha: 0.8 });
    dial.addChild(core);

    const value = new Text({
      text: String(Math.max(0, Math.ceil(input.remaining))),
      style: {
        fontFamily: "Manrope, Avenir Next, Segoe UI, sans-serif",
        fontSize: input.radius < 33 ? 19 : 22,
        fontWeight: "800",
        fill: 0xf5f8ff,
        stroke: {
          color: 0x04070d,
          width: 1
        }
      }
    });
    value.anchor.set(0.5, 0.62);
    value.position.set(input.x, input.y - 4);

    const label = new Text({
      text: "TIME",
      style: {
        fontFamily: "Manrope, Avenir Next, Segoe UI, sans-serif",
        fontSize: 9,
        fontWeight: "700",
        fill: 0xbfd7ef,
        letterSpacing: 0.8
      }
    });
    label.anchor.set(0.5, 0);
    label.position.set(input.x, input.y + 10);

    dial.addChild(value, label);
    return dial;
  }

  private createStageSetBadges(
    stageProgress: HudRenderState["stageProgress"],
    viewportWidth: number,
    viewportHeight: number,
    safeTop: number,
    safeBottom: number
  ): Container {
    const strip = new Container();
    if (stageProgress.length === 0) {
      return strip;
    }

    for (const stage of stageProgress) {
      const isNearRightEdge = stage.position.x > viewportWidth - 96;
      const labelX = clamp(
        stage.position.x + (isNearRightEdge ? -72 : 22),
        8,
        viewportWidth - 78
      );
      const labelY = clamp(
        stage.position.y - 14,
        safeTop + 6,
        viewportHeight - safeBottom - 22
      );
      const card = new Graphics();
      card.roundRect(labelX, labelY, 70, 20, 6);
      card.fill({ color: 0x0d1728, alpha: 0.4 });
      card.stroke({
        color: parseColor(stage.color, 0x75c7ff),
        width: 1,
        alpha: 0.44
      });
      strip.addChild(card);

      const dot = new Graphics();
      dot.circle(labelX + 8, labelY + 10, 2.5);
      dot.fill({ color: parseColor(stage.color, 0x75c7ff), alpha: 0.86 });
      strip.addChild(dot);

      const label = new Text({
        text: `SETS ${Math.max(0, Math.floor(stage.deliveredSets))}`,
        style: {
          fontFamily: "Manrope, Avenir Next, Segoe UI, sans-serif",
          fontSize: 10,
          fontWeight: "700",
          fill: 0xd4e5f7,
          letterSpacing: 0.25
        }
      });
      label.position.set(labelX + 14, labelY + 5);
      label.alpha = 0.92;
      strip.addChild(label);

      const stageTag = new Text({
        text: formatStageName(stage.stageId),
        style: {
          fontFamily: "Manrope, Avenir Next, Segoe UI, sans-serif",
          fontSize: 8,
          fontWeight: "700",
          fill: 0x91a9c7,
          letterSpacing: 0.25
        }
      });
      stageTag.position.set(labelX + 14, labelY - 9);
      stageTag.alpha = 0.68;
      strip.addChild(stageTag);
    }

    return strip;
  }

  private createBottomLabel(text: string, fontSize: number, color = 0xf4f8ff): Text {
    const label = new Text({
      text,
      style: {
        fontFamily: "Manrope, Avenir Next, Segoe UI, sans-serif",
        fontSize,
        fontWeight: "bold",
        fill: color,
        letterSpacing: 0.35,
        stroke: {
          color: 0x05080f,
          width: 2
        }
      }
    });
    label.anchor.set(0.5, 1);
    return label;
  }
}
