import { Container } from "pixi.js";
import { GAME_CONFIG } from "../config/GameConfig";
import { toRuntimeLevelConfig } from "../config/LevelConfig";
import { Artist } from "../entities/Artist";
import type { ArtistMissReason } from "../entities/ArtistState";
import type { HazardBlockedArtistSnapshot } from "../entities/HazardState";
import type { InProgressPathPreview, PathState } from "../entities/PathState";
import { PathDrawingInput } from "../input/PathDrawingInput";
import type { ResolvedFestivalLayout } from "../maps/MapLoader";
import type { LayerSet } from "../maps/layers";
import { ArtistRenderer } from "../rendering/ArtistRenderer";
import {
  DeliveryFeedbackRenderer,
  type MissEvent
} from "../rendering/DeliveryFeedbackRenderer";
import { DistractionRenderer } from "../rendering/DistractionRenderer";
import { EtaRenderer, type EtaOverlay } from "../rendering/EtaRenderer";
import {
  HazardOverlayRenderer,
  type HazardOverlayFrame
} from "../rendering/HazardOverlayRenderer";
import { HudRenderer } from "../rendering/HudRenderer";
import { PathRenderer, advancePathLifecycles } from "../rendering/PathRenderer";
import { PathFollower, type PathFollowUpdate } from "../systems/PathFollower";
import { CollisionSystem } from "../systems/CollisionSystem";
import { DistractionSystem } from "../systems/DistractionSystem";
import { SpawnSystem } from "../systems/SpawnSystem";
import { StageSystem } from "../systems/StageSystem";
import { TimerSystem } from "../systems/TimerSystem";
import { PathPlanner, type PlannedPath } from "./PathPlanner";
import { LivesState } from "./LivesState";
import { ScoreManager, type ScoreEvent } from "./ScoreManager";

interface RuntimeViewport {
  width: number;
  height: number;
}

export class GameRuntime {
  private layout: ResolvedFestivalLayout;
  private artists: Artist[] = [];
  private pathStates: PathState[] = [];
  private readonly levelNumber: number;
  private readonly spawnSystem: SpawnSystem;
  private readonly stageSystem: StageSystem;
  private readonly collisionSystem: CollisionSystem;
  private readonly distractionSystem: DistractionSystem;
  private readonly timerSystem = new TimerSystem();
  private readonly scoreManager = new ScoreManager();
  private readonly livesState = new LivesState(3);
  private readonly artistRenderer: ArtistRenderer;
  private readonly pathRenderer: PathRenderer;
  private readonly distractionRenderer: DistractionRenderer;
  private readonly etaRenderer: EtaRenderer;
  private readonly hazardOverlayRenderer: HazardOverlayRenderer;
  private readonly hudRenderer: HudRenderer;
  private readonly deliveryFeedbackRenderer: DeliveryFeedbackRenderer;
  private readonly pathFollower: PathFollower;
  private readonly pathInput: PathDrawingInput;
  private readonly pathPlanner: PathPlanner;
  private levelFailureReported = false;
  private nowMs: number = getNowMs();

  constructor(layout: ResolvedFestivalLayout, layerSet: LayerSet) {
    this.layout = layout;
    const runtimeLevel = toRuntimeLevelConfig(layout.map, 1);
    this.levelNumber = runtimeLevel.levelNumber;
    this.spawnSystem = new SpawnSystem(runtimeLevel, layout.spawnPoints);
    this.stageSystem = new StageSystem(
      layout.stages,
      GAME_CONFIG.stage.performanceDurationMs
    );
    this.collisionSystem = new CollisionSystem(
      GAME_CONFIG.hazards.collisionRadiusPx,
      GAME_CONFIG.hazards.chatDurationMs
    );
    this.distractionSystem = new DistractionSystem(
      layout.distractions,
      runtimeLevel.activeDistractionIds
    );
    this.artistRenderer = new ArtistRenderer(layerSet.artistLayer);
    this.pathRenderer = new PathRenderer(layerSet.pathLayer);
    this.distractionRenderer = new DistractionRenderer(layerSet.distractionLayer);

    const feedbackLayer = new Container();
    feedbackLayer.label = "deliveryFeedbackLayer";
    const hazardLayer = new Container();
    hazardLayer.label = "hazardOverlayLayer";
    const hudLayer = new Container();
    hudLayer.label = "hudLayer";
    const etaLayer = new Container();
    etaLayer.label = "etaLayer";
    layerSet.uiLayer.addChild(feedbackLayer, hazardLayer, hudLayer, etaLayer);

    this.etaRenderer = new EtaRenderer(etaLayer);
    this.hazardOverlayRenderer = new HazardOverlayRenderer(hazardLayer);
    this.hudRenderer = new HudRenderer(hudLayer);
    this.deliveryFeedbackRenderer = new DeliveryFeedbackRenderer(feedbackLayer);
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
    this.stageSystem.setStages(nextLayout.stages);
    this.distractionSystem.setDistractions(nextLayout.distractions);
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
    const missEvents: MissEvent[] = [];
    const scoreEvents: ScoreEvent[] = [];

    const activeArtists = this.artists.filter((artist) => artist.isActive());
    const spawned = this.spawnSystem.update(deltaSeconds, activeArtists);
    if (spawned.length > 0) {
      this.artists.push(...spawned);
    }

    const followUpdates = this.pathFollower.update(this.artists, deltaSeconds);
    const arrivals = this.applyPathFollowUpdates(followUpdates);
    for (const arrival of arrivals) {
      const artist = this.artists.find((entry) => entry.id === arrival.artistId);
      if (!artist) {
        continue;
      }
      this.stageSystem.handleArrival(artist, arrival.stageId, this.nowMs);
    }

    const collisionUpdate = this.collisionSystem.update(this.artists, this.nowMs);
    for (const started of collisionUpdate.started) {
      this.pathFollower.blockArtist(started.artistAId, "chat");
      this.pathFollower.blockArtist(started.artistBId, "chat");
    }
    for (const resolved of collisionUpdate.resolved) {
      const artistA = this.artists.find((entry) => entry.id === resolved.artistAId);
      const artistB = this.artists.find((entry) => entry.id === resolved.artistBId);
      if (artistA) {
        this.pathFollower.unblockArtist(artistA, "chat");
      }
      if (artistB) {
        this.pathFollower.unblockArtist(artistB, "chat");
      }
    }

    const distractionUpdate = this.distractionSystem.update(this.artists, this.nowMs);
    for (const started of distractionUpdate.started) {
      this.pathFollower.blockArtist(started.artistId, "distraction");
    }
    for (const resolved of distractionUpdate.resolved) {
      const artist = this.artists.find((entry) => entry.id === resolved.artistId);
      if (!artist) {
        continue;
      }
      this.pathFollower.unblockArtist(artist, "distraction");
    }

    for (const artist of this.artists) {
      if (!artist.isActive()) {
        this.pathFollower.clearArtist(artist.id);
        continue;
      }
      if (artist.state === "DRIFTING") {
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
        missEvents.push(this.buildMissEvent(artist, "bounds"));
      }
    }

    const timeoutEvents = this.timerSystem.update(this.artists, deltaSeconds);
    for (const event of timeoutEvents) {
      this.livesState.recordMiss();
      const artist = this.artists.find((entry) => entry.id === event.artistId);
      if (artist) {
        missEvents.push(this.buildMissEvent(artist, event.reason));
      }
    }

    const stageUpdate = this.stageSystem.update(this.nowMs);
    for (const delivery of stageUpdate.completedDeliveries) {
      scoreEvents.push(this.scoreManager.registerDelivery(delivery));
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
    this.cleanupPathStatesForResolvedArtists();

    const preview = this.buildPreview();
    const activeDistractions = this.distractionSystem.getActiveDistractions();
    this.distractionRenderer.render(activeDistractions);
    this.pathRenderer.render(this.pathStates, preview.path);
    this.hazardOverlayRenderer.render(
      this.buildHazardOverlayFrame(collisionUpdate.activeChats, activeDistractions)
    );
    this.deliveryFeedbackRenderer.render({
      nowMs: this.nowMs,
      scoreEvents,
      missEvents,
      stageSnapshots: this.stageSystem.getSnapshots(),
      viewport
    });
    this.hudRenderer.render({
      score: this.scoreManager.totalScore,
      remainingLives: this.livesState.remainingLives,
      levelNumber: this.levelNumber,
      viewportWidth: viewport.width
    });
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
    updates: PathFollowUpdate[]
  ): Array<{ artistId: string; stageId: string }> {
    if (updates.length === 0) {
      return [];
    }

    const completedPathIds = new Set<string>();
    const arrivals: Array<{ artistId: string; stageId: string }> = [];
    for (const update of updates) {
      const pathState = this.pathStates.find((path) => path.id === update.pathId);
      if (pathState) {
        pathState.consumedLength = update.consumedLength;
      }
      if (update.completed) {
        completedPathIds.add(update.pathId);
        arrivals.push({
          artistId: update.artistId,
          stageId: update.targetStageId
        });
      }
    }

    if (completedPathIds.size > 0) {
      this.pathStates = this.pathStates.filter(
        (path) => !completedPathIds.has(path.id)
      );
    }

    return arrivals;
  }

  private buildMissEvent(artist: Artist, reason: ArtistMissReason): MissEvent {
    return {
      artistId: artist.id,
      position: { ...artist.position },
      reason
    };
  }

  private cleanupPathStatesForResolvedArtists(): void {
    const activeArtistIds = new Set(
      this.artists.filter((artist) => artist.isActive()).map((artist) => artist.id)
    );
    this.pathStates = this.pathStates.filter((path) => {
      if (path.state === "INVALID_FADING") {
        return true;
      }
      return activeArtistIds.has(path.artistId);
    });
  }

  private buildHazardOverlayFrame(
    chatPairs: HazardOverlayFrame["chatPairs"],
    activeDistractions: ReturnType<DistractionSystem["getActiveDistractions"]>
  ): HazardOverlayFrame {
    const blockedArtists: HazardBlockedArtistSnapshot[] = this.artists
      .filter((artist) => artist.state === "CHATTING" || artist.state === "DISTRACTED")
      .map((artist) => {
        const reason: HazardBlockedArtistSnapshot["reason"] =
          artist.state === "CHATTING" ? "CHATTING" : "DISTRACTED";
        return {
          artistId: artist.id,
          position: { ...artist.position },
          reason
        };
      });

    return {
      chatPairs: chatPairs.map((pair) => ({
        artistA: pair.artistA,
        artistB: pair.artistB
      })),
      distractionZones: activeDistractions.map((distraction) => ({
        center: { ...distraction.screenPosition },
        radius: distraction.pixelRadius,
        active: true
      })),
      blockedArtists: blockedArtists.map((entry) => ({
        position: entry.position,
        reason: entry.reason
      }))
    };
  }
}

function getNowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
