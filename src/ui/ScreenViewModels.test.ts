import { describe, expect, it } from "vitest";
import { buildScreenViewModel } from "./ScreenViewModels";

describe("buildScreenViewModel", () => {
  it("builds menu view model with start action", () => {
    const model = buildScreenViewModel({
      screen: "MENU",
      level: {
        state: "IDLE",
        currentLevel: 1,
        totalLevels: 10,
        attemptNumber: 0,
        attemptKey: "1:0",
        cumulativeScore: 0,
        lastLevelScore: null,
        festivalRoutedArtists: 0,
        festivalMissedArtists: 0,
        festivalIncorrectStageArtists: 0,
        festivalEncounterStrikes: 0
      },
      profile: {
        highestUnlockedLevel: 3,
        bestFestivalScore: 2200,
        bestLevelScore: null
      },
      runtime: null
    });

    expect(model?.screen).toBe("MENU");
    expect(model?.title).toBe("STAGE RUSH");
    expect(model?.actions[0].id).toBe("START_FESTIVAL");
    expect(model?.actions[0].label).toBe("Start Festival");
  });

  it("builds failed session wrap with retry and menu actions", () => {
    const model = buildScreenViewModel({
      screen: "LEVEL_FAILED",
      level: {
        state: "LEVEL_FAILED",
        currentLevel: 3,
        totalLevels: 10,
        attemptNumber: 2,
        attemptKey: "3:2",
        cumulativeScore: 950,
        lastLevelScore: 180,
        festivalRoutedArtists: 7,
        festivalMissedArtists: 3,
        festivalIncorrectStageArtists: 1,
        festivalEncounterStrikes: 2
      },
      profile: {
        highestUnlockedLevel: 4,
        bestFestivalScore: 2600,
        bestLevelScore: 220
      },
      runtime: {
        levelNumber: 3,
        dayNumber: 2,
        sessionName: "Evening Session",
        sessionIndexInDay: 3,
        totalFestivalDays: 4,
        sessionTargetSets: 8,
        paceDeltaSets: -1.2,
        levelScore: 180,
        outcome: "FAILED",
        performanceTier: "SILVER",
        deliveredArtists: 3,
        incorrectStageArtists: 1,
        missedArtists: 4,
        remainingLives: 0,
        maxEncounterStrikes: 12,
        remainingTimeSeconds: 0,
        totalArtists: 14,
        spawnedArtists: 12,
        resolvedArtists: 8
      }
    });

    expect(model?.title).toBe("Day 2 · Evening Session");
    expect(model?.summaryRows.find((row) => row.label === "Session Score")?.value).toBe(
      "180 pts"
    );
    expect(model?.sessionWrap?.outcome).toBe("failed");
    expect(model?.sessionWrap?.resultLabel).toBe("Regroup Fast");
    expect(
      model?.sessionWrap?.metrics.find((metric) => metric.id === "artists-routed")
    ).toMatchObject({ label: "Artists Routed", value: "3", tone: "critical" });
    expect(
      model?.sessionWrap?.metrics.find((metric) => metric.id === "artists-missed")
    ).toMatchObject({ label: "Artists Missed", value: "4", tone: "warning" });
    expect(
      model?.sessionWrap?.metrics.find((metric) => metric.id === "incorrect-stage")
    ).toMatchObject({ label: "Incorrect Stage", value: "1", tone: "warning" });
    expect(model?.sessionWrap?.metrics).toHaveLength(3);
    expect(model?.sessionWrap?.progress.nextLabel).toBe("Session minimums not met");
    expect(model?.sessionWrap?.helpOutline?.title).toBe("How to play");
    expect(model?.sessionWrap?.helpOutline?.lines.length).toBeGreaterThan(0);
    expect(model?.actions.map((action) => action.id)).toEqual(["RETRY_LEVEL"]);
  });

  it("builds level-complete and festival-complete actions correctly", () => {
    const levelComplete = buildScreenViewModel({
      screen: "LEVEL_COMPLETE",
      level: {
        state: "LEVEL_COMPLETE",
        currentLevel: 2,
        totalLevels: 4,
        attemptNumber: 1,
        attemptKey: "2:1",
        cumulativeScore: 1220,
        lastLevelScore: 520,
        festivalRoutedArtists: 11,
        festivalMissedArtists: 2,
        festivalIncorrectStageArtists: 0,
        festivalEncounterStrikes: 3
      },
      profile: {
        highestUnlockedLevel: 4,
        bestFestivalScore: 3100,
        bestLevelScore: 600
      },
      runtime: {
        levelNumber: 2,
        dayNumber: 1,
        sessionName: "Afternoon Session",
        sessionIndexInDay: 2,
        totalFestivalDays: 2,
        sessionTargetSets: 5,
        paceDeltaSets: 1.3,
        levelScore: 520,
        outcome: "COMPLETED",
        performanceTier: "GOLD",
        deliveredArtists: 6,
        incorrectStageArtists: 0,
        missedArtists: 1,
        remainingLives: 2,
        maxEncounterStrikes: 12,
        remainingTimeSeconds: 0,
        totalArtists: 14,
        spawnedArtists: 14,
        resolvedArtists: 14
      }
    });
    const festivalComplete = buildScreenViewModel({
      screen: "FESTIVAL_COMPLETE",
      level: {
        state: "FESTIVAL_COMPLETE",
        currentLevel: 4,
        totalLevels: 4,
        attemptNumber: 1,
        attemptKey: "4:1",
        cumulativeScore: 3140,
        lastLevelScore: 880,
        festivalRoutedArtists: 31,
        festivalMissedArtists: 6,
        festivalIncorrectStageArtists: 5,
        festivalEncounterStrikes: 14
      },
      profile: {
        highestUnlockedLevel: 4,
        bestFestivalScore: 3200,
        bestLevelScore: 920
      },
      runtime: {
        levelNumber: 4,
        dayNumber: 2,
        sessionName: "Evening Session",
        sessionIndexInDay: 3,
        totalFestivalDays: 2,
        sessionTargetSets: 9,
        paceDeltaSets: 0.1,
        levelScore: 880,
        outcome: "COMPLETED",
        performanceTier: "GOLD",
        deliveredArtists: 9,
        incorrectStageArtists: 2,
        missedArtists: 2,
        remainingLives: 1,
        maxEncounterStrikes: 12,
        remainingTimeSeconds: 0,
        totalArtists: 16,
        spawnedArtists: 16,
        resolvedArtists: 16
      }
    });

    expect(levelComplete?.actions.map((action) => action.id)).toEqual([
      "NEXT_LEVEL"
    ]);
    expect(levelComplete?.actions[0].label).toBe("Next Session");
    expect(levelComplete?.sessionWrap?.outcome).toBe("complete");
    expect(levelComplete?.sessionWrap?.resultLabel).toBe("Crowd Warmup");
    expect(
      levelComplete?.sessionWrap?.metrics.find((metric) => metric.id === "artists-routed")
    ).toMatchObject({ value: "6", tone: "positive" });
    expect(levelComplete?.sessionWrap?.progress.nextLabel).toBe(
      "Up Next: Day 1 Evening Session"
    );
    expect(levelComplete?.sessionWrap?.tierIconPath).toBe("/assets/ui/trophies/gold.svg");

    expect(festivalComplete?.sessionWrap?.outcome).toBe("festival_complete");
    expect(festivalComplete?.sessionWrap?.resultLabel).toBe("Legendary Finish");
    expect(festivalComplete?.sessionWrap?.progress.nextLabel).toContain("Festival complete");
    expect(festivalComplete?.actions[0].label).toBe("Play Again");
    expect(festivalComplete?.sessionWrap?.tierIconPath).toBe("/assets/ui/trophies/gold.svg");
    expect(festivalComplete?.sessionWrap?.festivalTotals).toEqual([
      { id: "festival-routed", label: "Artists Routed", value: "31" },
      { id: "festival-missed", label: "Artists Missed", value: "6" },
      { id: "festival-incorrect-stage", label: "Incorrect Stage", value: "5" },
      {
        id: "festival-encounters",
        label: "Total Collisions/Distractions",
        value: "14"
      }
    ]);
    expect(festivalComplete?.actions.map((action) => action.id)).toEqual([
      "RETURN_TO_MENU"
    ]);
  });

  it("adds retry action on wrap cards when routed score is warning/critical", () => {
    const levelCompleteWarning = buildScreenViewModel({
      screen: "LEVEL_COMPLETE",
      level: {
        state: "LEVEL_COMPLETE",
        currentLevel: 2,
        totalLevels: 4,
        attemptNumber: 1,
        attemptKey: "2:1",
        cumulativeScore: 820,
        lastLevelScore: 220,
        festivalRoutedArtists: 9,
        festivalMissedArtists: 4,
        festivalIncorrectStageArtists: 2,
        festivalEncounterStrikes: 5
      },
      profile: {
        highestUnlockedLevel: 4,
        bestFestivalScore: 3100,
        bestLevelScore: 600
      },
      runtime: {
        levelNumber: 2,
        dayNumber: 1,
        sessionName: "Afternoon Session",
        sessionIndexInDay: 2,
        totalFestivalDays: 2,
        sessionTargetSets: 6,
        paceDeltaSets: -0.8,
        levelScore: 220,
        outcome: "COMPLETED",
        performanceTier: "SILVER",
        deliveredArtists: 4,
        incorrectStageArtists: 0,
        missedArtists: 3,
        remainingLives: 2,
        maxEncounterStrikes: 12,
        remainingTimeSeconds: 0,
        totalArtists: 14,
        spawnedArtists: 14,
        resolvedArtists: 14
      }
    });

    const festivalCompleteWarning = buildScreenViewModel({
      screen: "FESTIVAL_COMPLETE",
      level: {
        state: "FESTIVAL_COMPLETE",
        currentLevel: 4,
        totalLevels: 4,
        attemptNumber: 1,
        attemptKey: "4:1",
        cumulativeScore: 1640,
        lastLevelScore: 180,
        festivalRoutedArtists: 20,
        festivalMissedArtists: 12,
        festivalIncorrectStageArtists: 6,
        festivalEncounterStrikes: 18
      },
      profile: {
        highestUnlockedLevel: 4,
        bestFestivalScore: 3200,
        bestLevelScore: 920
      },
      runtime: {
        levelNumber: 4,
        dayNumber: 2,
        sessionName: "Evening Session",
        sessionIndexInDay: 3,
        totalFestivalDays: 2,
        sessionTargetSets: 9,
        paceDeltaSets: -1.8,
        levelScore: 180,
        outcome: "COMPLETED",
        performanceTier: "SILVER",
        deliveredArtists: 5,
        incorrectStageArtists: 2,
        missedArtists: 4,
        remainingLives: 1,
        maxEncounterStrikes: 12,
        remainingTimeSeconds: 0,
        totalArtists: 16,
        spawnedArtists: 16,
        resolvedArtists: 16
      }
    });

    expect(levelCompleteWarning?.actions.map((action) => action.id)).toEqual([
      "NEXT_LEVEL",
      "RETRY_LEVEL"
    ]);
    expect(festivalCompleteWarning?.actions.map((action) => action.id)).toEqual([
      "RETURN_TO_MENU"
    ]);
  });
});
