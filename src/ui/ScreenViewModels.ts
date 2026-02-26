import type { GameManagerSnapshot } from "../game/GameManager";
import { resolvePerformanceTier } from "../game/GameRuntime";
import type {
  ScreenActionModel,
  ScreenViewModel,
  SessionWrapModel
} from "./ScreenState";

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

function resolveTierIconPath(tier: string): string {
  if (tier === "GOLD") {
    return "/assets/ui/trophies/gold.svg";
  }
  if (tier === "SILVER") {
    return "/assets/ui/trophies/silver.svg";
  }
  return "/assets/ui/trophies/bronze.svg";
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
    return "Session minimums not met";
  }
  if (level.currentLevel >= level.totalLevels) {
    return "Festival complete.";
  }
  if (!runtime) {
    return `Up Next: Session ${level.currentLevel + 1}`;
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
  return `Up Next: Day ${nextDay} ${formatSessionName(nextSessionName)}`;
}

function buildSessionWrap(
  snapshot: GameManagerSnapshot,
  outcome: SessionWrapModel["outcome"]
): SessionWrapModel {
  const runtime = snapshot.runtime;
  const level = snapshot.level;
  const tier = formatPerformance(snapshot);
  const tierIconPath = resolveTierIconPath(tier);
  const delivered = Math.max(0, runtime?.deliveredArtists ?? 0);
  const missed = Math.max(0, runtime?.missedArtists ?? 0);
  const incorrectStage = Math.max(0, runtime?.incorrectStageArtists ?? 0);
  const targetSets = Math.max(1, runtime?.sessionTargetSets ?? 1);
  const nextLabel = resolveUpNextLabel(snapshot, outcome);
  const deliveryRatio = delivered / targetSets;
  const routedTone =
    deliveryRatio >= 1 ? "positive" : deliveryRatio >= 0.72 ? "warning" : "critical";

  const resultLabel =
    outcome === "festival_complete"
      ? "Festival Headliner Moment"
      : outcome === "failed"
        ? "Session Turbulence"
        : "Session Locked In";
  const sessionScore = Math.max(
    0,
    Math.floor(runtime?.levelScore ?? level.lastLevelScore ?? 0)
  );
  const runTotalScore = Math.max(
    0,
    Math.floor(level.cumulativeScore ?? 0)
  );

  return {
    outcome,
    resultLabel,
    tier,
    tierIconPath,
    sessionScore,
    runTotalScore,
    metrics: [
      {
        id: "artists-routed",
        label: "Artists Routed",
        value: String(delivered),
        tone: routedTone
      },
      {
        id: "artists-missed",
        label: "Artists Missed",
        value: String(missed),
        tone: missed > 0 ? "warning" : "neutral"
      },
      {
        id: "incorrect-stage",
        label: "Incorrect Stage",
        value: String(incorrectStage),
        tone: incorrectStage > 0 ? "warning" : "neutral"
      }
    ],
    progress: {
      nextLabel
    }
  };
}

function shouldOfferRetryAction(sessionWrap: SessionWrapModel): boolean {
  const routedMetric = sessionWrap.metrics.find((metric) => metric.id === "artists-routed");
  return routedMetric?.tone === "warning" || routedMetric?.tone === "critical";
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
      subtitle: "",
      summaryRows: [
        { label: "Session Score", value: formatScore(level.lastLevelScore) },
        { label: "Festival Score", value: formatScore(level.cumulativeScore) },
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
    const actions: ScreenActionModel[] = shouldOfferRetryAction(sessionWrap)
      ? [
          { id: "NEXT_LEVEL", label: "Next Session", emphasis: "primary" },
          { id: "RETRY_LEVEL", label: "Retry Session", emphasis: "secondary" }
        ]
      : [
          { id: "NEXT_LEVEL", label: "Next Session", emphasis: "primary" }
        ];
    return {
      screen: "LEVEL_COMPLETE",
      title: formatDaySession(snapshot),
      subtitle: "",
      summaryRows: [
        { label: "Session Score", value: formatScore(level.lastLevelScore) },
        { label: "Festival Score", value: formatScore(level.cumulativeScore) },
        {
          label: "Session Best",
          value: formatScore(snapshot.profile.bestLevelScore)
        }
      ],
      actions,
      sessionWrap
    };
  }

  if (snapshot.screen === "FESTIVAL_COMPLETE") {
    const sessionWrap = buildSessionWrap(snapshot, "festival_complete");
    const actions: ScreenActionModel[] = shouldOfferRetryAction(sessionWrap)
      ? [
          { id: "START_FESTIVAL", label: "Run Festival Again", emphasis: "primary" },
          { id: "RETRY_LEVEL", label: "Retry Session", emphasis: "secondary" }
        ]
      : [
          { id: "START_FESTIVAL", label: "Run Festival Again", emphasis: "primary" }
        ];
    return {
      screen: "FESTIVAL_COMPLETE",
      title: "Festival Complete",
      subtitle: "",
      summaryRows: [
        { label: "Sessions Cleared", value: `${level.totalLevels}` },
        { label: "Festival Score", value: formatScore(level.cumulativeScore) },
        { label: "Best festival", value: formatScore(snapshot.profile.bestFestivalScore) }
      ],
      actions,
      sessionWrap
    };
  }

  return null;
}
