import { describe, expect, it } from "vitest";
import { getThemeCssVariables, resolveThemePreset } from "./ThemeResolver";

describe("ThemeResolver", () => {
  it("resolves mapped festival themes and supports explicit theme override", () => {
    const mapped = resolveThemePreset({ festivalId: "govball2026" });
    expect(mapped.id).toBe("urban_pulse");

    const explicit = resolveThemePreset({
      festivalId: "govball2026",
      themeId: "desert_mirage"
    });
    expect(explicit.id).toBe("desert_mirage");
  });

  it("falls back to default theme when unknown values are passed", () => {
    const fallback = resolveThemePreset({
      festivalId: "unknown-fest",
      themeId: "missing-theme"
    });
    expect(fallback.id).toBe("urban_pulse");
  });

  it("exposes required semantic css variables", () => {
    const theme = resolveThemePreset({ festivalId: "govball2026" });
    const vars = getThemeCssVariables(theme);
    expect(vars["--theme-success"]).toBeTypeOf("string");
    expect(vars["--theme-warning"]).toBeTypeOf("string");
    expect(vars["--theme-danger"]).toBeTypeOf("string");
    expect(vars["--theme-font-display"]).toBeTypeOf("string");
    expect(vars["--theme-motion-hero-ms"]).toBeGreaterThan(0);
  });
});
