import { Container } from "pixi.js";
import type { AudioManager } from "../audio/AudioManager";
import type { ArtistSpriteConfig } from "../config/FestivalConfig";
import { GAME_CONFIG } from "../config/GameConfig";
import {
  toRuntimeLevelConfig,
  type RuntimeLevelConfig
} from "../config/LevelConfig";
import { Artist } from "../entities/Artist";
import type { ArtistMissReason } from "../entities/ArtistState";
import type { HazardBlockedArtistSnapshot } from "../entities/HazardState";
import type { InProgressPathPreview, PathState } from "../entities/PathState";
import { PathDrawingInput } from "../input/PathDrawingInput";
import type { ResolvedFestivalLayout } from "../maps/MapLoader";
import type { LayerSet } from "../maps/layers";
import { ArtistRenderer } from "../rendering/ArtistRenderer";
import { ComboFeedbackRenderer } from "../rendering/ComboFeedbackRenderer";
import {
  DeliveryFeedbackRenderer,
  type HazardFeedbackEvent,
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
import { ComboTracker } from "./ComboTracker";
import { ArtistProfilePool } from "./ArtistProfilePool";
import { PathPlanner, type PlannedPath } from "./PathPlanner";
import { LivesState } from "./LivesState";
import { ScoreManager, type ScoreEvent } from "./ScoreManager";

export interface RuntimeViewport {
  width: number;
  height: number;
  safeAreaTopPx?: number;
  safeAreaBottomPx?: number;
}

export type RuntimeOutcome = "ACTIVE" | "FAILED" | "COMPLETED";
export type PerformanceTier = "BRONZE" | "SILVER" | "GOLD";

export interface PerformanceTierInput {
  score: number;
  deliveredArtists: number;
}

export interface RuntimeStatus {
  levelNumber: number;
  dayNumber: number;
  sessionName: string;
  sessionIndexInDay: number;
  totalFestivalDays: number;
  sessionTargetSets: number;
  paceDeltaSets: number;
  levelScore: number;
  outcome: RuntimeOutcome;
  performanceTier: PerformanceTier | null;
  deliveredArtists: number;
  missedArtists: number;
  remainingLives: number;
  remainingTimeSeconds: number;
  totalArtists: number;
  spawnedArtists: number;
  resolvedArtists: number;
}

export interface RuntimeTelemetrySnapshot {
  frameDeltaMs: number;
  updateDurationMs: number;
  activeArtists: number;
  spawnedArtists: number;
  resolvedArtists: number;
  activeDistractions: number;
  activePaths: number;
  runtimeOutcome: RuntimeOutcome;
}

export interface GameRuntimeOptions {
  artistSprites?: ArtistSpriteConfig[];
  audioManager?: AudioManager | null;
  onTelemetry?: (snapshot: RuntimeTelemetrySnapshot) => void;
  getEffectsDensity?: () => number;
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
  private readonly comboTracker = new ComboTracker();
  private readonly scoreManager = new ScoreManager();
  private readonly livesState: LivesState;
  private readonly artistRenderer: ArtistRenderer;
  private readonly pathRenderer: PathRenderer;
  private readonly distractionRenderer: DistractionRenderer;
  private readonly etaRenderer: EtaRenderer;
  private readonly hazardOverlayRenderer: HazardOverlayRenderer;
  private readonly comboFeedbackRenderer: ComboFeedbackRenderer;
  private readonly hudRenderer: HudRenderer;
  private readonly deliveryFeedbackRenderer: DeliveryFeedbackRenderer;
  private readonly runtimeUiLayer: Container;
  private readonly pathFollower: PathFollower;
  private readonly pathInput: PathDrawingInput;
  private readonly pathPlanner: PathPlanner;
  private readonly runtimeLevel: RuntimeLevelConfig;
  private readonly artistSpriteProfiles: ArtistSpriteConfig[];
  private remainingLevelTimeSeconds = 0;
  private roundPerformanceTier: PerformanceTier | null = null;
  private deliveredArtists = 0;
  private missedArtists = 0;
  private levelFailureReported = false;
  private levelOutcome: RuntimeOutcome = "ACTIVE";
  private nowMs: number = getNowMs();
  private readonly audioManager: AudioManager | null;
  private readonly onTelemetry: ((snapshot: RuntimeTelemetrySnapshot) => void) | null;
  private readonly getEffectsDensity: (() => number) | null;
  private performingArtistIds = new Set<string>();
  private telemetrySnapshot: RuntimeTelemetrySnapshot = {
    frameDeltaMs: 0,
    updateDurationMs: 0,
    activeArtists: 0,
    spawnedArtists: 0,
    resolvedArtists: 0,
    activeDistractions: 0,
    activePaths: 0,
    runtimeOutcome: "ACTIVE"
  };
  private readonly stageSetCounts = new Map<string, number>();

  constructor(
    layout: ResolvedFestivalLayout,
    layerSet: LayerSet,
    runtimeLevelOverride?: RuntimeLevelConfig,
    options: GameRuntimeOptions = {}
  ) {
    this.layout = layout;
    const runtimeLevel =
      runtimeLevelOverride ?? toRuntimeLevelConfig(layout.map, 1);
    this.runtimeLevel = runtimeLevel;
    this.remainingLevelTimeSeconds = Math.max(
      0,
      runtimeLevel.levelDurationSeconds
    );
    this.livesState = new LivesState(runtimeLevel.maxEncounterStrikes);
    this.levelNumber = runtimeLevel.levelNumber;
    this.artistSpriteProfiles = options.artistSprites ?? layout.map.assets.artists;
    const artistProfilePool = new ArtistProfilePool(this.artistSpriteProfiles, {
      levelNumber: runtimeLevel.levelNumber
    });
    this.spawnSystem = new SpawnSystem(runtimeLevel, layout.spawnPoints, Math.random, {
      stages: layout.stages,
      viewport: layout.viewport,
      pickArtistProfileId: (tier) => artistProfilePool.pickProfileId(tier)
    });
    this.syncStageSetCounts(layout.stages.map((stage) => stage.id));
    this.stageSystem = new StageSystem(
      layout.stages,
      GAME_CONFIG.stage.performanceDurationMs
    );
    this.collisionSystem = new CollisionSystem(
      GAME_CONFIG.hazards.collisionRadiusPx,
      GAME_CONFIG.hazards.chatDurationMs,
      GAME_CONFIG.hazards.immunityCooldownMs
    );
    this.distractionSystem = new DistractionSystem(
      layout.distractions,
      runtimeLevel.activeDistractionIds,
      GAME_CONFIG.hazards.immunityCooldownMs
    );
    this.artistRenderer = new ArtistRenderer(
      layerSet.artistLayer,
      this.artistSpriteProfiles
    );
    this.pathRenderer = new PathRenderer(layerSet.pathLayer);
    this.distractionRenderer = new DistractionRenderer(layerSet.distractionLayer);

    this.runtimeUiLayer = new Container();
    this.runtimeUiLayer.label = "runtimeUiLayer";

    const feedbackLayer = new Container();
    feedbackLayer.label = "deliveryFeedbackLayer";
    const hazardLayer = new Container();
    hazardLayer.label = "hazardOverlayLayer";
    const comboLayer = new Container();
    comboLayer.label = "comboFeedbackLayer";
    const hudLayer = new Container();
    hudLayer.label = "hudLayer";
    const etaLayer = new Container();
    etaLayer.label = "etaLayer";
    this.runtimeUiLayer.addChild(
      feedbackLayer,
      hazardLayer,
      comboLayer,
      hudLayer,
      etaLayer
    );
    layerSet.uiLayer.addChild(this.runtimeUiLayer);

    this.etaRenderer = new EtaRenderer(etaLayer);
    this.hazardOverlayRenderer = new HazardOverlayRenderer(hazardLayer);
    this.comboFeedbackRenderer = new ComboFeedbackRenderer(comboLayer);
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
    this.audioManager = options.audioManager ?? null;
    this.onTelemetry = options.onTelemetry ?? null;
    this.getEffectsDensity = options.getEffectsDensity ?? null;
    void this.audioManager?.playMusic(resolveMusicCue(this.levelNumber));
  }

  onLayoutChanged(nextLayout: ResolvedFestivalLayout): void {
    this.layout = nextLayout;
    this.spawnSystem.setSpawnPoints(nextLayout.spawnPoints);
    this.spawnSystem.setStageTargets(nextLayout.stages);
    this.spawnSystem.setViewport(nextLayout.viewport);
    this.stageSystem.setStages(nextLayout.stages);
    this.distractionSystem.setDistractions(nextLayout.distractions);
    this.pathPlanner.setStages(nextLayout.stages);
    this.syncStageSetCounts(nextLayout.stages.map((stage) => stage.id));
  }

  onPointerDown(x: number, y: number, nowMs = getNowMs()): boolean {
    if (this.levelOutcome !== "ACTIVE") {
      return false;
    }
    this.nowMs = nowMs;
    const consumed = this.pathInput.pointerDown(x, y, nowMs);
    if (consumed) {
      this.playSfx("path_draw");
    }
    return consumed;
  }

  onPointerMove(x: number, y: number): void {
    if (this.levelOutcome !== "ACTIVE") {
      return;
    }
    this.pathInput.pointerMove(x, y);
  }

  onPointerUp(x: number, y: number, nowMs = getNowMs()): void {
    if (this.levelOutcome !== "ACTIVE") {
      return;
    }
    this.nowMs = nowMs;
    const session = this.pathInput.pointerUp(x, y, nowMs);
    if (!session) {
      return;
    }
    const planned = this.pathPlanner.finalizeSession(session);
    this.commitPlannedPath(planned);
  }

  onPointerCancel(nowMs = getNowMs()): void {
    if (this.levelOutcome !== "ACTIVE") {
      return;
    }
    this.nowMs = nowMs;
    this.pathInput.pointerCancel(nowMs);
  }

  update(deltaSeconds: number, viewport: RuntimeViewport, nowMs = getNowMs()): void {
    const updateStartedAtMs = getNowMs();
    if (this.levelOutcome !== "ACTIVE") {
      this.emitTelemetry(deltaSeconds, 0, 0);
      return;
    }

    this.nowMs = nowMs;
    this.remainingLevelTimeSeconds = Math.max(
      0,
      this.remainingLevelTimeSeconds - deltaSeconds
    );
    const missEvents: MissEvent[] = [];
    const scoreEvents: ScoreEvent[] = [];
    const hazardEvents: HazardFeedbackEvent[] = [];

    const activeArtists = this.artists.filter((artist) => artist.isActive());
    const spawned = this.spawnSystem.update(deltaSeconds, activeArtists);
    if (spawned.length > 0) {
      this.artists.push(...spawned);
      for (let index = 0; index < spawned.length; index += 1) {
        this.playSfx("spawn");
      }
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
      this.livesState.recordIncident();
      const artistA = this.artists.find((entry) => entry.id === started.artistAId);
      const artistB = this.artists.find((entry) => entry.id === started.artistBId);
      const center =
        artistA && artistB
          ? {
              x: (artistA.position.x + artistB.position.x) / 2,
              y: (artistA.position.y + artistB.position.y) / 2
            }
          : null;
      if (center) {
        hazardEvents.push({
          id: started.sessionId,
          type: "chat",
          position: center
        });
      }
      this.playSfx("chat");
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
      this.livesState.recordIncident();
      const artist = this.artists.find((entry) => entry.id === started.artistId);
      if (artist) {
        hazardEvents.push({
          id: `${started.artistId}-${started.distractionId}`,
          type: "distraction",
          position: { ...artist.position }
        });
      }
      this.playSfx("distraction");
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
      if (artist.state === "DRIFTING" || artist.state === "SPAWNING") {
        artist.updateDrift(deltaSeconds);
      }

      const boundsMissed = artist.checkBoundsAndMarkMissed({
        minX: 0,
        minY: 0,
        maxX: viewport.width,
        maxY: viewport.height
      });
      if (boundsMissed) {
        this.missedArtists += 1;
        this.comboTracker.breakAllChains();
        this.scoreManager.applyMissPenalty("bounds");
        missEvents.push(this.buildMissEvent(artist, "bounds"));
        this.playSfx("miss");
      }
    }

    const timeoutEvents = this.timerSystem.update(this.artists, deltaSeconds);
    for (const event of timeoutEvents) {
      const artist = this.artists.find((entry) => entry.id === event.artistId);
      if (artist) {
        this.missedArtists += 1;
        this.comboTracker.breakAllChains();
        this.scoreManager.applyMissPenalty(event.reason);
        missEvents.push(this.buildMissEvent(artist, event.reason));
        this.playSfx("miss");
      }
    }

    const stageUpdate = this.stageSystem.update(this.nowMs);
    for (const delivery of stageUpdate.completedDeliveries) {
      this.deliveredArtists += 1;
      this.stageSetCounts.set(
        delivery.stageId,
        (this.stageSetCounts.get(delivery.stageId) ?? 0) + 1
      );
      const combo = this.comboTracker.registerDelivery(
        delivery.stageId,
        delivery.completedAtMs
      );
      const scoreEvent = this.scoreManager.registerDelivery(delivery, combo);
      scoreEvents.push(scoreEvent);
      this.playSfx(scoreEvent.comboMultiplier > 1 ? "deliver_combo" : "deliver");
    }

    if (this.livesState.isLevelFailed && !this.levelFailureReported) {
      this.levelFailureReported = true;
      this.levelOutcome = "FAILED";
      this.playSfx("level_failed");
      console.warn("Level failed: encounter limit reached.");
    }

    this.pathStates = advancePathLifecycles(
      this.pathStates,
      this.nowMs,
      GAME_CONFIG.path.invalidFadeDurationMs
    );
    this.cleanupPathStatesForResolvedArtists();

    const stageSnapshots = this.stageSystem.getSnapshots();
    this.handlePerformanceStarts(stageSnapshots);
    const activeCombos = this.comboTracker.getActiveChains(this.nowMs);
    const strongestCombo = this.comboTracker.getHighestActiveChain(this.nowMs);
    const effectsDensity = clampEffectsDensity(this.getEffectsDensity?.() ?? 1);
    const preview = this.buildPreview();
    const activeDistractions = this.distractionSystem.getActiveDistractions();
    this.distractionRenderer.render(activeDistractions);
    this.pathRenderer.render(this.pathStates, preview.path);
    this.hazardOverlayRenderer.render(
      this.buildHazardOverlayFrame(collisionUpdate.activeChats, activeDistractions)
    );
    this.comboFeedbackRenderer.render({
      nowMs: this.nowMs,
      activeCombos: effectsDensity < 0.55 ? [] : activeCombos,
      stageSnapshots
    });
    const renderedScoreEvents =
      effectsDensity < 0.55
        ? scoreEvents.slice(-1)
        : effectsDensity < 0.8
          ? scoreEvents.slice(-2)
          : scoreEvents;
    const renderedMissEvents =
      effectsDensity < 0.55 ? missEvents.slice(-1) : missEvents;
    const renderedHazardEvents =
      effectsDensity < 0.55 ? hazardEvents.slice(-1) : hazardEvents;
    this.deliveryFeedbackRenderer.render({
      nowMs: this.nowMs,
      scoreEvents: renderedScoreEvents,
      missEvents: renderedMissEvents,
      hazardEvents: renderedHazardEvents,
      stageSnapshots,
      viewport
    });
    this.hudRenderer.render({
      score: this.scoreManager.totalScore,
      remainingLives: this.livesState.remainingLives,
      maxLives: this.runtimeLevel.maxEncounterStrikes,
      remainingTimeSeconds: this.remainingLevelTimeSeconds,
      sessionDurationSeconds: this.runtimeLevel.levelDurationSeconds,
      levelNumber: this.levelNumber,
      dayNumber: this.runtimeLevel.sessionDayNumber,
      sessionName: this.runtimeLevel.sessionName,
      setsPlayed: this.deliveredArtists,
      targetSets: this.runtimeLevel.sessionTargetSets,
      comboMultiplier: strongestCombo?.multiplier ?? null,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      safeAreaTopPx: viewport.safeAreaTopPx ?? 0,
      safeAreaBottomPx: viewport.safeAreaBottomPx ?? 0,
      stageProgress: this.buildStageSetProgress()
    });
    this.etaRenderer.render(preview.eta);
    this.artistRenderer.render(this.artists, this.nowMs);

    if (this.levelOutcome === "ACTIVE" && this.remainingLevelTimeSeconds <= 0) {
      this.roundPerformanceTier = resolvePerformanceTier({
        score: this.scoreManager.totalScore,
        deliveredArtists: this.deliveredArtists
      });
      this.levelOutcome = "COMPLETED";
      this.playSfx("level_complete");
    }

    this.emitTelemetry(
      deltaSeconds,
      Math.max(0, getNowMs() - updateStartedAtMs),
      activeDistractions.length
    );
  }

  getStatus(): RuntimeStatus {
    const resolvedArtists = this.artists.filter((artist) => !artist.isActive()).length;
    const elapsedSeconds = Math.max(
      0,
      this.runtimeLevel.levelDurationSeconds - this.remainingLevelTimeSeconds
    );
    const expectedSets =
      this.runtimeLevel.levelDurationSeconds > 0
        ? (this.runtimeLevel.sessionTargetSets * elapsedSeconds) /
          this.runtimeLevel.levelDurationSeconds
        : this.runtimeLevel.sessionTargetSets;
    const paceDeltaSets = this.deliveredArtists - expectedSets;
    return {
      levelNumber: this.levelNumber,
      dayNumber: this.runtimeLevel.sessionDayNumber,
      sessionName: this.runtimeLevel.sessionName,
      sessionIndexInDay: this.runtimeLevel.sessionIndexInDay,
      totalFestivalDays: this.runtimeLevel.totalFestivalDays,
      sessionTargetSets: this.runtimeLevel.sessionTargetSets,
      paceDeltaSets,
      levelScore: this.scoreManager.totalScore,
      outcome: this.levelOutcome,
      performanceTier: this.roundPerformanceTier,
      deliveredArtists: this.deliveredArtists,
      missedArtists: this.missedArtists,
      remainingLives: this.livesState.remainingLives,
      remainingTimeSeconds: this.remainingLevelTimeSeconds,
      totalArtists: this.spawnSystem.totalArtists,
      spawnedArtists: this.spawnSystem.spawnedArtists,
      resolvedArtists
    };
  }

  dispose(): void {
    this.pathInput.pointerCancel(this.nowMs);
    this.artistRenderer.render([], this.nowMs);
    this.pathRenderer.render([], null);
    this.distractionRenderer.render([]);
    this.hazardOverlayRenderer.render({
      chatPairs: [],
      distractionZones: [],
      blockedArtists: []
    });
    this.comboFeedbackRenderer.render({
      nowMs: this.nowMs,
      activeCombos: [],
      stageSnapshots: []
    });
    this.deliveryFeedbackRenderer.render({
      nowMs: this.nowMs,
      scoreEvents: [],
      missEvents: [],
      hazardEvents: [],
      stageSnapshots: [],
      viewport: this.layout.viewport
    });
    this.hudRenderer.render({
      score: 0,
      remainingLives: 0,
      maxLives: this.runtimeLevel.maxEncounterStrikes,
      remainingTimeSeconds: 0,
      sessionDurationSeconds: this.runtimeLevel.levelDurationSeconds,
      levelNumber: this.runtimeLevel.levelNumber,
      dayNumber: this.runtimeLevel.sessionDayNumber,
      sessionName: this.runtimeLevel.sessionName,
      setsPlayed: 0,
      targetSets: this.runtimeLevel.sessionTargetSets,
      comboMultiplier: null,
      viewportWidth: this.layout.viewport.width,
      viewportHeight: this.layout.viewport.height,
      safeAreaTopPx: 0,
      safeAreaBottomPx: 0,
      stageProgress: this.buildStageSetProgress()
    });
    this.etaRenderer.render(null);
    this.runtimeUiLayer.removeFromParent();
    this.runtimeUiLayer.destroy({ children: true });
    this.performingArtistIds.clear();
    this.emitTelemetry(0, 0, 0);
  }

  getTelemetrySnapshot(): RuntimeTelemetrySnapshot {
    return { ...this.telemetrySnapshot };
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

    const assignment = this.pathFollower.assignPath(artist, planned);
    this.pathStates = this.pathStates.filter(
      (path) => !(path.artistId === artist.id && path.state === "ACTIVE")
    );
    if (assignment === "assigned" || assignment === "queued") {
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
        if (update.targetStageId) {
          arrivals.push({
            artistId: update.artistId,
            stageId: update.targetStageId
          });
        }
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

  private playSfx(cueId: string): void {
    if (!this.audioManager) {
      return;
    }
    const category =
      cueId === "deliver_combo"
        ? "momentum"
        : cueId === "level_complete" || cueId === "level_failed"
          ? "hero"
          : "tactical";
    void this.audioManager.playSfx(cueId, { category });
  }

  private handlePerformanceStarts(
    stageSnapshots: ReturnType<StageSystem["getSnapshots"]>
  ): void {
    const currentPerformerIds = new Set<string>();
    for (const stage of stageSnapshots) {
      if (stage.currentArtistId) {
        currentPerformerIds.add(stage.currentArtistId);
      }
    }

    for (const artistId of currentPerformerIds) {
      if (this.performingArtistIds.has(artistId)) {
        continue;
      }
      this.playArtistPerformanceSound(artistId);
    }

    this.performingArtistIds = currentPerformerIds;
  }

  private playArtistPerformanceSound(artistId: string): void {
    if (!this.audioManager) {
      return;
    }
    const artist = this.artists.find((entry) => entry.id === artistId);
    if (!artist) {
      return;
    }

    const profile = this.resolveArtistProfileForArtist(artist);
    const clipPath = profile?.performanceAudio?.clip?.trim();
    if (clipPath) {
      const clipLengthSec = profile?.performanceAudio?.lengthSec;
      const cooldownMs = Number.isFinite(clipLengthSec)
        ? Math.max(300, Math.min(12_000, Math.floor((clipLengthSec as number) * 900)))
        : 850;
      void this.audioManager
        .playSfxFromPath(clipPath, {
          category: "hero",
          cooldownMs
        })
        .then((played) => {
          if (!played) {
            this.playSfx("deliver");
          }
        });
      return;
    }

    this.playSfx("deliver");
  }

  private resolveArtistProfileForArtist(artist: Artist): ArtistSpriteConfig | null {
    if (artist.spriteProfileId) {
      return (
        this.artistSpriteProfiles.find(
          (profile) => profile.id === artist.spriteProfileId
        ) ?? null
      );
    }
    return (
      this.artistSpriteProfiles.find((profile) => profile.tier === artist.tier) ??
      null
    );
  }

  private syncStageSetCounts(stageIds: string[]): void {
    const active = new Set(stageIds);
    for (const stageId of stageIds) {
      if (!this.stageSetCounts.has(stageId)) {
        this.stageSetCounts.set(stageId, 0);
      }
    }
    for (const stageId of this.stageSetCounts.keys()) {
      if (!active.has(stageId)) {
        this.stageSetCounts.delete(stageId);
      }
    }
  }

  private buildStageSetProgress(): Array<{
    stageId: string;
    deliveredSets: number;
    color: string;
    position: { x: number; y: number };
  }> {
    return this.layout.stages.map((stage) => ({
      stageId: stage.id,
      deliveredSets: this.stageSetCounts.get(stage.id) ?? 0,
      color: stage.color,
      position: {
        x: stage.screenPosition.x,
        y: stage.screenPosition.y
      }
    }));
  }

  private emitTelemetry(
    deltaSeconds: number,
    updateDurationMs: number,
    activeDistractions: number
  ): void {
    const activeArtists = this.artists.filter((artist) => artist.isActive()).length;
    const resolvedArtists = this.artists.length - activeArtists;
    const activePaths = this.pathStates.filter((path) => path.state === "ACTIVE").length;
    this.telemetrySnapshot = {
      frameDeltaMs: Math.max(0, deltaSeconds * 1000),
      updateDurationMs: Math.max(0, updateDurationMs),
      activeArtists,
      spawnedArtists: this.spawnSystem.spawnedArtists,
      resolvedArtists,
      activeDistractions,
      activePaths,
      runtimeOutcome: this.levelOutcome
    };
    this.onTelemetry?.(this.telemetrySnapshot);
  }
}

function resolveMusicCue(levelNumber: number): string {
  if (levelNumber <= 4) {
    return "bg_chill";
  }
  if (levelNumber <= 8) {
    return "bg_energy";
  }
  return "bg_peak";
}

export function resolvePerformanceTier(
  input: PerformanceTierInput
): PerformanceTier {
  const score = Math.max(0, Math.floor(input.score));
  const deliveries = Math.max(0, Math.floor(input.deliveredArtists));
  const tiers = GAME_CONFIG.round.performanceTiers;
  if (score >= tiers.gold.minScore && deliveries >= tiers.gold.minDeliveries) {
    return "GOLD";
  }
  if (
    score >= tiers.silver.minScore &&
    deliveries >= tiers.silver.minDeliveries
  ) {
    return "SILVER";
  }
  return "BRONZE";
}

function clampEffectsDensity(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0, Math.min(1, value));
}

function getNowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
