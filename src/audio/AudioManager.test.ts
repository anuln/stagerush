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
});
