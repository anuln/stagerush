import { Container, Graphics, Text } from "pixi.js";

export interface HudRenderState {
  score: number;
  remainingLives: number;
  remainingTimeSeconds: number;
  levelNumber: number;
  viewportWidth: number;
  comboMultiplier: number | null;
}

export interface HudLabels {
  score: string;
  encounters: string;
  time: string;
  level: string;
  combo: string | null;
}

export function buildHudLabels(
  state: Pick<
    HudRenderState,
    "score" | "remainingLives" | "remainingTimeSeconds" | "levelNumber" | "comboMultiplier"
  >
): HudLabels {
  return {
    score: `Score: ${Math.max(0, Math.floor(state.score))}`,
    encounters: `Encounters Left: ${Math.max(0, Math.floor(state.remainingLives))}`,
    time: `Time: ${Math.max(0, Math.ceil(state.remainingTimeSeconds))}s`,
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

    const topY = 14;
    const centerX = state.viewportWidth / 2;
    this.layer.addChild(
      this.createChip(labels.score, 16, topY, 0, 18, 0x0d1f28, 0x6ce7cf),
      this.createChip(labels.level, centerX, topY, 0.5, 17, 0x1f1730, 0xf6c065),
      this.createChip(
        labels.encounters,
        state.viewportWidth - 16,
        topY,
        1,
        18,
        0x2c1620,
        0xffb57a
      ),
      this.createChip(labels.time, centerX, topY + 36, 0.5, 16, 0x101b2d, 0x8dc2ff)
    );

    if (labels.combo) {
      this.layer.addChild(
        this.createChip(labels.combo, centerX, topY + 68, 0.5, 16, 0x231f0f, 0xffdf8c)
      );
    }
  }

  private createChip(
    text: string,
    x: number,
    y: number,
    anchorX: number,
    fontSize = 18,
    backgroundColor = 0x101010,
    borderColor = 0xffffff
  ): Container {
    const chip = new Container();
    const label = new Text({
      text,
      style: {
        fontFamily: "Manrope, Avenir Next, Segoe UI, sans-serif",
        fontSize,
        fill: 0xf4f4f6,
        stroke: {
          color: 0x02060d,
          width: 2
        }
      }
    });
    label.anchor.set(anchorX, 0);
    label.position.set(x, y + 7);

    const background = new Graphics();
    const width = label.width + 20;
    const height = label.height + 11;
    const left = x - width * anchorX;
    background.roundRect(left, y, width, height, 10);
    background.fill({ color: backgroundColor, alpha: 0.62 });
    background.stroke({ color: borderColor, width: 1.5, alpha: 0.45 });

    chip.addChild(background, label);
    return chip;
  }
}
