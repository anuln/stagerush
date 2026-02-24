import { describe, expect, it } from "vitest";
import { RunPersistence, type StorageLike } from "./RunPersistence";

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

describe("RunPersistence", () => {
  it("initializes defaults when storage is empty", () => {
    const persistence = new RunPersistence(new MemoryStorage());
    const snapshot = persistence.getSnapshot();

    expect(snapshot.highestUnlockedLevel).toBe(1);
    expect(snapshot.bestFestivalScore).toBe(0);
    expect(snapshot.bestLevelScores).toEqual({});
  });

  it("coerces malformed stored payload safely", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "stage-call.profile.v1",
      JSON.stringify({
        version: 999,
        settings: { musicVolume: 10, sfxVolume: -1 },
        progress: {
          highestUnlockedLevel: "bad",
          bestFestivalScore: -200,
          bestLevelScores: { "1": "oops", "2": 450 }
        }
      })
    );

    const persistence = new RunPersistence(storage);
    const snapshot = persistence.getSnapshot();

    expect(snapshot.settings.musicVolume).toBe(1);
    expect(snapshot.settings.sfxVolume).toBe(0);
    expect(snapshot.highestUnlockedLevel).toBe(1);
    expect(snapshot.bestFestivalScore).toBe(0);
    expect(snapshot.bestLevelScores).toEqual({ "1": 0, "2": 450 });
  });

  it("records level completion and festival best score", () => {
    const persistence = new RunPersistence(new MemoryStorage());

    persistence.recordLevelCompletion({
      levelNumber: 1,
      totalLevels: 3,
      levelScore: 420,
      cumulativeScore: 420,
      festivalCompleted: false
    });

    persistence.recordLevelCompletion({
      levelNumber: 3,
      totalLevels: 3,
      levelScore: 600,
      cumulativeScore: 1550,
      festivalCompleted: true
    });

    const snapshot = persistence.getSnapshot();
    expect(snapshot.highestUnlockedLevel).toBe(3);
    expect(snapshot.bestLevelScores["1"]).toBe(420);
    expect(snapshot.bestLevelScores["3"]).toBe(600);
    expect(snapshot.bestFestivalScore).toBe(1550);
  });
});
