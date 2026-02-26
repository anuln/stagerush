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
  nowMs?: () => number;
}

interface SfxPlayOptions {
  category?: "tactical" | "momentum" | "hero";
  cooldownMs?: number;
}

export class AudioManager {
  private cues: Record<string, string>;
  private readonly createPlayer: () => AudioPlayer | null;
  private readonly schedule: AudioManagerOptions["schedule"];
  private readonly cancelSchedule: AudioManagerOptions["cancelSchedule"];
  private readonly nowMs: () => number;
  private muted = false;
  private appActive = true;
  private activeMusicCue: string | null = null;
  private activeMusicPlayer: AudioPlayer | null = null;
  private pendingMusicCue: string | null = null;
  private fadeOutHandles: Array<ReturnType<typeof setTimeout>> = [];
  private fadeInHandles: Array<ReturnType<typeof setTimeout>> = [];
  private mix: AudioMixSettings = {
    masterVolume: 1,
    musicVolume: 0.85,
    sfxVolume: 0.95,
    musicFadeMs: 0
  };
  private readonly cueCategoryGain = {
    tactical: 1,
    momentum: 1.06,
    hero: 1.12
  } as const;
  private readonly cueSpecificGain: Record<string, number> = {
    level_complete: 0.82,
    fireworks: 0.9
  };
  private readonly cueCooldownUntil = new Map<string, number>();

  constructor(cues: Record<string, string>, options: AudioManagerOptions = {}) {
    this.cues = { ...cues };
    this.createPlayer = options.createPlayer ?? defaultCreatePlayer;
    this.schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.cancelSchedule = options.cancelSchedule ?? ((handle) => clearTimeout(handle));
    this.nowMs =
      options.nowMs ??
      (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  }

  setMuted(nextMuted: boolean): void {
    this.muted = nextMuted;
    if (this.activeMusicPlayer) {
      this.activeMusicPlayer.volume = this.muted ? 0 : this.resolveMusicVolume();
    }
  }

  setAppActive(nextActive: boolean): void {
    if (this.appActive === nextActive) {
      return;
    }
    this.appActive = nextActive;
    if (!this.appActive) {
      this.clearFadeGroup("in");
      this.clearFadeGroup("out");
      if (this.activeMusicPlayer) {
        this.activeMusicPlayer.pause();
      }
      this.pendingMusicCue = this.activeMusicCue;
      return;
    }

    if (this.pendingMusicCue && this.pendingMusicCue !== this.activeMusicCue) {
      const cue = this.pendingMusicCue;
      this.pendingMusicCue = null;
      void this.playMusic(cue);
      return;
    }

    if (this.activeMusicPlayer && this.activeMusicCue) {
      this.activeMusicPlayer.volume = this.muted ? 0 : this.resolveMusicVolume();
      void Promise.resolve(this.activeMusicPlayer.play()).catch(() => {
        // Ignore autoplay failures when tab regains focus.
      });
      this.pendingMusicCue = null;
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

  setMixProfile(profileId: "festival_default" | "festival_soft" | "festival_peak"): void {
    if (profileId === "festival_soft") {
      this.setMix({ musicVolume: 0.72, sfxVolume: 0.82 });
      return;
    }
    if (profileId === "festival_peak") {
      this.setMix({ musicVolume: 0.9, sfxVolume: 0.98 });
      return;
    }
    this.setMix({ musicVolume: 0.85, sfxVolume: 0.95 });
  }

  setCues(nextCues: Record<string, string>): void {
    const previousCue = this.activeMusicCue;
    const previousPath = previousCue ? this.cues[previousCue] : null;
    this.cues = { ...nextCues };
    if (!previousCue) {
      return;
    }
    const nextPath = this.cues[previousCue] ?? null;
    if (!nextPath) {
      this.stopMusic();
      return;
    }
    if (previousPath !== nextPath) {
      if (this.activeMusicPlayer) {
        this.activeMusicPlayer.pause();
        this.activeMusicPlayer.currentTime = 0;
      }
      this.activeMusicCue = null;
      this.activeMusicPlayer = null;
      void this.playMusic(previousCue);
    }
  }

  async playSfx(cueId: string, options: SfxPlayOptions = {}): Promise<boolean> {
    const cue = this.cues[cueId];
    if (!cue) {
      return false;
    }
    return this.playSfxPath(cue, cueId, options);
  }

  async playSfxFromPath(
    path: string,
    options: SfxPlayOptions = {}
  ): Promise<boolean> {
    const trimmed = path.trim();
    if (!trimmed) {
      return false;
    }
    return this.playSfxPath(trimmed, `direct:${trimmed}`, options);
  }

  private async playSfxPath(
    path: string,
    cueKey: string,
    options: SfxPlayOptions = {}
  ): Promise<boolean> {
    if (!this.appActive) {
      return false;
    }
    const now = this.nowMs();
    const cooldownMs = Math.max(
      0,
      Math.floor(
        options.cooldownMs ??
          (options.category === "hero" ? 850 : cueKey === "timer_warning" ? 300 : 0)
      )
    );
    const key = `${options.category ?? "tactical"}:${cueKey}`;
    if ((this.cueCooldownUntil.get(key) ?? 0) > now) {
      return false;
    }
    if (cooldownMs > 0) {
      this.cueCooldownUntil.set(key, now + cooldownMs);
    }

    const player = this.createPlayer();
    if (!player) {
      return false;
    }

    player.src = resolveAssetPath(path);
    player.loop = false;
    player.currentTime = 0;
    player.volume = this.muted
      ? 0
      : this.resolveSfxVolume(cueKey, options.category);

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

    if (!this.appActive) {
      this.pendingMusicCue = cueId;
      if (
        this.activeMusicPlayer &&
        this.activeMusicCue &&
        this.activeMusicCue !== cueId
      ) {
        this.activeMusicPlayer.pause();
        this.activeMusicPlayer.currentTime = 0;
        this.activeMusicPlayer = null;
      } else if (this.activeMusicPlayer) {
        this.activeMusicPlayer.pause();
      }
      this.activeMusicCue = cueId;
      return true;
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
    this.pendingMusicCue = null;
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

  private resolveSfxVolume(
    cueId: string,
    category: SfxPlayOptions["category"] = "tactical"
  ): number {
    const pressureBoost = cueId === "timer_warning" ? 1.08 : 1;
    const cueGain = this.cueSpecificGain[cueId] ?? 1;
    return clamp01(
      this.mix.masterVolume *
        this.mix.sfxVolume *
        pressureBoost *
        this.cueCategoryGain[category] *
        cueGain
    );
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
