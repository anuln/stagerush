import { Application } from "pixi.js";
import { BundleManager } from "./assets/BundleManager";
import {
  BOOT_BUNDLE_MANIFEST,
  FESTIVAL_INDEX_PATH,
  createFestivalBundleManifest
} from "./assets/manifest";
import {
  type AdminAssetOverrides,
  applyAdminAssetOverrides,
  clearAdminAssetOverrides,
  hasAdminAssetOverrides,
  isAdminModeEnabled,
  loadAdminAssetOverrides,
  saveAdminAssetOverrides
} from "./admin/AdminAssetOverrides";
import { AudioManager } from "./audio/AudioManager";
import type { FestivalMap } from "./config/FestivalConfig";
import {
  loadFestivalRegistry,
  type FestivalRegistry
} from "./config/FestivalRegistry";
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
import { resolveGameFrameLayout } from "./ui/GameFrameLayout";
import { KioskModeController } from "./ui/KioskModeController";
import { runScreenActionWithAssets } from "./ui/ScreenActionRunner";
import { ScreenOverlayController } from "./ui/ScreenOverlayController";
import { buildScreenViewModel } from "./ui/ScreenViewModels";
import { applyThemeToDocument, resolveThemePreset } from "./theme/ThemeResolver";
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

function shouldAutoPinScreen(actionId: ScreenActionId): boolean {
  return (
    actionId === "START_FESTIVAL" ||
    actionId === "RETRY_LEVEL" ||
    actionId === "NEXT_LEVEL"
  );
}

const FESTIVAL_SELECTION_STORAGE_KEY = "stagecall:selected-festival-id";

function resolveFestivalSelection(registry: FestivalRegistry): {
  selectedId: string;
  mapConfigPath: string;
  bundleId: string;
  festivals: Array<{ id: string; name: string }>;
} {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("festival");
  const fromStorage = window.localStorage.getItem(FESTIVAL_SELECTION_STORAGE_KEY);
  const fallback =
    registry.defaultFestivalId ?? registry.festivals[0]?.id ?? "";
  const requested = fromQuery || fromStorage || fallback;
  const selected =
    registry.festivals.find((entry) => entry.id === requested) ??
    registry.festivals[0];
  if (!selected) {
    throw new Error("Festival registry is empty");
  }

  window.localStorage.setItem(FESTIVAL_SELECTION_STORAGE_KEY, selected.id);

  return {
    selectedId: selected.id,
    mapConfigPath: selected.mapConfigPath,
    bundleId: selected.bundleId ?? `festival-${selected.id}`,
    festivals: registry.festivals.map((entry) => ({
      id: entry.id,
      name: entry.name
    }))
  };
}

function navigateToFestival(festivalId: string, adminMode: boolean): void {
  window.localStorage.setItem(FESTIVAL_SELECTION_STORAGE_KEY, festivalId);
  const params = new URLSearchParams(window.location.search);
  params.set("festival", festivalId);
  if (adminMode) {
    params.set("admin", "1");
  }
  const search = params.toString();
  window.location.search = search.length > 0 ? `?${search}` : "";
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

function parseCssPixels(value: string | null): number {
  if (!value) {
    return 0;
  }
  const parsed = Number.parseFloat(value.trim().replace("px", ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function readSafeAreaInsets(): { top: number; bottom: number } {
  const computed = window.getComputedStyle(document.documentElement);
  return {
    top: parseCssPixels(computed.getPropertyValue("--safe-top")),
    bottom: parseCssPixels(computed.getPropertyValue("--safe-bottom"))
  };
}

function applyQualityResolution(
  app: Application,
  qualityTier: QualityTier,
  baseResolution: number,
  viewport: { width: number; height: number }
): void {
  const targetResolution = Math.max(
    0.5,
    baseResolution * getQualityPreset(qualityTier).resolutionScale
  );
  app.renderer.resize(viewport.width, viewport.height, targetResolution);
}

async function bootstrap(): Promise<void> {
  const isMobile = isMobileUserAgent();
  const adminMode = isAdminModeEnabled();
  const perfFlags = parsePerformanceFlags();
  const dpr = window.devicePixelRatio || 1;
  const baseResolution = isMobile ? Math.min(dpr, 1.5) : dpr;
  const baseViewport = { width: 432, height: 768 };
  let qualityTier: QualityTier = "high";
  let lowFpsWindows = 0;
  let highFpsWindows = 0;
  const fpsSamples: number[] = [];
  let latestRuntimeTelemetry: GameRuntimeTelemetrySnapshot | null = null;

  const app = new Application();
  await app.init({
    width: baseViewport.width,
    height: baseViewport.height,
    autoDensity: true,
    resolution: baseResolution,
    powerPreference: isMobile ? "low-power" : "high-performance",
    backgroundAlpha: 1,
    backgroundColor: 0x1a1a2e
  });
  applyQualityResolution(app, qualityTier, baseResolution, baseViewport);

  const gameFrame = document.createElement("div");
  gameFrame.className = "game-frame";
  gameFrame.appendChild(app.canvas);
  document.body.appendChild(gameFrame);
  let frameScale = 1;
  const layoutGameFrame = (): void => {
    const frameLayout = resolveGameFrameLayout({
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      isMobile,
      baseWidth: baseViewport.width,
      baseHeight: baseViewport.height,
      desktopMaxScale: 1
    });
    frameScale = frameLayout.scale;
    app.canvas.style.width = `${frameLayout.displayWidth}px`;
    app.canvas.style.height = `${frameLayout.displayHeight}px`;
  };
  layoutGameFrame();

  const layerSet = createLayerSet(app.stage);
  const debugToggles = createDebugToggles();
  const performanceOverlay = new PerformanceOverlay(perfFlags.showOverlay);
  const mapRenderer = new MapRenderer(layerSet, debugToggles);
  const runPersistence = new RunPersistence();
  const bundleManager = new BundleManager([BOOT_BUNDLE_MANIFEST]);
  const screenOverlay = new ScreenOverlayController();
  const kioskController = new KioskModeController();
  let gameManager: GameManager | null = null;
  let audioManager: AudioManager | null = null;
  let activeTheme: ReturnType<typeof resolveThemePreset> | null = null;
  let activePointerId: number | null = null;
  let isScreenActionPending = false;
  let hasFestivalManifest = false;
  let activeBundleId = "";
  let activeFestivalId = "";
  let sourceMap: FestivalMap | null = null;

  let currentLayout: ResolvedFestivalLayout | null = null;

  const runScreenAction = async (actionId: ScreenActionId): Promise<void> => {
    if (!gameManager || isScreenActionPending) {
      return;
    }

    if (shouldAutoPinScreen(actionId)) {
      void kioskController.enterPinnedMode();
    }

    isScreenActionPending = true;
    try {
      await runScreenActionWithAssets(
        {
          hasFestivalManifest,
          bundleId: activeBundleId,
          gameManager,
          bundleManager,
          audioManager,
          redraw
        },
        actionId
      );
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

  const applyPreviewOverrides = async (
    nextOverrides: AdminAssetOverrides
  ): Promise<void> => {
    if (!sourceMap || !activeBundleId) {
      return;
    }
    const previewMap = hasAdminAssetOverrides(nextOverrides)
      ? applyAdminAssetOverrides(sourceMap, nextOverrides)
      : sourceMap;
    bundleManager.registerManifest(
      createFestivalBundleManifest(previewMap, activeBundleId)
    );
    await bundleManager.warmBundle(activeBundleId);
    currentLayout = resolveFestivalLayout(previewMap, {
      width: app.renderer.width,
      height: app.renderer.height
    });
    mapRenderer.render(currentLayout);
    gameManager?.onLayoutChanged(currentLayout);
  };

  try {
    await bundleManager.loadBundle(BOOT_BUNDLE_MANIFEST.id);
    const registry = await loadFestivalRegistry(FESTIVAL_INDEX_PATH);
    const selection = resolveFestivalSelection(registry);
    activeBundleId = selection.bundleId;
    activeFestivalId = selection.selectedId;

    sourceMap = await loadFestivalMap(selection.mapConfigPath);
    const initialOverrides = loadAdminAssetOverrides(activeFestivalId);
    const theme = resolveThemePreset({
      festivalId: sourceMap.id,
      themeId: sourceMap.themeId
    });
    activeTheme = theme;
    applyThemeToDocument(theme);
    const map = hasAdminAssetOverrides(initialOverrides)
      ? applyAdminAssetOverrides(sourceMap, initialOverrides)
      : sourceMap;
    bundleManager.registerManifest(
      createFestivalBundleManifest(map, activeBundleId)
    );
    hasFestivalManifest = true;
    audioManager = new AudioManager(map.assets.audio);
    audioManager.setMixProfile(
      (activeTheme?.audioMixProfile as "festival_default" | "festival_soft" | "festival_peak") ??
        "festival_default"
    );
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
        mapConfigPath: selection.mapConfigPath,
        festivals: selection.festivals,
        activeFestivalId,
        initialOverrides,
        onFestivalChange: (nextFestivalId) => {
          navigateToFestival(nextFestivalId, adminMode);
        },
        onPreviewChange: (nextOverrides) => {
          void applyPreviewOverrides(nextOverrides).catch((error) => {
            console.error("Failed to apply admin preview overrides", error);
          });
        },
        onApply: (nextOverrides) => {
          try {
            saveAdminAssetOverrides(activeFestivalId, nextOverrides);
            window.location.reload();
          } catch (error) {
            console.error("Failed to persist admin overrides", error);
            window.alert(
              "Unable to save overrides on this browser (likely storage limit). Try fewer inline assets or use file paths."
            );
          }
        },
        onReset: () => {
          clearAdminAssetOverrides(activeFestivalId);
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

  const handleResize = (): void => {
    layoutGameFrame();
    redraw();
  };
  window.addEventListener("resize", handleResize);
  window.addEventListener("beforeunload", () => {
    window.removeEventListener("resize", handleResize);
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
        applyQualityResolution(app, qualityTier, baseResolution, baseViewport);
        redraw();
      }
    }

    const safeInsets = readSafeAreaInsets();
    const safeInsetScale = frameScale > 0 ? frameScale : 1;
    gameManager?.update(
      ticker.deltaMS / 1000,
      {
        width: app.renderer.width,
        height: app.renderer.height,
        safeAreaTopPx: safeInsets.top / safeInsetScale,
        safeAreaBottomPx: safeInsets.bottom / safeInsetScale
      },
      performance.now()
    );

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
