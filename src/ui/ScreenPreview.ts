import type { GameManagerSnapshot } from "../game/GameManager";

export type PreviewScreen =
  | "LEVEL_FAILED"
  | "LEVEL_COMPLETE"
  | "FESTIVAL_COMPLETE";

export function parsePreviewScreen(search: string): PreviewScreen | null {
  const params = new URLSearchParams(search);
  const raw = (params.get("previewscreen") ?? "").trim().toLowerCase();
  if (!raw) {
    return null;
  }
  if (raw === "level_failed" || raw === "failed") {
    return "LEVEL_FAILED";
  }
  if (raw === "level_complete" || raw === "complete") {
    return "LEVEL_COMPLETE";
  }
  if (raw === "festival_complete" || raw === "festival") {
    return "FESTIVAL_COMPLETE";
  }
  return null;
}

export function buildPreviewSnapshot(
  screen: PreviewScreen,
  base: GameManagerSnapshot | null
): GameManagerSnapshot {
  const fallbackLevelScore = Math.max(
    0,
    Math.floor(base?.level.lastLevelScore ?? base?.runtime?.levelScore ?? 2150)
  );
  const fallbackFestivalScore = Math.max(
    fallbackLevelScore,
    Math.floor(base?.level.cumulativeScore ?? 12450)
  );
  const currentLevel = Math.max(1, base?.level.currentLevel ?? 9);
  const totalLevels = Math.max(currentLevel, base?.level.totalLevels ?? 9);

  return {
    screen,
    level: {
      state: screen,
      currentLevel,
      totalLevels,
      attemptNumber: Math.max(1, base?.level.attemptNumber ?? 1),
      attemptKey: `${currentLevel}:${Math.max(1, base?.level.attemptNumber ?? 1)}`,
      cumulativeScore: fallbackFestivalScore,
      lastLevelScore: fallbackLevelScore,
      festivalRoutedArtists: Math.max(
        0,
        Math.floor(
          base?.level.festivalRoutedArtists ?? base?.runtime?.deliveredArtists ?? 10
        )
      ),
      festivalMissedArtists: Math.max(
        0,
        Math.floor(
          base?.level.festivalMissedArtists ?? base?.runtime?.missedArtists ?? 1
        )
      ),
      festivalIncorrectStageArtists: Math.max(
        0,
        Math.floor(
          base?.level.festivalIncorrectStageArtists ??
            base?.runtime?.incorrectStageArtists ??
            2
        )
      ),
      festivalEncounterStrikes: Math.max(
        0,
        Math.floor(
          base?.level.festivalEncounterStrikes ??
            (base?.runtime
              ? Math.max(
                  0,
                  (base.runtime.maxEncounterStrikes ?? 12) -
                    (base.runtime.remainingLives ?? 6)
                )
              : 8)
        )
      )
    },
    profile: {
      highestUnlockedLevel: Math.max(1, base?.profile.highestUnlockedLevel ?? totalLevels),
      bestFestivalScore: Math.max(
        fallbackFestivalScore,
        Math.floor(base?.profile.bestFestivalScore ?? 13840)
      ),
      bestLevelScore: Math.max(
        fallbackLevelScore,
        Math.floor(base?.profile.bestLevelScore ?? 2600)
      )
    },
    runtime: {
      levelNumber: currentLevel,
      dayNumber: Math.max(1, base?.runtime?.dayNumber ?? 3),
      sessionName: base?.runtime?.sessionName ?? "Evening",
      sessionIndexInDay: Math.max(1, base?.runtime?.sessionIndexInDay ?? 3),
      totalFestivalDays: Math.max(1, base?.runtime?.totalFestivalDays ?? 3),
      sessionTargetSets: Math.max(1, base?.runtime?.sessionTargetSets ?? 8),
      paceDeltaSets: base?.runtime?.paceDeltaSets ?? 1.2,
      levelScore: fallbackLevelScore,
      outcome: screen === "LEVEL_FAILED" ? "FAILED" : "COMPLETED",
      performanceTier:
        screen === "LEVEL_FAILED"
          ? (base?.runtime?.performanceTier ?? "SILVER")
          : (base?.runtime?.performanceTier ?? "GOLD"),
      deliveredArtists: Math.max(0, base?.runtime?.deliveredArtists ?? 10),
      incorrectStageArtists: Math.max(0, base?.runtime?.incorrectStageArtists ?? 2),
      missedArtists: Math.max(0, base?.runtime?.missedArtists ?? 1),
      maxEncounterStrikes: Math.max(1, base?.runtime?.maxEncounterStrikes ?? 12),
      remainingLives: Math.max(0, base?.runtime?.remainingLives ?? 6),
      remainingTimeSeconds: Math.max(0, base?.runtime?.remainingTimeSeconds ?? 0),
      totalArtists: Math.max(1, base?.runtime?.totalArtists ?? 28),
      spawnedArtists: Math.max(1, base?.runtime?.spawnedArtists ?? 28),
      resolvedArtists: Math.max(0, base?.runtime?.resolvedArtists ?? 28)
    }
  };
}
