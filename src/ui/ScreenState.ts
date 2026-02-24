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

export interface ScreenViewModel {
  screen: "MENU" | "LEVEL_FAILED" | "LEVEL_COMPLETE" | "FESTIVAL_COMPLETE";
  title: string;
  subtitle: string;
  summaryRows: ScreenSummaryRow[];
  actions: ScreenActionModel[];
}
