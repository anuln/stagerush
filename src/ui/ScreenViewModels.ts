import type { GameManagerSnapshot } from "../game/GameManager";
import type { ScreenViewModel } from "./ScreenState";

function formatScore(value: number | null | undefined): string {
  const normalized = Math.max(0, Math.floor(value ?? 0));
  return `${normalized.toLocaleString()} pts`;
}

export function buildScreenViewModel(
  snapshot: GameManagerSnapshot
): ScreenViewModel | null {
  const level = snapshot.level;
  const levelLabel = `Level ${level.currentLevel} / ${level.totalLevels}`;

  if (snapshot.screen === "MENU") {
    return {
      screen: "MENU",
      title: "Stage Call",
      subtitle: "Route artists fast, keep combos alive, and complete the full festival run.",
      summaryRows: [
        { label: "Festival levels", value: `${level.totalLevels}` },
        { label: "Target", value: "Survive with 3 lives per level" }
      ],
      actions: [
        { id: "START_FESTIVAL", label: "Start Festival", emphasis: "primary" }
      ]
    };
  }

  if (snapshot.screen === "LEVEL_FAILED") {
    return {
      screen: "LEVEL_FAILED",
      title: `${levelLabel} Failed`,
      subtitle: "Three misses ended this attempt. Retry now or return to menu.",
      summaryRows: [
        { label: "Attempt", value: `${level.attemptNumber}` },
        { label: "Attempt score", value: formatScore(level.lastLevelScore) },
        { label: "Run total", value: formatScore(level.cumulativeScore) }
      ],
      actions: [
        { id: "RETRY_LEVEL", label: "Retry Level", emphasis: "primary" },
        { id: "RETURN_TO_MENU", label: "Back to Menu", emphasis: "secondary" }
      ]
    };
  }

  if (snapshot.screen === "LEVEL_COMPLETE") {
    return {
      screen: "LEVEL_COMPLETE",
      title: `${levelLabel} Complete`,
      subtitle: "Clean run. Continue to the next level or return to menu.",
      summaryRows: [
        { label: "Level score", value: formatScore(level.lastLevelScore) },
        { label: "Run total", value: formatScore(level.cumulativeScore) }
      ],
      actions: [
        { id: "NEXT_LEVEL", label: "Next Level", emphasis: "primary" },
        { id: "RETURN_TO_MENU", label: "Back to Menu", emphasis: "secondary" }
      ]
    };
  }

  if (snapshot.screen === "FESTIVAL_COMPLETE") {
    return {
      screen: "FESTIVAL_COMPLETE",
      title: "Festival Complete",
      subtitle: "All levels cleared. Start a fresh run to chase a higher score.",
      summaryRows: [
        { label: "Levels cleared", value: `${level.totalLevels}` },
        { label: "Final run score", value: formatScore(level.cumulativeScore) }
      ],
      actions: [
        { id: "START_FESTIVAL", label: "Play Again", emphasis: "primary" },
        { id: "RETURN_TO_MENU", label: "Back to Menu", emphasis: "secondary" }
      ]
    };
  }

  return null;
}
