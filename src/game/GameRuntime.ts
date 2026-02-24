import { GAME_CONFIG } from "../config/GameConfig";
import { toRuntimeLevelConfig } from "../config/LevelConfig";
import { Artist } from "../entities/Artist";
import type { InProgressPathPreview, PathState } from "../entities/PathState";
import { PathDrawingInput } from "../input/PathDrawingInput";
import type { ResolvedFestivalLayout } from "../maps/MapLoader";
import type { LayerSet } from "../maps/layers";
import { ArtistRenderer } from "../rendering/ArtistRenderer";
import { EtaRenderer, type EtaOverlay } from "../rendering/EtaRenderer";
import { PathRenderer, advancePathLifecycles } from "../rendering/PathRenderer";
import { PathFollower } from "../systems/PathFollower";
import { SpawnSystem } from "../systems/SpawnSystem";
import { TimerSystem } from "../systems/TimerSystem";
import { PathPlanner, type PlannedPath } from "./PathPlanner";
import { LivesState } from "./LivesState";

interface RuntimeViewport {
  width: number;
  height: number;
}

export class GameRuntime {
  private layout: ResolvedFestivalLayout;
  private artists: Artist[] = [];
  private pathStates: PathState[] = [];
  private readonly spawnSystem: SpawnSystem;
  private readonly timerSystem = new TimerSystem();
  private readonly livesState = new LivesState(3);
  private readonly artistRenderer: ArtistRenderer;
  private readonly pathRenderer: PathRenderer;
  private readonly etaRenderer: EtaRenderer;
  private readonly pathFollower: PathFollower;
  private readonly pathInput: PathDrawingInput;
  private readonly pathPlanner: PathPlanner;
  private levelFailureReported = false;
  private nowMs: number = getNowMs();

  constructor(layout: ResolvedFestivalLayout, layerSet: LayerSet) {
    this.layout = layout;
    const runtimeLevel = toRuntimeLevelConfig(layout.map, 1);
    this.spawnSystem = new SpawnSystem(runtimeLevel, layout.spawnPoints);
    this.artistRenderer = new ArtistRenderer(layerSet.artistLayer);
    this.pathRenderer = new PathRenderer(layerSet.pathLayer);
    this.etaRenderer = new EtaRenderer(layerSet.uiLayer);
    this.pathFollower = new PathFollower(runtimeLevel.driftSpeedPxPerSecond);
    this.pathInput = new PathDrawingInput(
      () => this.artists.filter((artist) => artist.isActive()),
      GAME_CONFIG.path.grabRadiusPx,
      () => this.nowMs
    );
    this.pathPlanner = new PathPlanner(layout.stages, {
      snapRadiusPx: GAME_CONFIG.path.snapRadiusPx,
      smoothingSteps: GAME_CONFIG.path.smoothingSteps,
      resampleSpacingPx: GAME_CONFIG.path.resampleSpacingPx
    });
  }

  onLayoutChanged(nextLayout: ResolvedFestivalLayout): void {
    this.layout = nextLayout;
    this.spawnSystem.setSpawnPoints(nextLayout.spawnPoints);
    this.pathPlanner.setStages(nextLayout.stages);
  }

  onPointerDown(x: number, y: number, nowMs = getNowMs()): boolean {
    this.nowMs = nowMs;
    return this.pathInput.pointerDown(x, y, nowMs);
  }

  onPointerMove(x: number, y: number): void {
    this.pathInput.pointerMove(x, y);
  }

  onPointerUp(x: number, y: number, nowMs = getNowMs()): void {
    this.nowMs = nowMs;
    const session = this.pathInput.pointerUp(x, y, nowMs);
    if (!session) {
      return;
    }
    const planned = this.pathPlanner.finalizeSession(session);
    this.commitPlannedPath(planned);
  }

  onPointerCancel(nowMs = getNowMs()): void {
    this.nowMs = nowMs;
    this.pathInput.pointerCancel(nowMs);
  }

  update(deltaSeconds: number, viewport: RuntimeViewport, nowMs = getNowMs()): void {
    this.nowMs = nowMs;
    const activeArtists = this.artists.filter((artist) => artist.isActive());
    const spawned = this.spawnSystem.update(deltaSeconds, activeArtists);
    if (spawned.length > 0) {
      this.artists.push(...spawned);
    }

    const followUpdates = this.pathFollower.update(this.artists, deltaSeconds);
    this.applyPathFollowUpdates(followUpdates);

    for (const artist of this.artists) {
      if (!artist.isActive()) {
        continue;
      }
      if (artist.state !== "FOLLOWING" && artist.state !== "ARRIVING") {
        artist.updateDrift(deltaSeconds);
      }

      const boundsMissed = artist.checkBoundsAndMarkMissed({
        minX: 0,
        minY: 0,
        maxX: viewport.width,
        maxY: viewport.height
      });
      if (boundsMissed) {
        this.livesState.recordMiss();
      }
    }

    const timeoutEvents = this.timerSystem.update(this.artists, deltaSeconds);
    for (const _event of timeoutEvents) {
      this.livesState.recordMiss();
    }

    if (this.livesState.isLevelFailed && !this.levelFailureReported) {
      this.levelFailureReported = true;
      console.warn("Level failed: 3 misses reached.");
    }

    this.pathStates = advancePathLifecycles(
      this.pathStates,
      this.nowMs,
      GAME_CONFIG.path.invalidFadeDurationMs
    );
    const preview = this.buildPreview();
    this.pathRenderer.render(this.pathStates, preview.path);
    this.etaRenderer.render(preview.eta);
    this.artistRenderer.render(this.artists);
  }

  private buildPreview(): {
    path: InProgressPathPreview | null;
    eta: EtaOverlay | null;
  } {
    const session = this.pathInput.getActiveSession();
    if (!session) {
      return { path: null, eta: null };
    }

    const preview = this.pathPlanner.previewSession({
      artistId: session.artistId,
      rawPoints: session.rawPoints,
      startedAtMs: session.startedAtMs,
      endedAtMs: this.nowMs
    });

    const artist = this.artists.find((entry) => entry.id === session.artistId);
    const etaSeconds = this.pathFollower.speedPxPerSecond > 0
      ? preview.length / this.pathFollower.speedPxPerSecond
      : Number.POSITIVE_INFINITY;

    return {
      path: {
        artistId: session.artistId,
        points: preview.smoothedPoints,
        color: preview.stageColor
      },
      eta: artist
        ? {
            position: { ...artist.position },
            etaSeconds,
            isWarning: etaSeconds > artist.timerRemainingSeconds
          }
        : null
    };
  }

  private commitPlannedPath(planned: PlannedPath): void {
    const artist = this.artists.find((entry) => entry.id === planned.artistId);
    if (!artist || !artist.isActive()) {
      return;
    }

    if (planned.isValid && planned.targetStageId) {
      this.pathFollower.assignPath(artist, planned);
      this.pathStates = this.pathStates.filter(
        (path) => !(path.artistId === artist.id && path.state === "ACTIVE")
      );
      this.pathStates.push({
        id: planned.pathId,
        artistId: planned.artistId,
        rawPoints: planned.rawPoints,
        smoothedPoints: planned.smoothedPoints,
        length: planned.length,
        targetStageId: planned.targetStageId,
        stageColor: planned.stageColor,
        state: "ACTIVE",
        consumedLength: 0,
        alpha: 1,
        createdAtMs: this.nowMs,
        expiresAtMs: null
      });
      return;
    }

    this.pathStates.push({
      id: planned.pathId,
      artistId: planned.artistId,
      rawPoints: planned.rawPoints,
      smoothedPoints: planned.smoothedPoints,
      length: planned.length,
      targetStageId: null,
      stageColor: "#8b8b8b",
      state: "INVALID_FADING",
      consumedLength: 0,
      alpha: 1,
      createdAtMs: this.nowMs,
      expiresAtMs: this.nowMs + GAME_CONFIG.path.invalidFadeDurationMs
    });
  }

  private applyPathFollowUpdates(
    updates: Array<{ pathId: string; consumedLength: number; completed: boolean }>
  ): void {
    if (updates.length === 0) {
      return;
    }

    const completedPathIds = new Set<string>();
    for (const update of updates) {
      const pathState = this.pathStates.find((path) => path.id === update.pathId);
      if (pathState) {
        pathState.consumedLength = update.consumedLength;
      }
      if (update.completed) {
        completedPathIds.add(update.pathId);
      }
    }

    if (completedPathIds.size > 0) {
      this.pathStates = this.pathStates.filter(
        (path) => !completedPathIds.has(path.id)
      );
    }
  }
}

function getNowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
