import { resolveAssetPath } from "../maps/MapLoader";

export interface AudioPlayer {
  src: string;
  loop: boolean;
  currentTime: number;
  volume: number;
  play(): Promise<void> | void;
  pause(): void;
}

interface AudioMixSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  musicFadeMs: number;
}

interface AudioManagerOptions {
  createPlayer?: () => AudioPlayer | null;
  schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  cancelSchedule?: (handle: ReturnType<typeof setTimeout>) => void;
}

export class AudioManager {
  private readonly cues: Record<string, string>;
  private readonly createPlayer: () => AudioPlayer | null;
  private readonly schedule: AudioManagerOptions["schedule"];
  private readonly cancelSchedule: AudioManagerOptions["cancelSchedule"];
  private muted = false;
  private activeMusicCue: string | null = null;
  private activeMusicPlayer: AudioPlayer | null = null;
  private fadeOutHandles: Array<ReturnType<typeof setTimeout>> = [];
  private fadeInHandles: Array<ReturnType<typeof setTimeout>> = [];
  private mix: AudioMixSettings = {
    masterVolume: 1,
    musicVolume: 0.85,
    sfxVolume: 0.95,
    musicFadeMs: 0
  };

  constructor(cues: Record<string, string>, options: AudioManagerOptions = {}) {
    this.cues = cues;
    this.createPlayer = options.createPlayer ?? defaultCreatePlayer;
    this.schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.cancelSchedule = options.cancelSchedule ?? ((handle) => clearTimeout(handle));
  }

  setMuted(nextMuted: boolean): void {
    this.muted = nextMuted;
    if (this.activeMusicPlayer) {
      this.activeMusicPlayer.volume = this.muted ? 0 : this.resolveMusicVolume();
    }
  }

  setMix(nextMix: Partial<AudioMixSettings>): void {
    this.mix = {
      masterVolume: clamp01(nextMix.masterVolume ?? this.mix.masterVolume),
      musicVolume: clamp01(nextMix.musicVolume ?? this.mix.musicVolume),
      sfxVolume: clamp01(nextMix.sfxVolume ?? this.mix.sfxVolume),
      musicFadeMs: Math.max(0, Math.floor(nextMix.musicFadeMs ?? this.mix.musicFadeMs))
    };
    if (this.activeMusicPlayer && !this.muted) {
      this.activeMusicPlayer.volume = this.resolveMusicVolume();
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
    player.volume = this.muted ? 0 : this.resolveSfxVolume(cueId);

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

    if (this.activeMusicPlayer && this.activeMusicPlayer !== player) {
      this.fadeOutAndStop(this.activeMusicPlayer);
    }

    this.activeMusicCue = cueId;
    this.activeMusicPlayer = player;
    player.src = resolveAssetPath(cue);
    player.loop = true;
    player.currentTime = 0;
    player.volume = this.muted ? 0 : this.mix.musicFadeMs > 0 ? 0 : this.resolveMusicVolume();

    try {
      await Promise.resolve(player.play());
      if (!this.muted) {
        this.fadeInMusic(player);
      }
      return true;
    } catch {
      return false;
    }
  }

  stopMusic(): void {
    this.clearFadeGroup("in");
    this.clearFadeGroup("out");
    if (!this.activeMusicPlayer) {
      return;
    }
    this.activeMusicPlayer.pause();
    this.activeMusicPlayer.currentTime = 0;
    this.activeMusicPlayer = null;
    this.activeMusicCue = null;
  }

  private resolveMusicVolume(): number {
    return clamp01(this.mix.masterVolume * this.mix.musicVolume);
  }

  private resolveSfxVolume(cueId: string): number {
    const pressureBoost = cueId === "timer_warning" ? 1.08 : 1;
    return clamp01(this.mix.masterVolume * this.mix.sfxVolume * pressureBoost);
  }

  private clearFadeGroup(group: "in" | "out"): void {
    const handles = group === "out" ? this.fadeOutHandles : this.fadeInHandles;
    for (const handle of handles) {
      this.cancelSchedule?.(handle);
    }
    if (group === "out") {
      this.fadeOutHandles = [];
      return;
    }
    this.fadeInHandles = [];
  }

  private fadeOutAndStop(player: AudioPlayer): void {
    this.clearFadeGroup("out");
    const durationMs = this.mix.musicFadeMs;
    if (durationMs <= 0 || this.muted) {
      player.pause();
      player.currentTime = 0;
      return;
    }
    const startVolume = clamp01(player.volume);
    const steps = 3;
    const stepMs = Math.max(12, Math.floor(durationMs / steps));
    for (let index = 1; index <= steps; index += 1) {
      const handle = this.schedule?.(() => {
        const progress = index / steps;
        player.volume = startVolume * (1 - progress);
        if (index === steps) {
          player.pause();
          player.currentTime = 0;
        }
      }, stepMs * index);
      if (handle !== undefined) {
        this.fadeOutHandles.push(handle);
      }
    }
  }

  private fadeInMusic(player: AudioPlayer): void {
    this.clearFadeGroup("in");
    const durationMs = this.mix.musicFadeMs;
    const targetVolume = this.resolveMusicVolume();
    if (durationMs <= 0) {
      player.volume = targetVolume;
      return;
    }
    const steps = 3;
    const stepMs = Math.max(12, Math.floor(durationMs / steps));
    for (let index = 1; index <= steps; index += 1) {
      const handle = this.schedule?.(() => {
        player.volume = targetVolume * (index / steps);
      }, stepMs * index);
      if (handle !== undefined) {
        this.fadeInHandles.push(handle);
      }
    }
  }
}

function defaultCreatePlayer(): AudioPlayer | null {
  if (typeof Audio === "undefined") {
    return null;
  }
  return new Audio();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0, Math.min(1, value));
}
