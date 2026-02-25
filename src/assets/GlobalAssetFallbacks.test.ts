import { describe, expect, it } from "vitest";
import {
  GLOBAL_FALLBACK_ASSET_PATHS,
  getAssetCandidatePaths
} from "./GlobalAssetFallbacks";

describe("GlobalAssetFallbacks", () => {
  it("adds fallback path when slot path is empty", () => {
    expect(getAssetCandidatePaths("artist", "")).toEqual([
      GLOBAL_FALLBACK_ASSET_PATHS.artist
    ]);
  });

  it("uses explicit path as-is when provided", () => {
    expect(getAssetCandidatePaths("stage", "assets/custom/stage.png")).toEqual([
      "assets/custom/stage.png"
    ]);
  });
});
