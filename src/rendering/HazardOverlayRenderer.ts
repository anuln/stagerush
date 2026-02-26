import { Container, Graphics } from "pixi.js";

const DISTRACTION_ZONE_TINT = 0xff9ab1;

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
  private readonly linePool: Graphics[] = [];
  private readonly zonePool: Graphics[] = [];
  private readonly markerPool: Graphics[] = [];

  constructor(layer: Container) {
    this.layer = layer;
  }

  render(frame: HazardOverlayFrame): void {
    let lineCount = 0;
    let zoneCount = 0;
    let markerCount = 0;

    for (const pair of frame.chatPairs) {
      const line = this.getPooledGraphic(this.linePool, lineCount);
      lineCount += 1;
      line.visible = true;
      line.clear();
      line.moveTo(pair.artistA.x, pair.artistA.y);
      line.lineTo(pair.artistB.x, pair.artistB.y);
      line.stroke({ color: 0xf2d7ee, width: 3, alpha: 0.85 });
    }

    for (const zone of frame.distractionZones) {
      if (!zone.active) {
        continue;
      }
      const ring = this.getPooledGraphic(this.zonePool, zoneCount);
      zoneCount += 1;
      ring.visible = true;
      ring.clear();
      ring.circle(zone.center.x, zone.center.y, zone.radius);
      ring.fill({ color: DISTRACTION_ZONE_TINT, alpha: 0.02 });
      ring.stroke({ color: DISTRACTION_ZONE_TINT, width: 2, alpha: 0.11 });
    }

    for (const blocked of frame.blockedArtists) {
      const marker = this.getPooledGraphic(this.markerPool, markerCount);
      markerCount += 1;
      marker.visible = true;
      marker.clear();
      marker.circle(blocked.position.x, blocked.position.y, 13);
      marker.stroke({
        color: blocked.reason === "CHATTING" ? 0xe6a8ff : 0xff9f1c,
        width: 3,
        alpha: 0.75
      });
    }

    this.hideUnused(this.linePool, lineCount);
    this.hideUnused(this.zonePool, zoneCount);
    this.hideUnused(this.markerPool, markerCount);
  }

  private getPooledGraphic(pool: Graphics[], index: number): Graphics {
    const existing = pool[index];
    if (existing) {
      return existing;
    }
    const graphic = new Graphics();
    pool.push(graphic);
    this.layer.addChild(graphic);
    return graphic;
  }

  private hideUnused(pool: Graphics[], startIndex: number): void {
    for (let index = startIndex; index < pool.length; index += 1) {
      const graphic = pool[index];
      graphic.visible = false;
      graphic.clear();
    }
  }
}
