export interface ThemeSemanticPalette {
  success: string;
  warning: string;
  danger: string;
  neutralMap: string;
  energyAccent: string;
  textStrong: string;
  textSoft: string;
  panelBg: string;
  panelStroke: string;
}

export interface ThemeTypography {
  display: string;
  body: string;
}

export interface ThemeMotionProfile {
  microMs: number;
  transitionMs: number;
  heroMs: number;
}

export interface ThemePreset {
  id: string;
  name: string;
  audioMixProfile: string;
  semantic: ThemeSemanticPalette;
  typography: ThemeTypography;
  motion: ThemeMotionProfile;
}

export interface ThemeCatalog {
  version: number;
  defaultThemeId: string;
  festivalThemeById: Record<string, string>;
  themes: ThemePreset[];
}
