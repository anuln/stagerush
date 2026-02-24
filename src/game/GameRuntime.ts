import { toRuntimeLevelConfig } from "../config/LevelConfig";
import { Artist } from "../entities/Artist";
import type { ResolvedFestivalLayout } from "../maps/MapLoader";
import type { LayerSet } from "../maps/layers";
import { ArtistRenderer } from "../rendering/ArtistRenderer";
import { SpawnSystem } from "../systems/SpawnSystem";
import { TimerSystem } from "../systems/TimerSystem";
import { LivesState } from "./LivesState";

interface RuntimeViewport {
  width: number;
  height: number;
}

export class GameRuntime {
  private layout: ResolvedFestivalLayout;
  private artists: Artist[] = [];
  private readonly spawnSystem: SpawnSystem;
  private readonly timerSystem = new TimerSystem();
  private readonly livesState = new LivesState(3);
  private readonly artistRenderer: ArtistRenderer;
  private levelFailureReported = false;

  constructor(layout: ResolvedFestivalLayout, layerSet: LayerSet) {
    this.layout = layout;
    const runtimeLevel = toRuntimeLevelConfig(layout.map, 1);
    this.spawnSystem = new SpawnSystem(runtimeLevel, layout.spawnPoints);
    this.artistRenderer = new ArtistRenderer(layerSet.artistLayer);
  }

  onLayoutChanged(nextLayout: ResolvedFestivalLayout): void {
    this.layout = nextLayout;
    this.spawnSystem.setSpawnPoints(nextLayout.spawnPoints);
  }

  update(deltaSeconds: number, viewport: RuntimeViewport): void {
    const activeArtists = this.artists.filter((artist) => artist.isActive());
    const spawned = this.spawnSystem.update(deltaSeconds, activeArtists);
    if (spawned.length > 0) {
      this.artists.push(...spawned);
    }

    for (const artist of this.artists) {
      if (!artist.isActive()) {
        continue;
      }
      artist.updateDrift(deltaSeconds);

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

    this.artistRenderer.render(this.artists);
  }
}
