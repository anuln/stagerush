import { Container, Text } from "pixi.js";

export interface HudRenderState {
  score: number;
  remainingLives: number;
  levelNumber: number;
  viewportWidth: number;
}

export interface HudLabels {
  score: string;
  lives: string;
  level: string;
}

export function buildHudLabels(
  state: Pick<HudRenderState, "score" | "remainingLives" | "levelNumber">
): HudLabels {
  return {
    score: `Score: ${Math.max(0, Math.floor(state.score))}`,
    lives: `Lives: ${Math.max(0, Math.floor(state.remainingLives))}`,
    level: `Level ${Math.max(1, Math.floor(state.levelNumber))}`
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
  }

  private createLabel(
    text: string,
    x: number,
    y: number,
    anchorX: number
  ): Text {
    const label = new Text({
      text,
      style: {
        fontFamily: "Avenir Next, Helvetica, Arial, sans-serif",
        fontSize: 18,
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
