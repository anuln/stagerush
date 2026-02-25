import themeCatalogJson from "../../public/assets/themes/festival-presets.json";
import type { ThemeCatalog, ThemePreset } from "./ThemePreset";

const themeCatalog = themeCatalogJson as ThemeCatalog;

const themesById = new Map<string, ThemePreset>(
  themeCatalog.themes.map((theme) => [theme.id, theme])
);

function getDefaultTheme(): ThemePreset {
  const defaultTheme = themesById.get(themeCatalog.defaultThemeId);
  if (defaultTheme) {
    return defaultTheme;
  }
  return themeCatalog.themes[0];
}

export interface ResolveThemeInput {
  festivalId?: string;
  themeId?: string;
}

export function resolveThemePreset(input: ResolveThemeInput): ThemePreset {
  if (input.themeId) {
    const resolved = themesById.get(input.themeId);
    if (resolved) {
      return resolved;
    }
  }

  if (input.festivalId) {
    const mappedThemeId = themeCatalog.festivalThemeById[input.festivalId];
    if (mappedThemeId) {
      const resolved = themesById.get(mappedThemeId);
      if (resolved) {
        return resolved;
      }
    }
  }

  return getDefaultTheme();
}

export function getThemeCssVariables(
  theme: ThemePreset
): Record<string, string | number> {
  return {
    "--theme-success": theme.semantic.success,
    "--theme-warning": theme.semantic.warning,
    "--theme-danger": theme.semantic.danger,
    "--theme-neutral-map": theme.semantic.neutralMap,
    "--theme-energy-accent": theme.semantic.energyAccent,
    "--theme-text-strong": theme.semantic.textStrong,
    "--theme-text-soft": theme.semantic.textSoft,
    "--theme-panel-bg": theme.semantic.panelBg,
    "--theme-panel-stroke": theme.semantic.panelStroke,
    "--theme-font-display": theme.typography.display,
    "--theme-font-body": theme.typography.body,
    "--theme-motion-micro-ms": theme.motion.microMs,
    "--theme-motion-transition-ms": theme.motion.transitionMs,
    "--theme-motion-hero-ms": theme.motion.heroMs
  };
}

export function applyThemeToDocument(
  theme: ThemePreset,
  root: HTMLElement = document.documentElement
): void {
  root.dataset.festivalTheme = theme.id;
  const vars = getThemeCssVariables(theme);
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, String(value));
  }
}
