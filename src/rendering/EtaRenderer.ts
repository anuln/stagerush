import { Container, Text } from "pixi.js";
import type { Vector2 } from "../utils/MathUtils";

export interface EtaOverlay {
  position: Vector2;
  etaSeconds: number;
  isWarning: boolean;
}

export class EtaRenderer {
  private readonly layer: Container;

  constructor(layer: Container) {
    this.layer = layer;
  }

  render(overlay: EtaOverlay | null): void {
    this.layer.removeChildren();
    if (!overlay) {
      return;
    }

    const etaLabel = new Text({
      text: `${overlay.etaSeconds.toFixed(1)}s`,
      style: {
        fontFamily: "Avenir Next, Helvetica, Arial, sans-serif",
        fontSize: 14,
        fill: overlay.isWarning ? 0xff4d4d : 0xe8f8ff,
        stroke: {
          color: 0x111111,
          width: 3
        }
      }
    });
    etaLabel.anchor.set(0.5, 1);
    etaLabel.position.set(overlay.position.x, overlay.position.y - 18);
    this.layer.addChild(etaLabel);
  }
}
