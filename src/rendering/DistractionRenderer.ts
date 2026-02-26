import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { getAssetCandidatePaths } from "../assets/GlobalAssetFallbacks";
import type { ResolvedDistraction } from "../maps/MapLoader";
import { resolveAssetPath } from "../maps/MapLoader";

const DISTRACTION_ZONE_TINT = 0xff9ab1;
const DISTRACTION_ZONE_FILL_ALPHA = 0.025;
const DISTRACTION_ZONE_STROKE_ALPHA = 0.085;

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
  private readonly visuals = new Map<string, DistractionVisual>();

  constructor(layer: Container) {
    this.layer = layer;
  }

  render(distractions: ResolvedDistraction[]): void {
    const seenIds = new Set<string>();

    for (const distraction of distractions) {
      seenIds.add(distraction.id);
      const color = colorForType(distraction.type);
      const visual = this.getOrCreateVisual(distraction.id);

      visual.zone.clear();
      visual.zone.circle(
        distraction.screenPosition.x,
        distraction.screenPosition.y,
        distraction.pixelRadius
      );
      visual.zone.fill({
        color: DISTRACTION_ZONE_TINT,
        alpha: DISTRACTION_ZONE_FILL_ALPHA
      });
      visual.zone.stroke({
        color: DISTRACTION_ZONE_TINT,
        width: 2,
        alpha: DISTRACTION_ZONE_STROKE_ALPHA
      });
      const texture = this.getTexture(distraction.sprite);
      if (texture) {
        if (!visual.sprite) {
          visual.sprite = new Sprite(texture);
          visual.sprite.anchor.set(0.5);
          visual.container.addChild(visual.sprite);
        } else if (visual.texturePath !== distraction.sprite) {
          visual.sprite.texture = texture;
        }
        visual.texturePath = distraction.sprite;
        visual.sprite.visible = true;
        visual.sprite.position.set(
          distraction.screenPosition.x,
          distraction.screenPosition.y
        );
        visual.sprite.width = Math.max(24, distraction.pixelRadius * 0.9 * 1.6);
        visual.sprite.height = Math.max(24, distraction.pixelRadius * 0.9 * 1.6);
        visual.marker.visible = false;
      } else {
        visual.texturePath = null;
        if (visual.sprite) {
          visual.sprite.visible = false;
        }
        visual.marker.visible = true;
        visual.marker.clear();
        visual.marker.circle(
          distraction.screenPosition.x,
          distraction.screenPosition.y,
          8
        );
        visual.marker.fill({ color, alpha: 0.9 });
        visual.marker.stroke({ color: 0x111111, width: 2, alpha: 0.8 });
      }
    }

    for (const [id, visual] of this.visuals) {
      if (seenIds.has(id)) {
        continue;
      }
      visual.container.removeFromParent();
      visual.container.destroy({ children: true });
      this.visuals.delete(id);
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

  private getOrCreateVisual(distractionId: string): DistractionVisual {
    const existing = this.visuals.get(distractionId);
    if (existing) {
      return existing;
    }

    const container = new Container();
    const zone = new Graphics();
    const marker = new Graphics();
    container.addChild(zone, marker);
    this.layer.addChild(container);

    const visual: DistractionVisual = {
      container,
      zone,
      marker,
      sprite: null,
      texturePath: null
    };
    this.visuals.set(distractionId, visual);
    return visual;
  }
}

interface DistractionVisual {
  container: Container;
  zone: Graphics;
  marker: Graphics;
  sprite: Sprite | null;
  texturePath: string | null;
}
