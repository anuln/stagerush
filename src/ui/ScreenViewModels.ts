import type { GameManagerSnapshot } from "../game/GameManager";
import { resolvePerformanceTier } from "../game/GameRuntime";
import type { ScreenViewModel } from "./ScreenState";

function formatScore(value: number | null | undefined): string {
  const normalized = Math.max(0, Math.floor(value ?? 0));
  return `${normalized.toLocaleString()} pts`;
}

function formatPerformance(snapshot: GameManagerSnapshot): string {
  const runtimeTier = snapshot.runtime?.performanceTier;
  if (runtimeTier) {
    return runtimeTier;
  }
  return resolvePerformanceTier({
    score: snapshot.level.lastLevelScore ?? 0,
    deliveredArtists: snapshot.runtime?.deliveredArtists ?? 0
  });
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
      subtitle:
        "Run the festival setlist under pressure. Draw routes fast, keep momentum high, and own the crowd flow.",
      summaryRows: [
        { label: "Set count", value: `${level.totalLevels}` },
        { label: "Unlocked", value: `Up to Level ${snapshot.profile.highestUnlockedLevel}` },
        { label: "Best festival", value: formatScore(snapshot.profile.bestFestivalScore) }
      ],
      actions: [
        { id: "START_FESTIVAL", label: "Open Gates", emphasis: "primary" }
      ]
    };
  }

  if (snapshot.screen === "LEVEL_FAILED") {
    return {
      screen: "LEVEL_FAILED",
      title: `${levelLabel} Failed`,
      subtitle:
        "Crowd pressure spiked past the limit. Reset the set quickly or return to menu.",
      summaryRows: [
        { label: "Set attempt", value: `${level.attemptNumber}` },
        { label: "Set score", value: formatScore(level.lastLevelScore) },
        { label: "Run total", value: formatScore(level.cumulativeScore) },
        {
          label: "Level best",
          value: formatScore(snapshot.profile.bestLevelScore)
        }
      ],
      actions: [
        { id: "RETRY_LEVEL", label: "Run It Again", emphasis: "primary" },
        { id: "RETURN_TO_MENU", label: "Back to Menu", emphasis: "secondary" }
      ]
    };
  }

  if (snapshot.screen === "LEVEL_COMPLETE") {
    return {
      screen: "LEVEL_COMPLETE",
      title: `${levelLabel} Complete`,
      subtitle: "Set landed clean. Keep the stage hot or return to menu.",
      summaryRows: [
        { label: "Set score", value: formatScore(level.lastLevelScore) },
        { label: "Performance", value: formatPerformance(snapshot) },
        { label: "Run total", value: formatScore(level.cumulativeScore) },
        {
          label: "Level best",
          value: formatScore(snapshot.profile.bestLevelScore)
        }
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
      subtitle: "Lineup complete. Restart the festival to push a higher run total.",
      summaryRows: [
        { label: "Sets cleared", value: `${level.totalLevels}` },
        { label: "Final set score", value: formatScore(level.cumulativeScore) },
        { label: "Final rating", value: formatPerformance(snapshot) },
        { label: "Best festival", value: formatScore(snapshot.profile.bestFestivalScore) }
      ],
      actions: [
        { id: "START_FESTIVAL", label: "Run It Again", emphasis: "primary" },
        { id: "RETURN_TO_MENU", label: "Back to Menu", emphasis: "secondary" }
      ]
    };
  }

  return null;
}
