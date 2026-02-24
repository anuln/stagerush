import { Container } from "pixi.js";

export interface LayerSet {
  mapLayer: Container;
  stageLayer: Container;
  artistLayer: Container;
  debugLayer: Container;
}

export function createLayerSet(root: Container): LayerSet {
  const mapLayer = new Container();
  mapLayer.label = "mapLayer";

  const stageLayer = new Container();
  stageLayer.label = "stageLayer";

  const artistLayer = new Container();
  artistLayer.label = "artistLayer";

  const debugLayer = new Container();
  debugLayer.label = "debugLayer";

  root.addChild(mapLayer);
  root.addChild(stageLayer);
  root.addChild(artistLayer);
  root.addChild(debugLayer);

  return {
    mapLayer,
    stageLayer,
    artistLayer,
    debugLayer
  };
}
