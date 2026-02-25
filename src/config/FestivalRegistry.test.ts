import { describe, expect, it } from "vitest";
import { parseFestivalRegistry } from "./FestivalRegistry";

describe("FestivalRegistry", () => {
  it("parses valid registry payload", () => {
    const registry = parseFestivalRegistry({
      defaultFestivalId: "govball2026",
      festivals: [
        {
          id: "govball2026",
          name: "Gov Ball 2026",
          mapConfigPath: "/assets/maps/govball/config.json",
          bundleId: "festival-govball2026"
        }
      ]
    });

    expect(registry.defaultFestivalId).toBe("govball2026");
    expect(registry.festivals).toHaveLength(1);
    expect(registry.festivals[0].id).toBe("govball2026");
  });

  it("rejects duplicate ids", () => {
    expect(() =>
      parseFestivalRegistry({
        festivals: [
          {
            id: "same",
            name: "A",
            mapConfigPath: "/assets/maps/a/config.json"
          },
          {
            id: "same",
            name: "B",
            mapConfigPath: "/assets/maps/b/config.json"
          }
        ]
      })
    ).toThrow(/must be unique/);
  });

  it("rejects unknown default festival id", () => {
    expect(() =>
      parseFestivalRegistry({
        defaultFestivalId: "missing",
        festivals: [
          {
            id: "govball2026",
            name: "Gov Ball 2026",
            mapConfigPath: "/assets/maps/govball/config.json"
          }
        ]
      })
    ).toThrow(/defaultFestivalId/);
  });
});
