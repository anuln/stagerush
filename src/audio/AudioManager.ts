import { resolveAssetPath } from "../maps/MapLoader";

export interface AudioPlayer {
  src: string;
  loop: boolean;
  currentTime: number;
  volume: number;
  play(): Promise<void> | void;
  pause(): void;
}

interface AudioManagerOptions {
  createPlayer?: () => AudioPlayer | null;
}

export class AudioManager {
  private readonly cues: Record<string, string>;
  private readonly createPlayer: () => AudioPlayer | null;
  private muted = false;
  private activeMusicCue: string | null = null;
  private activeMusicPlayer: AudioPlayer | null = null;

  constructor(cues: Record<string, string>, options: AudioManagerOptions = {}) {
    this.cues = cues;
    this.createPlayer = options.createPlayer ?? defaultCreatePlayer;
  }

  setMuted(nextMuted: boolean): void {
    this.muted = nextMuted;
    if (this.activeMusicPlayer) {
      this.activeMusicPlayer.volume = this.muted ? 0 : 1;
    }
  }

  async playSfx(cueId: string): Promise<boolean> {
    const cue = this.cues[cueId];
    if (!cue) {
      return false;
    }

    const player = this.createPlayer();
    if (!player) {
      return false;
    }

    player.src = resolveAssetPath(cue);
    player.loop = false;
    player.currentTime = 0;
    player.volume = this.muted ? 0 : 1;

    try {
      await Promise.resolve(player.play());
      return true;
    } catch {
      return false;
    }
  }

  async playMusic(cueId: string): Promise<boolean> {
    const cue = this.cues[cueId];
    if (!cue) {
      return false;
    }

    if (this.activeMusicCue === cueId && this.activeMusicPlayer) {
      return true;
    }

    const player = this.createPlayer();
    if (!player) {
      return false;
    }

    if (this.activeMusicPlayer) {
      this.activeMusicPlayer.pause();
    }

    this.activeMusicCue = cueId;
    this.activeMusicPlayer = player;
    player.src = resolveAssetPath(cue);
    player.loop = true;
    player.currentTime = 0;
    player.volume = this.muted ? 0 : 1;

    try {
      await Promise.resolve(player.play());
      return true;
    } catch {
      return false;
    }
  }

  stopMusic(): void {
    if (!this.activeMusicPlayer) {
      return;
    }
    this.activeMusicPlayer.pause();
    this.activeMusicPlayer.currentTime = 0;
    this.activeMusicPlayer = null;
    this.activeMusicCue = null;
  }
}

function defaultCreatePlayer(): AudioPlayer | null {
  if (typeof Audio === "undefined") {
    return null;
  }
  return new Audio();
}
