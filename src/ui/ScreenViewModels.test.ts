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
        lastLevelScore: null
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

  it("builds failed-level summary with retry and menu actions", () => {
    const model = buildScreenViewModel({
      screen: "LEVEL_FAILED",
      level: {
        state: "LEVEL_FAILED",
        currentLevel: 3,
        totalLevels: 10,
        attemptNumber: 2,
        attemptKey: "3:2",
        cumulativeScore: 950,
        lastLevelScore: 180
      },
      profile: {
        highestUnlockedLevel: 4,
        bestFestivalScore: 2600,
        bestLevelScore: 220
      },
      runtime: null
    });

    expect(model?.title).toContain("Level 3 / 10 Failed");
    expect(model?.summaryRows.find((row) => row.label === "Set score")?.value).toBe(
      "180 pts"
    );
    expect(model?.actions.map((action) => action.id)).toEqual([
      "RETRY_LEVEL",
      "RETURN_TO_MENU"
    ]);
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
        lastLevelScore: 520
      },
      profile: {
        highestUnlockedLevel: 4,
        bestFestivalScore: 3100,
        bestLevelScore: 600
      },
      runtime: null
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
        lastLevelScore: 880
      },
      profile: {
        highestUnlockedLevel: 4,
        bestFestivalScore: 3200,
        bestLevelScore: 920
      },
      runtime: null
    });

    expect(levelComplete?.actions.map((action) => action.id)).toEqual([
      "NEXT_LEVEL",
      "RETURN_TO_MENU"
    ]);
    expect(levelComplete?.summaryRows.some((row) => row.label === "Performance")).toBe(true);
    expect(festivalComplete?.summaryRows.some((row) => row.label === "Final rating")).toBe(true);
    expect(festivalComplete?.actions.map((action) => action.id)).toEqual([
      "START_FESTIVAL",
      "RETURN_TO_MENU"
    ]);
  });
});
