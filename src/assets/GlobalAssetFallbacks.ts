export type FallbackAssetKind = "background" | "stage" | "distraction" | "artist";

export const GLOBAL_FALLBACK_ASSET_PATHS: Record<FallbackAssetKind, string> = {
  background: "assets/maps/govball/generated/backgrounds/govball_bg_v1.png",
  stage: "assets/maps/govball/generated/stages/stage_main_v1.png",
  distraction: "assets/maps/govball/generated/distractions/distraction_merch_v1.png",
  artist: "assets/maps/govball/artists/artist_headliner_a_walk1.png"
};

export function getAssetCandidatePaths(
  kind: FallbackAssetKind,
  requestedPath: string
): string[] {
  const candidates: string[] = [];
  const trimmed = requestedPath.trim();
  if (trimmed.length > 0) {
    candidates.push(trimmed);
  }
  const fallback = GLOBAL_FALLBACK_ASSET_PATHS[kind];
  if (!candidates.includes(fallback)) {
    candidates.push(fallback);
  }
  return candidates;
}

export function getAllGlobalFallbackAssetPaths(): string[] {
  return Array.from(new Set(Object.values(GLOBAL_FALLBACK_ASSET_PATHS)));
}
