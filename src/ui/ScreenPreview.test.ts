import { describe, expect, it } from "vitest";
import { buildPreviewSnapshot, parsePreviewScreen } from "./ScreenPreview";

describe("ScreenPreview", () => {
  it("parses known preview screen aliases", () => {
    expect(parsePreviewScreen("?previewscreen=festival_complete")).toBe(
      "FESTIVAL_COMPLETE"
    );
    expect(parsePreviewScreen("?previewscreen=festival")).toBe(
      "FESTIVAL_COMPLETE"
    );
    expect(parsePreviewScreen("?previewscreen=complete")).toBe(
      "LEVEL_COMPLETE"
    );
    expect(parsePreviewScreen("?previewscreen=failed")).toBe("LEVEL_FAILED");
    expect(parsePreviewScreen("?previewscreen=unknown")).toBeNull();
  });

  it("builds a deterministic festival preview snapshot", () => {
    const snapshot = buildPreviewSnapshot("FESTIVAL_COMPLETE", null);
    expect(snapshot.screen).toBe("FESTIVAL_COMPLETE");
    expect(snapshot.level.state).toBe("FESTIVAL_COMPLETE");
    expect(snapshot.runtime?.outcome).toBe("COMPLETED");
    expect(snapshot.runtime?.performanceTier).toBe("GOLD");
    expect(snapshot.runtime?.sessionName).toBe("Evening");
    expect(snapshot.level.cumulativeScore).toBeGreaterThan(0);
  });
});
