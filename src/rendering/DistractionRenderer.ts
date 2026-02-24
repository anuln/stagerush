import { Container, Graphics } from "pixi.js";
import type { ResolvedDistraction } from "../maps/MapLoader";

function colorForType(type: ResolvedDistraction["type"]): number {
  switch (type) {
    case "merch_stand":
      return 0xf9c74f;
    case "burger_shack":
      return 0xf9844a;
    case "paparazzi":
      return 0x90be6d;
    case "fan_crowd":
      return 0x43aa8b;
    default:
      return 0xaaaaaa;
  }
}

export class DistractionRenderer {
  private readonly layer: Container;

  constructor(layer: Container) {
    this.layer = layer;
  }

  render(distractions: ResolvedDistraction[]): void {
    this.layer.removeChildren();

    for (const distraction of distractions) {
      const color = colorForType(distraction.type);

      const zone = new Graphics();
      zone.circle(
        distraction.screenPosition.x,
        distraction.screenPosition.y,
        distraction.pixelRadius
      );
      zone.fill({ color, alpha: 0.08 });
      zone.stroke({ color, width: 2, alpha: 0.35 });
      this.layer.addChild(zone);

      const marker = new Graphics();
      marker.circle(
        distraction.screenPosition.x,
        distraction.screenPosition.y,
        8
      );
      marker.fill({ color, alpha: 0.9 });
      marker.stroke({ color: 0x111111, width: 2, alpha: 0.8 });
      this.layer.addChild(marker);
    }
  }
}
