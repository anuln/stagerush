import { describe, expect, it } from "vitest";
import {
  findEntryByAssetPath,
  resolveAdminPreview,
  toResolvedPath
} from "./AdminPreviewModel";

const entries = [
  {
    id: "stage_main_v1",
    assetPath: "assets/maps/govball/generated/stages/stage_main_v1.png",
    promptText: "prompt stage"
  },
  {
    id: "bg_chill_v1",
    assetPath: "assets/audio/govball/generated/music/audio_bg_chill_v1.mp3",
    promptText: "prompt audio"
  }
];

describe("AdminPreviewModel", () => {
  it("resolves override path first and returns catalog metadata", () => {
    const result = resolveAdminPreview({
      label: "Stage main",
      defaultPath: "assets/maps/govball/generated/stages/stage_side_v1.png",
      selectedPath: "assets/maps/govball/generated/stages/stage_main_v1.png",
      entries
    });

    expect(result.source).toBe("override");
    expect(result.id).toBe("stage_main_v1");
    expect(result.promptText).toContain("stage");
  });

  it("falls back to default path when no override selected", () => {
    const result = resolveAdminPreview({
      label: "Stage main",
      defaultPath: "assets/maps/govball/generated/stages/stage_main_v1.png",
      selectedPath: null,
      entries
    });

    expect(result.source).toBe("default");
    expect(result.assetPath).toContain("stage_main_v1.png");
    expect(result.id).toBe("stage_main_v1");
  });

  it("normalizes slash-prefixed catalog comparisons and resolved paths", () => {
    const found = findEntryByAssetPath(entries, "/assets/audio/govball/generated/music/audio_bg_chill_v1.mp3");
    expect(found?.id).toBe("bg_chill_v1");
    expect(toResolvedPath("assets/maps/govball/generated/stages/stage_main_v1.png")).toBe(
      "/assets/maps/govball/generated/stages/stage_main_v1.png"
    );
  });

  it("preserves data/blob URLs without adding a leading slash", () => {
    expect(toResolvedPath("data:image/png;base64,AAAA")).toBe(
      "data:image/png;base64,AAAA"
    );
    expect(toResolvedPath("blob:https://example.com/asset-1")).toBe(
      "blob:https://example.com/asset-1"
    );
  });
});
