import type { GameManagerSnapshot } from "../game/GameManager";
import { resolvePerformanceTier } from "../game/GameRuntime";
import type { ScreenViewModel, SessionWrapModel } from "./ScreenState";

const SESSION_NAME_SEQUENCE = ["Morning", "Afternoon", "Evening"] as const;

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

function formatDaySession(snapshot: GameManagerSnapshot): string {
  const runtime = snapshot.runtime;
  if (!runtime) {
    return `Session ${snapshot.level.currentLevel} / ${snapshot.level.totalLevels}`;
  }
  return `Day ${runtime.dayNumber} · ${runtime.sessionName}`;
}

function formatSessionName(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "Session";
  }
  if (/session$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed} Session`;
}

function resolveUpNextLabel(
  snapshot: GameManagerSnapshot,
  outcome: SessionWrapModel["outcome"]
): string {
  const runtime = snapshot.runtime;
  const level = snapshot.level;
  if (outcome === "festival_complete") {
    return "Festival complete.";
  }
  if (outcome === "failed") {
    if (runtime) {
      return `Up Next · Day ${runtime.dayNumber} ${formatSessionName(runtime.sessionName)}`;
    }
    return `Up Next · Session ${level.currentLevel}`;
  }
  if (level.currentLevel >= level.totalLevels) {
    return "Festival complete.";
  }
  if (!runtime) {
    return `Up Next · Session ${level.currentLevel + 1}`;
  }

  const totalFestivalDays = Math.max(runtime.dayNumber, runtime.totalFestivalDays);
  const sessionsPerDay = SESSION_NAME_SEQUENCE.length;
  let nextDay = runtime.dayNumber;
  let nextSessionIndex = runtime.sessionIndexInDay + 1;
  if (nextSessionIndex > sessionsPerDay) {
    nextDay = Math.min(totalFestivalDays, runtime.dayNumber + 1);
    nextSessionIndex = 1;
  }
  const nextSessionName =
    SESSION_NAME_SEQUENCE[nextSessionIndex - 1] ?? `Session ${nextSessionIndex}`;
  return `Up Next · Day ${nextDay} ${formatSessionName(nextSessionName)}`;
}

function buildSessionWrap(
  snapshot: GameManagerSnapshot,
  outcome: SessionWrapModel["outcome"]
): SessionWrapModel {
  const runtime = snapshot.runtime;
  const level = snapshot.level;
  const tier = formatPerformance(snapshot);
  const delivered = Math.max(0, runtime?.deliveredArtists ?? 0);
  const missed = Math.max(0, runtime?.missedArtists ?? 0);
  const targetSets = Math.max(1, runtime?.sessionTargetSets ?? 1);
  const nextLabel = resolveUpNextLabel(snapshot, outcome);
  const targetStatus = delivered >= targetSets ? "👍" : "👎";

  const resultLabel =
    outcome === "festival_complete"
      ? "Festival Headliner Moment"
      : outcome === "failed"
        ? "Session Turbulence"
        : "Session Locked In";

  return {
    outcome,
    resultLabel,
    tier,
    sessionScore: Math.max(0, Math.floor(level.lastLevelScore ?? 0)),
    runTotalScore: Math.max(0, Math.floor(level.cumulativeScore ?? 0)),
    metrics: [
      {
        id: "artists-routed",
        label: "Artists Routed",
        value: `${delivered} ${targetStatus}`,
        tone: delivered >= targetSets ? "positive" : "warning"
      },
      {
        id: "artists-missed",
        label: "Artists Missed",
        value: String(missed),
        tone: missed > 0 ? "warning" : "neutral"
      }
    ],
    progress: {
      nextLabel
    }
  };
}

export function buildScreenViewModel(
  snapshot: GameManagerSnapshot
): ScreenViewModel | null {
  const level = snapshot.level;

  if (snapshot.screen === "MENU") {
    return {
      screen: "MENU",
      title: "STAGE RUSH",
      subtitle:
        "Guide artists to stages by drawing routes. Avoid distractions and collisions to keep festival score rising.",
      summaryRows: [
        { label: "Festival Days", value: `${level.totalLevels}` },
        { label: "Unlocked", value: `Up to Day ${snapshot.profile.highestUnlockedLevel}` },
        { label: "Best festival", value: formatScore(snapshot.profile.bestFestivalScore) }
      ],
      actions: [
        { id: "START_FESTIVAL", label: "Start Festival", emphasis: "primary" }
      ]
    };
  }

  if (snapshot.screen === "LEVEL_FAILED") {
    const sessionWrap = buildSessionWrap(snapshot, "failed");
    return {
      screen: "LEVEL_FAILED",
      title: formatDaySession(snapshot),
      subtitle:
        "Session Wrap Card · crowd pressure spiked past limit.",
      summaryRows: [
        { label: "Session Score", value: formatScore(level.lastLevelScore) },
        { label: "Festival Score", value: formatScore(level.cumulativeScore) },
        {
          label: "Session Tier",
          value: sessionWrap.tier
        },
        {
          label: "Session Best",
          value: formatScore(snapshot.profile.bestLevelScore)
        }
      ],
      actions: [
        { id: "RETRY_LEVEL", label: "Retry Session", emphasis: "primary" }
      ],
      sessionWrap
    };
  }

  if (snapshot.screen === "LEVEL_COMPLETE") {
    const sessionWrap = buildSessionWrap(snapshot, "complete");
    return {
      screen: "LEVEL_COMPLETE",
      title: formatDaySession(snapshot),
      subtitle: "Session Wrap Card · route quality locked in.",
      summaryRows: [
        { label: "Session Score", value: formatScore(level.lastLevelScore) },
        { label: "Session Tier", value: sessionWrap.tier },
        { label: "Festival Score", value: formatScore(level.cumulativeScore) },
        {
          label: "Session Best",
          value: formatScore(snapshot.profile.bestLevelScore)
        }
      ],
      actions: [
        { id: "NEXT_LEVEL", label: "Next Session", emphasis: "primary" }
      ],
      sessionWrap
    };
  }

  if (snapshot.screen === "FESTIVAL_COMPLETE") {
    const sessionWrap = buildSessionWrap(snapshot, "festival_complete");
    return {
      screen: "FESTIVAL_COMPLETE",
      title: "Festival Complete",
      subtitle: "Session Wrap Card Finale · lineup complete.",
      summaryRows: [
        { label: "Sessions Cleared", value: `${level.totalLevels}` },
        { label: "Festival Score", value: formatScore(level.cumulativeScore) },
        { label: "Final Tier", value: sessionWrap.tier },
        { label: "Best festival", value: formatScore(snapshot.profile.bestFestivalScore) }
      ],
      actions: [
        { id: "START_FESTIVAL", label: "Run Festival Again", emphasis: "primary" }
      ],
      sessionWrap
    };
  }

  return null;
}
