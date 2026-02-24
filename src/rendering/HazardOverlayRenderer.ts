import { Container, Graphics } from "pixi.js";

export interface HazardOverlayFrame {
  chatPairs: Array<{
    artistA: { x: number; y: number };
    artistB: { x: number; y: number };
  }>;
  distractionZones: Array<{
    center: { x: number; y: number };
    radius: number;
    active: boolean;
  }>;
  blockedArtists: Array<{
    position: { x: number; y: number };
    reason: "CHATTING" | "DISTRACTED";
  }>;
}

export interface HazardOverlaySummary {
  chatLines: number;
  activeDistractionZones: number;
  blockedMarkers: number;
}

export function buildHazardOverlaySummary(
  frame: HazardOverlayFrame
): HazardOverlaySummary {
  return {
    chatLines: frame.chatPairs.length,
    activeDistractionZones: frame.distractionZones.filter((zone) => zone.active).length,
    blockedMarkers: frame.blockedArtists.length
  };
}

export class HazardOverlayRenderer {
  private readonly layer: Container;

  constructor(layer: Container) {
    this.layer = layer;
  }

  render(frame: HazardOverlayFrame): void {
    this.layer.removeChildren();

    for (const pair of frame.chatPairs) {
      const line = new Graphics();
      line.moveTo(pair.artistA.x, pair.artistA.y);
      line.lineTo(pair.artistB.x, pair.artistB.y);
      line.stroke({ color: 0xf2d7ee, width: 3, alpha: 0.85 });
      this.layer.addChild(line);
    }

    for (const zone of frame.distractionZones) {
      if (!zone.active) {
        continue;
      }
      const ring = new Graphics();
      ring.circle(zone.center.x, zone.center.y, zone.radius);
      ring.stroke({ color: 0xffde59, width: 2, alpha: 0.35 });
      this.layer.addChild(ring);
    }

    for (const blocked of frame.blockedArtists) {
      const marker = new Graphics();
      marker.circle(blocked.position.x, blocked.position.y, 13);
      marker.stroke({
        color: blocked.reason === "CHATTING" ? 0xe6a8ff : 0xff9f1c,
        width: 3,
        alpha: 0.75
      });
      this.layer.addChild(marker);
    }
  }
}
