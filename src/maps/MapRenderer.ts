import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { getAssetCandidatePaths } from "../assets/GlobalAssetFallbacks";
import type { DebugToggles } from "../debug/DebugToggles";
import { resolveAssetPath } from "./MapLoader";
import type { ResolvedFestivalLayout } from "./MapLoader";
import type { LayerSet } from "./layers";

function parseColor(hex: string, fallback = 0x3a86ff): number {
  const normalized = hex.replace("#", "");
  const parsed = Number.parseInt(normalized, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export class MapRenderer {
  private readonly layerSet: LayerSet;
  private readonly debugToggles: DebugToggles;

  constructor(layerSet: LayerSet, debugToggles: DebugToggles) {
    this.layerSet = layerSet;
    this.debugToggles = debugToggles;
  }

  render(layout: ResolvedFestivalLayout): void {
    this.clearLayers();
    this.renderBackground(layout);
    this.renderStages(layout);
    this.renderSpawnPoints(layout);
  }

  private clearLayers(): void {
    this.layerSet.mapLayer.removeChildren();
    this.layerSet.stageLayer.removeChildren();
    this.layerSet.distractionLayer.removeChildren();
    this.layerSet.debugLayer.removeChildren();
  }

  private renderBackground(layout: ResolvedFestivalLayout): void {
    const texture = this.getTexture(layout.map.background, "background");
    if (texture) {
      const bg = new Sprite(texture);
      bg.width = layout.viewport.width;
      bg.height = layout.viewport.height;
      this.layerSet.mapLayer.addChild(bg);
      return;
    }

    const bg = new Graphics();
    bg.rect(0, 0, layout.viewport.width, layout.viewport.height);
    bg.fill(0x23312a);
    this.layerSet.mapLayer.addChild(bg);
  }

  private renderStages(layout: ResolvedFestivalLayout): void {
    layout.stages.forEach((stage) => {
      const texture = this.getTexture(stage.sprite, "stage");
      if (texture) {
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.position.set(stage.screenPosition.x, stage.screenPosition.y);
        sprite.width = stage.pixelWidth;
        sprite.height = stage.pixelHeight;
        this.layerSet.stageLayer.addChild(sprite);
        return;
      }

      const stageGraphic = new Graphics();
      stageGraphic.roundRect(
        stage.screenPosition.x - stage.pixelWidth / 2,
        stage.screenPosition.y - stage.pixelHeight / 2,
        stage.pixelWidth,
        stage.pixelHeight,
        12
      );
      stageGraphic.fill(parseColor(stage.color));
      this.layerSet.stageLayer.addChild(stageGraphic);
    });
  }

  private renderSpawnPoints(layout: ResolvedFestivalLayout): void {
    if (!this.debugToggles.showSpawnPoints) {
      return;
    }

    layout.spawnPoints.forEach((spawnPoint) => {
      const marker = new Container();
      const body = new Graphics();
      body.circle(0, 0, 10);
      body.fill(0xfff3b0);
      marker.addChild(body);

      const arrowLength = 26;
      const arrowTipX = spawnPoint.directionVector.x * arrowLength;
      const arrowTipY = spawnPoint.directionVector.y * arrowLength;
      const shaft = new Graphics();
      shaft.moveTo(0, 0);
      shaft.lineTo(arrowTipX, arrowTipY);
      shaft.stroke({ color: 0x171717, width: 3 });

      const head = new Graphics();
      head.moveTo(arrowTipX, arrowTipY);
      head.lineTo(arrowTipX - spawnPoint.directionVector.y * 6, arrowTipY + spawnPoint.directionVector.x * 6);
      head.lineTo(arrowTipX + spawnPoint.directionVector.y * 6, arrowTipY - spawnPoint.directionVector.x * 6);
      head.closePath();
      head.fill(0x171717);

      marker.addChild(shaft);
      marker.addChild(head);
      marker.position.set(spawnPoint.screenPosition.x, spawnPoint.screenPosition.y);
      this.layerSet.debugLayer.addChild(marker);
    });
  }

  private getTexture(path: string, kind: "background" | "stage"): Texture | null {
    const candidates = getAssetCandidatePaths(kind, path);
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
