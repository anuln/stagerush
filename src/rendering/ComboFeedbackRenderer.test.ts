import { describe, expect, it } from "vitest";
import { buildComboBadgeModels } from "./ComboFeedbackRenderer";

describe("ComboFeedbackRenderer", () => {
  it("builds stage-linked badge models for active combos", () => {
    const badges = buildComboBadgeModels({
      nowMs: 6000,
      activeCombos: [
        { stageId: "main-stage", chainLength: 2, multiplier: 1.5, expiresAtMs: 10000 },
        { stageId: "tent-stage", chainLength: 3, multiplier: 2, expiresAtMs: 9000 }
      ],
      stageSnapshots: [
        {
          id: "main-stage",
          size: "large",
          color: "#ff6b35",
          position: { x: 320, y: 220 },
          isOccupied: false,
          currentArtistId: null,
          queueLength: 0
        },
        {
          id: "tent-stage",
          size: "small",
          color: "#7bff00",
          position: { x: 160, y: 280 },
          isOccupied: true,
          currentArtistId: "a1",
          queueLength: 1
        }
      ]
    });

    expect(badges).toHaveLength(2);
    expect(badges[0]).toMatchObject({
      stageId: "main-stage",
      label: "1.5x",
      position: { x: 320, y: 170 }
    });
    expect(badges[1]).toMatchObject({
      stageId: "tent-stage",
      label: "2.0x",
      position: { x: 160, y: 230 }
    });
    expect(badges[1].scale).toBeGreaterThan(badges[0].scale);
  });

  it("filters expired combos and combos for unknown stages", () => {
    const badges = buildComboBadgeModels({
      nowMs: 9001,
      activeCombos: [
        { stageId: "main-stage", chainLength: 2, multiplier: 1.5, expiresAtMs: 9000 },
        { stageId: "missing-stage", chainLength: 4, multiplier: 3, expiresAtMs: 12000 }
      ],
      stageSnapshots: [
        {
          id: "main-stage",
          size: "large",
          color: "#ff6b35",
          position: { x: 320, y: 220 },
          isOccupied: false,
          currentArtistId: null,
          queueLength: 0
        }
      ]
    });

    expect(badges).toHaveLength(0);
  });
});
