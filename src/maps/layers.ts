import { Container } from "pixi.js";

export interface LayerSet {
  mapLayer: Container;
  atmosphereLayer: Container;
  stageLayer: Container;
  distractionLayer: Container;
  pathLayer: Container;
  artistLayer: Container;
  debugLayer: Container;
  uiLayer: Container;
}

export function createLayerSet(root: Container): LayerSet {
  const mapLayer = new Container();
  mapLayer.label = "mapLayer";

  const atmosphereLayer = new Container();
  atmosphereLayer.label = "atmosphereLayer";

  const stageLayer = new Container();
  stageLayer.label = "stageLayer";

  const distractionLayer = new Container();
  distractionLayer.label = "distractionLayer";

  const pathLayer = new Container();
  pathLayer.label = "pathLayer";

  const artistLayer = new Container();
  artistLayer.label = "artistLayer";

  const debugLayer = new Container();
  debugLayer.label = "debugLayer";

  const uiLayer = new Container();
  uiLayer.label = "uiLayer";

  root.addChild(mapLayer);
  root.addChild(atmosphereLayer);
  root.addChild(stageLayer);
  root.addChild(distractionLayer);
  root.addChild(pathLayer);
  root.addChild(artistLayer);
  root.addChild(debugLayer);
  root.addChild(uiLayer);

  return {
    mapLayer,
    atmosphereLayer,
    stageLayer,
    distractionLayer,
    pathLayer,
    artistLayer,
    debugLayer,
    uiLayer
  };
}
