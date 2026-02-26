import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { getAssetCandidatePaths } from "../assets/GlobalAssetFallbacks";
import type { ResolvedDistraction } from "../maps/MapLoader";
import { resolveAssetPath } from "../maps/MapLoader";

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
      zone.fill({ color, alpha: 0.04 });
      zone.stroke({ color, width: 2, alpha: 0.18 });
      this.layer.addChild(zone);

      const marker = new Graphics();
      const texture = this.getTexture(distraction.sprite);
      if (texture) {
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.position.set(
          distraction.screenPosition.x,
          distraction.screenPosition.y
        );
        sprite.width = Math.max(24, distraction.pixelRadius * 0.9 * 1.6);
        sprite.height = Math.max(24, distraction.pixelRadius * 0.9 * 1.6);
        this.layer.addChild(sprite);
      } else {
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

  private getTexture(path: string): Texture | null {
    const candidates = getAssetCandidatePaths("distraction", path);
    for (const candidate of candidates) {
      const resolved = resolveAssetPath(candidate);
      const texture = Assets.get(resolved) as Texture | undefined;
      if (texture && texture !== Texture.EMPTY) {
        return texture;
      }
      const direct = Assets.get(candidate) as Texture | undefined;
      if (direct && direct !== Texture.EMPTY) {
        return direct;
      }
    }
    return null;
  }
}
