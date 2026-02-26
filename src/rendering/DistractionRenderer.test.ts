import { describe, expect, it } from "vitest";
import { getDistractionLabel } from "./DistractionRenderer";

describe("getDistractionLabel", () => {
  it("maps each distraction type to a tiny UI label", () => {
    expect(getDistractionLabel("merch_stand")).toBe("Merch");
    expect(getDistractionLabel("burger_shack")).toBe("Burger Shack");
    expect(getDistractionLabel("paparazzi")).toBe("Paparazzi");
    expect(getDistractionLabel("fan_crowd")).toBe("Fan Crowd");
  });
});
