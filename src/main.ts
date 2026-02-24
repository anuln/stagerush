import { Application, Graphics } from "pixi.js";
import { createDebugToggles } from "./debug/DebugToggles";
import { loadFestivalMap, resolveFestivalLayout, type ResolvedFestivalLayout } from "./maps/MapLoader";
import { MapRenderer } from "./maps/MapRenderer";
import { createLayerSet } from "./maps/layers";
import "./styles.css";

function isMobileUserAgent(): boolean {
  return /Mobi|Android/i.test(navigator.userAgent);
}

async function bootstrap(): Promise<void> {
  const isMobile = isMobileUserAgent();
  const dpr = window.devicePixelRatio || 1;
  const resolution = isMobile ? Math.min(dpr, 1.5) : dpr;

  const app = new Application();
  await app.init({
    resizeTo: window,
    autoDensity: true,
    resolution,
    powerPreference: isMobile ? "low-power" : "high-performance",
    backgroundAlpha: 1,
    backgroundColor: 0x1a1a2e
  });

  document.body.appendChild(app.canvas);
  const layerSet = createLayerSet(app.stage);
  const debugToggles = createDebugToggles();
  const mapRenderer = new MapRenderer(layerSet, debugToggles);

  const placeholder = new Graphics();
  placeholder.roundRect(24, 24, 140, 72, 12);
  placeholder.fill(0xff6b35);
  layerSet.debugLayer.addChild(placeholder);

  let currentLayout: ResolvedFestivalLayout | null = null;

  const redraw = (): void => {
    if (!currentLayout) {
      return;
    }
    const nextLayout = resolveFestivalLayout(currentLayout.map, {
      width: app.renderer.width,
      height: app.renderer.height
    });
    currentLayout = nextLayout;
    mapRenderer.render(nextLayout);
  };

  try {
    const map = await loadFestivalMap("/assets/maps/govball/config.json");
    currentLayout = resolveFestivalLayout(map, {
      width: app.renderer.width,
      height: app.renderer.height
    });
    mapRenderer.render(currentLayout);
  } catch (error) {
    console.error("Failed to load map configuration", error);
  }

  window.addEventListener("resize", redraw);

  let elapsedSeconds = 0;
  app.ticker.add((ticker) => {
    elapsedSeconds += ticker.deltaMS / 1000;
    if (elapsedSeconds > 3600) {
      elapsedSeconds = 0;
    }
  });
}

void bootstrap();
