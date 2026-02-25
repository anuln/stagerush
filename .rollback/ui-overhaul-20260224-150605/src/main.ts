import { Application } from "pixi.js";
import { BundleManager } from "./assets/BundleManager";
import {
  BOOT_BUNDLE_MANIFEST,
  GOVBALL_BUNDLE_ID,
  GOVBALL_MAP_CONFIG_PATH,
  createGovBallBundleManifest
} from "./assets/manifest";
import {
  applyAdminAssetOverrides,
  clearAdminAssetOverrides,
  isAdminModeEnabled,
  loadAdminAssetOverrides,
  saveAdminAssetOverrides
} from "./admin/AdminAssetOverrides";
import { AudioManager } from "./audio/AudioManager";
import {
  GAME_CONFIG,
  getQualityPreset,
  rollQualityTier,
  type QualityTier
} from "./config/GameConfig";
import { createDebugToggles } from "./debug/DebugToggles";
import {
  PerformanceOverlay,
  type RuntimeTelemetrySnapshot as OverlayTelemetrySnapshot
} from "./debug/PerformanceOverlay";
import { GameManager } from "./game/GameManager";
import { resolveLevelRuntimeConfig } from "./game/LevelProgression";
import {
  GameRuntime,
  type RuntimeTelemetrySnapshot as GameRuntimeTelemetrySnapshot
} from "./game/GameRuntime";
import { loadFestivalMap, resolveFestivalLayout, type ResolvedFestivalLayout } from "./maps/MapLoader";
import { MapRenderer } from "./maps/MapRenderer";
import { createLayerSet } from "./maps/layers";
import { RunPersistence } from "./persistence/RunPersistence";
import type { ScreenActionId } from "./ui/ScreenState";
import { AdminPanel } from "./ui/AdminPanel";
import { KioskModeController } from "./ui/KioskModeController";
import { ScreenOverlayController } from "./ui/ScreenOverlayController";
import { buildScreenViewModel } from "./ui/ScreenViewModels";
import "./styles.css";

declare global {
  interface Window {
    render_game_to_text?: () => string;
  }
}

function isMobileUserAgent(): boolean {
  return /Mobi|Android/i.test(navigator.userAgent);
}

function parsePerformanceFlags(): {
  showOverlay: boolean;
  autoQuality: boolean;
} {
  const params = new URLSearchParams(window.location.search);
  return {
    showOverlay: params.get("perf") === "1",
    autoQuality: params.get("quality") === "auto"
  };
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total / values.length;
}

function applyQualityResolution(
  app: Application,
  qualityTier: QualityTier,
  baseResolution: number
): void {
  const targetResolution = Math.max(
    0.5,
    baseResolution * getQualityPreset(qualityTier).resolutionScale
  );
  app.renderer.resize(window.innerWidth, window.innerHeight, targetResolution);
}

async function bootstrap(): Promise<void> {
  const isMobile = isMobileUserAgent();
  const adminMode = isAdminModeEnabled();
  const perfFlags = parsePerformanceFlags();
  const dpr = window.devicePixelRatio || 1;
  const baseResolution = isMobile ? Math.min(dpr, 1.5) : dpr;
  let qualityTier: QualityTier = "high";
  let lowFpsWindows = 0;
  let highFpsWindows = 0;
  const fpsSamples: number[] = [];
  let latestRuntimeTelemetry: GameRuntimeTelemetrySnapshot | null = null;

  const app = new Application();
  await app.init({
    resizeTo: window,
    autoDensity: true,
    resolution: baseResolution,
    powerPreference: isMobile ? "low-power" : "high-performance",
    backgroundAlpha: 1,
    backgroundColor: 0x1a1a2e
  });
  applyQualityResolution(app, qualityTier, baseResolution);

  document.body.appendChild(app.canvas);
  const layerSet = createLayerSet(app.stage);
  const debugToggles = createDebugToggles();
  const performanceOverlay = new PerformanceOverlay(perfFlags.showOverlay);
  const mapRenderer = new MapRenderer(layerSet, debugToggles);
  const runPersistence = new RunPersistence();
  const bundleManager = new BundleManager([BOOT_BUNDLE_MANIFEST]);
  const screenOverlay = new ScreenOverlayController();
  const kioskController = new KioskModeController({
    onHome: () => runScreenAction("RETURN_TO_MENU")
  });
  let gameManager: GameManager | null = null;
  let audioManager: AudioManager | null = null;
  let activePointerId: number | null = null;
  let isScreenActionPending = false;
  let hasFestivalManifest = false;

  let currentLayout: ResolvedFestivalLayout | null = null;

  const runScreenAction = async (actionId: ScreenActionId): Promise<void> => {
    if (!gameManager || isScreenActionPending) {
      return;
    }

    isScreenActionPending = true;
    try {
      if (
        hasFestivalManifest &&
        (actionId === "START_FESTIVAL" ||
          actionId === "RETRY_LEVEL" ||
          actionId === "NEXT_LEVEL")
      ) {
        await bundleManager.loadBundle(GOVBALL_BUNDLE_ID);
      }

      gameManager.handleScreenAction(actionId);

      if (hasFestivalManifest && actionId === "RETURN_TO_MENU") {
        await bundleManager.unloadBundle(GOVBALL_BUNDLE_ID);
        audioManager?.stopMusic();
      }
    } catch (error) {
      console.error("Failed to run screen action", error);
    } finally {
      isScreenActionPending = false;
    }
  };

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
    await bundleManager.loadBundle(BOOT_BUNDLE_MANIFEST.id);
    const sourceMap = await loadFestivalMap(GOVBALL_MAP_CONFIG_PATH);
    const initialOverrides = adminMode ? loadAdminAssetOverrides() : {};
    const map = adminMode
      ? applyAdminAssetOverrides(sourceMap, initialOverrides)
      : sourceMap;
    bundleManager.registerManifest(createGovBallBundleManifest(map));
    hasFestivalManifest = true;
    audioManager = new AudioManager(map.assets.audio);
    const settings = runPersistence.getSnapshot().settings;
    audioManager.setMix({
      musicVolume: settings.musicVolume,
      sfxVolume: settings.sfxVolume,
      musicFadeMs: 220
    });
    currentLayout = resolveFestivalLayout(map, {
      width: app.renderer.width,
      height: app.renderer.height
    });
    mapRenderer.render(currentLayout);
    gameManager = new GameManager({
      layout: currentLayout,
      persistence: runPersistence,
      onScreenChanged: (next) => {
        if (next === "MENU") {
          audioManager?.stopMusic();
        }
      },
      createRuntime: (levelNumber, attemptNumber) =>
        new GameRuntime(
          currentLayout!,
          layerSet,
          resolveLevelRuntimeConfig(
            currentLayout!.map,
            levelNumber,
            attemptNumber
          ),
          {
            artistSprites: currentLayout!.map.assets.artists,
            audioManager,
            onTelemetry: (snapshot) => {
              latestRuntimeTelemetry = snapshot;
            },
            getEffectsDensity: () => getQualityPreset(qualityTier).effectsDensity
          }
        )
    });
    screenOverlay.render(
      buildScreenViewModel(gameManager.snapshot),
      (actionId) => {
        void runScreenAction(actionId);
      }
    );

    if (adminMode) {
      new AdminPanel({
        map: sourceMap,
        initialOverrides,
        onApply: (nextOverrides) => {
          saveAdminAssetOverrides(nextOverrides);
          window.location.reload();
        },
        onReset: () => {
          clearAdminAssetOverrides();
          window.location.reload();
        }
      });
    }
  } catch (error) {
    console.error("Failed to load map configuration", error);
  }

  window.render_game_to_text = () => {
    const snapshot = gameManager?.snapshot ?? null;
    const overlayElement = document.querySelector<HTMLDivElement>(".screen-overlay");
    const overlayVisible = overlayElement
      ? !overlayElement.classList.contains("is-hidden")
      : false;
    return JSON.stringify(
      {
        screen: snapshot?.screen ?? "UNINITIALIZED",
        levelState: snapshot?.level.state ?? null,
        levelNumber: snapshot?.level.currentLevel ?? null,
        overlayVisible,
        primaryActionLabel:
          document.querySelector<HTMLButtonElement>(".screen-action.primary")
            ?.textContent ?? null
      },
      null,
      2
    );
  };

  window.addEventListener("resize", redraw);
  window.addEventListener("beforeunload", () => {
    performanceOverlay.dispose();
    kioskController.dispose();
  });

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
    const frameFps = ticker.deltaMS > 0 ? 1000 / ticker.deltaMS : 0;
    fpsSamples.push(frameFps);
    if (fpsSamples.length > GAME_CONFIG.performance.scaler.windowSizeFrames) {
      fpsSamples.shift();
    }
    const averageFps = average(fpsSamples);

    if (perfFlags.autoQuality && fpsSamples.length >= GAME_CONFIG.performance.scaler.windowSizeFrames) {
      if (averageFps < GAME_CONFIG.performance.scaler.degradeBelowFps) {
        lowFpsWindows += 1;
        highFpsWindows = 0;
      } else if (averageFps > GAME_CONFIG.performance.scaler.recoverAboveFps) {
        highFpsWindows += 1;
        lowFpsWindows = 0;
      } else {
        lowFpsWindows = 0;
        highFpsWindows = 0;
      }

      const nextTier = rollQualityTier({
        currentTier: qualityTier,
        averageFps,
        lowWindowCount: lowFpsWindows,
        highWindowCount: highFpsWindows
      });
      if (nextTier !== qualityTier) {
        qualityTier = nextTier;
        lowFpsWindows = 0;
        highFpsWindows = 0;
        applyQualityResolution(app, qualityTier, baseResolution);
        redraw();
      }
    }

    gameManager?.update(ticker.deltaMS / 1000, {
      width: app.renderer.width,
      height: app.renderer.height
    }, performance.now());

    const runtimeTelemetry = latestRuntimeTelemetry ?? {
      frameDeltaMs: ticker.deltaMS,
      updateDurationMs: 0,
      activeArtists: 0,
      spawnedArtists: 0,
      resolvedArtists: 0,
      activeDistractions: 0,
      activePaths: 0,
      runtimeOutcome: "ACTIVE" as const
    };
    const overlayTelemetry: OverlayTelemetrySnapshot = {
      ...runtimeTelemetry,
      qualityTier,
      rendererResolution: app.renderer.resolution,
      averageFps
    };
    performanceOverlay.update(overlayTelemetry);

    screenOverlay.render(
      gameManager ? buildScreenViewModel(gameManager.snapshot) : null,
      (actionId) => {
        void runScreenAction(actionId);
      }
    );
  });
}

void bootstrap();
