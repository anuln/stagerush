import type { GameManagerSnapshot } from "../game/GameManager";
import { resolvePerformanceTier } from "../game/GameRuntime";
import type { ScreenViewModel, SessionWrapModel } from "./ScreenState";

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

function formatPaceLabel(paceDeltaSets: number | null): {
  label: string;
  tone: "neutral" | "positive" | "warning";
} {
  if (typeof paceDeltaSets !== "number" || !Number.isFinite(paceDeltaSets)) {
    return { label: "On Track", tone: "neutral" };
  }
  if (paceDeltaSets >= 0.75) {
    return { label: `+${Math.round(paceDeltaSets)} Ahead`, tone: "positive" };
  }
  if (paceDeltaSets <= -0.75) {
    return { label: `${Math.round(paceDeltaSets)} Behind`, tone: "warning" };
  }
  return { label: "On Track", tone: "neutral" };
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
  const pace = formatPaceLabel(runtime?.paceDeltaSets ?? null);
  const hasNextSession = level.currentLevel < level.totalLevels;
  const nextLabel =
    outcome === "festival_complete"
      ? "Festival complete. Run it again for a higher headliner score."
      : outcome === "failed"
        ? "Retry this session to recover momentum."
        : hasNextSession
          ? `Up Next · Session ${level.currentLevel + 1} / ${level.totalLevels}`
          : "Final session complete.";

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
        value: String(delivered),
        tone: "positive"
      },
      {
        id: "artists-missed",
        label: "Artists Missed",
        value: String(missed),
        tone: missed > 0 ? "warning" : "neutral"
      },
      {
        id: "sets-vs-target",
        label: "Sets vs Target",
        value: `${delivered}/${targetSets}`,
        tone: delivered >= targetSets ? "positive" : "neutral"
      },
      {
        id: "pace",
        label: "Pace",
        value: pace.label,
        tone: pace.tone
      }
    ],
    progress: {
      dayLabel: runtime ? `Day ${runtime.dayNumber}` : "Day -",
      sessionLabel: runtime?.sessionName ?? "Session",
      sequenceLabel: `Session ${level.currentLevel} / ${level.totalLevels}`,
      nextLabel
    }
  };
}

export function buildScreenViewModel(
  snapshot: GameManagerSnapshot
): ScreenViewModel | null {
  const level = snapshot.level;
  const levelLabel = `Level ${level.currentLevel} / ${level.totalLevels}`;

  if (snapshot.screen === "MENU") {
    return {
      screen: "MENU",
      title: "STAGE RUSH",
      subtitle:
        "Guide artists to stages by drawing routes. Avoid distractions and collisions to keep festival hype rising.",
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
        { label: "Festival Hype", value: formatScore(level.cumulativeScore) },
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
        { id: "RETRY_LEVEL", label: "Retry Session", emphasis: "primary" },
        { id: "RETURN_TO_MENU", label: "Back to Menu", emphasis: "secondary" }
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
        { label: "Festival Hype", value: formatScore(level.cumulativeScore) },
        {
          label: "Session Best",
          value: formatScore(snapshot.profile.bestLevelScore)
        }
      ],
      actions: [
        { id: "NEXT_LEVEL", label: "Next Session", emphasis: "primary" },
        { id: "RETURN_TO_MENU", label: "Back to Menu", emphasis: "secondary" }
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
        { label: "Final Hype", value: formatScore(level.cumulativeScore) },
        { label: "Final Tier", value: sessionWrap.tier },
        { label: "Best festival", value: formatScore(snapshot.profile.bestFestivalScore) }
      ],
      actions: [
        { id: "START_FESTIVAL", label: "Run Festival Again", emphasis: "primary" },
        { id: "RETURN_TO_MENU", label: "Back to Menu", emphasis: "secondary" }
      ],
      sessionWrap
    };
  }

  return null;
}
