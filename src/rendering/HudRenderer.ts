import { Container, Text } from "pixi.js";

export interface HudRenderState {
  score: number;
  remainingLives: number;
  levelNumber: number;
  viewportWidth: number;
  comboMultiplier: number | null;
}

export interface HudLabels {
  score: string;
  lives: string;
  level: string;
  combo: string | null;
}

export function buildHudLabels(
  state: Pick<
    HudRenderState,
    "score" | "remainingLives" | "levelNumber" | "comboMultiplier"
  >
): HudLabels {
  return {
    score: `Score: ${Math.max(0, Math.floor(state.score))}`,
    lives: `Lives: ${Math.max(0, Math.floor(state.remainingLives))}`,
    level: `Level ${Math.max(1, Math.floor(state.levelNumber))}`,
    combo:
      state.comboMultiplier !== null && state.comboMultiplier > 1
        ? `Combo: ${state.comboMultiplier.toFixed(1)}x`
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

    this.layer.addChild(
      this.createLabel(labels.score, 16, 16, 0),
      this.createLabel(labels.level, state.viewportWidth / 2, 16, 0.5),
      this.createLabel(labels.lives, state.viewportWidth - 16, 16, 1)
    );

    if (labels.combo) {
      this.layer.addChild(
        this.createLabel(labels.combo, state.viewportWidth / 2, 40, 0.5, 16)
      );
    }
  }

  private createLabel(
    text: string,
    x: number,
    y: number,
    anchorX: number,
    fontSize = 18
  ): Text {
    const label = new Text({
      text,
      style: {
        fontFamily: "Avenir Next, Helvetica, Arial, sans-serif",
        fontSize,
        fill: 0xf4f4f6,
        stroke: {
          color: 0x111111,
          width: 3
        }
      }
    });
    label.position.set(x, y);
    label.anchor.set(anchorX, 0);
    return label;
  }
}
