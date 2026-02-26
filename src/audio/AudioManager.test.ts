import { describe, expect, it, vi } from "vitest";
import { AudioManager, type AudioPlayer } from "./AudioManager";

interface FakeAudioPlayer extends AudioPlayer {
  playSpy: ReturnType<typeof vi.fn>;
  pauseSpy: ReturnType<typeof vi.fn>;
}

function makeFakePlayer(): FakeAudioPlayer {
  const player: FakeAudioPlayer = {
    src: "",
    loop: false,
    currentTime: 0,
    volume: 1,
    playSpy: vi.fn(),
    pauseSpy: vi.fn(),
    play() {
      this.playSpy();
      return Promise.resolve();
    },
    pause() {
      this.pauseSpy();
    }
  };
  return player;
}

describe("AudioManager", () => {
  it("plays known sfx cues and ignores unknown cues safely", async () => {
    const player = makeFakePlayer();
    const createPlayer = vi.fn(() => player);
    const manager = new AudioManager(
      { spawn: "audio/spawn.mp3" },
      { createPlayer }
    );

    await manager.playSfx("spawn");
    await manager.playSfx("missing");

    expect(createPlayer).toHaveBeenCalledTimes(1);
    expect(player.playSpy).toHaveBeenCalledTimes(1);
  });

  it("switches background music tracks cleanly", async () => {
    const players: FakeAudioPlayer[] = [];
    const manager = new AudioManager(
      { chill: "audio/chill.mp3", energy: "audio/energy.mp3" },
      {
        createPlayer: () => {
          const player = makeFakePlayer();
          players.push(player);
          return player;
        }
      }
    );

    await manager.playMusic("chill");
    await manager.playMusic("energy");

    expect(players).toHaveLength(2);
    expect(players[0].pauseSpy).toHaveBeenCalledTimes(1);
    expect(players[1].playSpy).toHaveBeenCalledTimes(1);
    expect(players[1].loop).toBe(true);
  });

  it("supports global mute toggle for future players", async () => {
    const player = makeFakePlayer();
    const manager = new AudioManager(
      { deliver: "audio/deliver.mp3" },
      { createPlayer: () => player }
    );
    manager.setMuted(true);

    await manager.playSfx("deliver");

    expect(player.volume).toBe(0);
  });

  it("applies independent music and sfx mix volumes", async () => {
    const players: FakeAudioPlayer[] = [];
    const manager = new AudioManager(
      {
        bg_chill: "audio/chill.mp3",
        chat: "audio/chat.mp3"
      },
      {
        createPlayer: () => {
          const player = makeFakePlayer();
          players.push(player);
          return player;
        }
      }
    );
    manager.setMix({
      masterVolume: 0.8,
      musicVolume: 0.5,
      sfxVolume: 0.25,
      musicFadeMs: 0
    });

    await manager.playMusic("bg_chill");
    await manager.playSfx("chat");

    expect(players[0].volume).toBeCloseTo(0.4, 5);
    expect(players[1].volume).toBeCloseTo(0.2, 5);
  });

  it("fades out previous music player when switching cues", async () => {
    vi.useFakeTimers();
    const players: FakeAudioPlayer[] = [];
    const manager = new AudioManager(
      { chill: "audio/chill.mp3", energy: "audio/energy.mp3" },
      {
        createPlayer: () => {
          const player = makeFakePlayer();
          players.push(player);
          return player;
        }
      }
    );
    manager.setMix({
      masterVolume: 1,
      musicVolume: 1,
      sfxVolume: 1,
      musicFadeMs: 150
    });

    await manager.playMusic("chill");
    await manager.playMusic("energy");

    expect(players[0].pauseSpy).toHaveBeenCalledTimes(0);
    await vi.runAllTimersAsync();
    expect(players[0].pauseSpy).toHaveBeenCalledTimes(1);
    expect(players[0].currentTime).toBe(0);
    vi.useRealTimers();
  });

  it("throttles repeated hero cues during cooldown window", async () => {
    let nowMs = 1000;
    const player = makeFakePlayer();
    const createPlayer = vi.fn(() => player);
    const manager = new AudioManager(
      { level_complete: "audio/level_complete.mp3" },
      { createPlayer, nowMs: () => nowMs }
    );

    await manager.playSfx("level_complete", { category: "hero", cooldownMs: 500 });
    await manager.playSfx("level_complete", { category: "hero", cooldownMs: 500 });
    nowMs += 550;
    await manager.playSfx("level_complete", { category: "hero", cooldownMs: 500 });

    expect(createPlayer).toHaveBeenCalledTimes(2);
  });

  it("applies mix profile presets to currently playing music", async () => {
    const player = makeFakePlayer();
    const manager = new AudioManager(
      { bg_chill: "audio/chill.mp3" },
      { createPlayer: () => player }
    );

    manager.setMixProfile("festival_soft");
    await manager.playMusic("bg_chill");
    expect(player.volume).toBeCloseTo(0.72, 5);
  });

  it("pauses and resumes active music when app activity changes", async () => {
    const player = makeFakePlayer();
    const manager = new AudioManager(
      { bg_chill: "audio/chill.mp3" },
      { createPlayer: () => player }
    );

    await manager.playMusic("bg_chill");
    expect(player.playSpy).toHaveBeenCalledTimes(1);

    manager.setAppActive(false);
    expect(player.pauseSpy).toHaveBeenCalledTimes(1);

    manager.setAppActive(true);
    expect(player.playSpy).toHaveBeenCalledTimes(2);
  });

  it("does not play sfx while app is inactive", async () => {
    const player = makeFakePlayer();
    const createPlayer = vi.fn(() => player);
    const manager = new AudioManager(
      { spawn: "audio/spawn.mp3" },
      { createPlayer }
    );

    manager.setAppActive(false);
    const played = await manager.playSfx("spawn");

    expect(played).toBe(false);
    expect(createPlayer).not.toHaveBeenCalled();
  });

  it("updates cue table and restarts active music when cue path changes", async () => {
    const players: FakeAudioPlayer[] = [];
    const manager = new AudioManager(
      { bg_chill: "audio/chill_v1.mp3" },
      {
        createPlayer: () => {
          const player = makeFakePlayer();
          players.push(player);
          return player;
        }
      }
    );

    await manager.playMusic("bg_chill");
    expect(players).toHaveLength(1);
    expect(players[0].src).toContain("audio/chill_v1.mp3");

    manager.setCues({ bg_chill: "audio/chill_v2.mp3" });
    await Promise.resolve();

    expect(players).toHaveLength(2);
    expect(players[0].pauseSpy).toHaveBeenCalledTimes(1);
    expect(players[1].src).toContain("audio/chill_v2.mp3");
    expect(players[1].playSpy).toHaveBeenCalledTimes(1);
  });

  it("applies cue-specific attenuation to interstitial hero sounds", async () => {
    const players: FakeAudioPlayer[] = [];
    const manager = new AudioManager(
      {
        level_complete: "audio/level_complete.mp3",
        fireworks: "audio/fireworks.mp3",
        deliver: "audio/deliver.mp3"
      },
      {
        createPlayer: () => {
          const player = makeFakePlayer();
          players.push(player);
          return player;
        }
      }
    );
    manager.setMix({
      masterVolume: 1,
      musicVolume: 1,
      sfxVolume: 1,
      musicFadeMs: 0
    });

    await manager.playSfx("level_complete", { category: "hero" });
    await manager.playSfx("fireworks", { category: "hero" });
    await manager.playSfx("deliver", { category: "hero" });

    expect(players[0].volume).toBeCloseTo(1 * 1 * 1.12 * 0.82, 5);
    expect(players[1].volume).toBeCloseTo(1, 5);
    expect(players[2].volume).toBeCloseTo(1, 5);
  });
});
