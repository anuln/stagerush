export type ScreenActionId =
  | "START_FESTIVAL"
  | "RETRY_LEVEL"
  | "NEXT_LEVEL"
  | "RETURN_TO_MENU";

export interface ScreenActionModel {
  id: ScreenActionId;
  label: string;
  emphasis?: "primary" | "secondary";
}

export interface ScreenSummaryRow {
  label: string;
  value: string;
}

export interface SessionWrapMetric {
  id: string;
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "warning" | "critical";
}

export interface SessionWrapProgress {
  nextLabel: string;
}

export interface SessionWrapModel {
  outcome: "complete" | "failed" | "festival_complete";
  resultLabel: string;
  tier: string;
  tierIconPath: string;
  sessionScore: number;
  runTotalScore: number;
  metrics: SessionWrapMetric[];
  progress: SessionWrapProgress;
}

export interface ScreenViewModel {
  screen: "MENU" | "LEVEL_FAILED" | "LEVEL_COMPLETE" | "FESTIVAL_COMPLETE";
  title: string;
  subtitle: string;
  summaryRows: ScreenSummaryRow[];
  actions: ScreenActionModel[];
  sessionWrap?: SessionWrapModel;
}
