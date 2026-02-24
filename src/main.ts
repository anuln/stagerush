import { Application } from "pixi.js";
import { createDebugToggles } from "./debug/DebugToggles";
import { GameManager } from "./game/GameManager";
import { resolveLevelRuntimeConfig } from "./game/LevelProgression";
import { GameRuntime } from "./game/GameRuntime";
import { loadFestivalMap, resolveFestivalLayout, type ResolvedFestivalLayout } from "./maps/MapLoader";
import { MapRenderer } from "./maps/MapRenderer";
import { createLayerSet } from "./maps/layers";
import { RunPersistence } from "./persistence/RunPersistence";
import { ScreenOverlayController } from "./ui/ScreenOverlayController";
import { buildScreenViewModel } from "./ui/ScreenViewModels";
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
  const runPersistence = new RunPersistence();
  const screenOverlay = new ScreenOverlayController();
  let gameManager: GameManager | null = null;
  let activePointerId: number | null = null;

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
    gameManager?.onLayoutChanged(nextLayout);
  };

  try {
    const map = await loadFestivalMap("/assets/maps/govball/config.json");
    currentLayout = resolveFestivalLayout(map, {
      width: app.renderer.width,
      height: app.renderer.height
    });
    mapRenderer.render(currentLayout);
    gameManager = new GameManager({
      layout: currentLayout,
      persistence: runPersistence,
      createRuntime: (levelNumber, attemptNumber) =>
        new GameRuntime(
          currentLayout!,
          layerSet,
          resolveLevelRuntimeConfig(
            currentLayout!.map,
            levelNumber,
            attemptNumber
          )
        )
    });
    screenOverlay.render(
      buildScreenViewModel(gameManager.snapshot),
      (actionId) => gameManager?.handleScreenAction(actionId)
    );
  } catch (error) {
    console.error("Failed to load map configuration", error);
  }

  window.addEventListener("resize", redraw);

  function toCanvasPoint(event: PointerEvent): { x: number; y: number } {
    const rect = app.canvas.getBoundingClientRect();
    const scaleX = app.renderer.width / rect.width;
    const scaleY = app.renderer.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  }

  app.canvas.addEventListener("pointerdown", (event) => {
    if (activePointerId !== null) {
      return;
    }
    const point = toCanvasPoint(event);
    const consumed =
      gameManager?.onPointerDown(point.x, point.y, performance.now()) ?? false;
    if (!consumed) {
      return;
    }
    activePointerId = event.pointerId;
    app.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  app.canvas.addEventListener("pointermove", (event) => {
    if (activePointerId !== event.pointerId) {
      return;
    }
    const point = toCanvasPoint(event);
    gameManager?.onPointerMove(point.x, point.y);
    event.preventDefault();
  });

  const finishPointer = (event: PointerEvent, cancelled: boolean): void => {
    if (activePointerId !== event.pointerId) {
      return;
    }
    const point = toCanvasPoint(event);
    if (cancelled) {
      gameManager?.onPointerCancel(performance.now());
    } else {
      gameManager?.onPointerUp(point.x, point.y, performance.now());
    }
    if (app.canvas.hasPointerCapture(event.pointerId)) {
      app.canvas.releasePointerCapture(event.pointerId);
    }
    activePointerId = null;
    event.preventDefault();
  };

  app.canvas.addEventListener("pointerup", (event) => finishPointer(event, false));
  app.canvas.addEventListener("pointercancel", (event) => finishPointer(event, true));

  app.ticker.add((ticker) => {
    gameManager?.update(ticker.deltaMS / 1000, {
      width: app.renderer.width,
      height: app.renderer.height
    }, performance.now());

    screenOverlay.render(
      gameManager ? buildScreenViewModel(gameManager.snapshot) : null,
      (actionId) => gameManager?.handleScreenAction(actionId)
    );
  });
}

void bootstrap();
