import type {
  SessionFxConfig,
  SessionFxProfileConfig,
  SessionPeriod
} from "./FestivalConfig";

export const SESSION_PERIODS: SessionPeriod[] = [
  "morning",
  "afternoon",
  "evening"
];

export const DEFAULT_SESSION_FX_CONFIG: Record<
  SessionPeriod,
  Required<SessionFxProfileConfig>
> = {
  morning: {
    overlayColor: "#8BBEFF",
    overlayOpacity: 0.1,
    particleColor: "#F9F3D2",
    particleCount: 14,
    particleSpeed: 16,
    stageGlow: 0.14
  },
  afternoon: {
    overlayColor: "#FFD28A",
    overlayOpacity: 0.14,
    particleColor: "#FFE8B4",
    particleCount: 10,
    particleSpeed: 12,
    stageGlow: 0.2
  },
  evening: {
    overlayColor: "#293D7A",
    overlayOpacity: 0.24,
    particleColor: "#FFC875",
    particleCount: 22,
    particleSpeed: 26,
    stageGlow: 0.44
  }
};

export type SessionFxPreviewMode = "auto" | SessionPeriod;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeHexColor(
  value: string | undefined,
  fallback: string
): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!/^#?[0-9a-fA-F]{6}$/.test(trimmed)) {
    return fallback;
  }
  return trimmed.startsWith("#") ? trimmed.toUpperCase() : `#${trimmed.toUpperCase()}`;
}

export function sanitizeSessionFxProfile(
  profile: SessionFxProfileConfig | undefined,
  fallback: Required<SessionFxProfileConfig>
): Required<SessionFxProfileConfig> {
  return {
    overlayColor: normalizeHexColor(profile?.overlayColor, fallback.overlayColor),
    overlayOpacity: Number.isFinite(profile?.overlayOpacity)
      ? clamp(Number(profile?.overlayOpacity), 0, 0.6)
      : fallback.overlayOpacity,
    particleColor: normalizeHexColor(profile?.particleColor, fallback.particleColor),
    particleCount: Number.isFinite(profile?.particleCount)
      ? Math.round(clamp(Number(profile?.particleCount), 0, 80))
      : fallback.particleCount,
    particleSpeed: Number.isFinite(profile?.particleSpeed)
      ? clamp(Number(profile?.particleSpeed), 4, 64)
      : fallback.particleSpeed,
    stageGlow: Number.isFinite(profile?.stageGlow)
      ? clamp(Number(profile?.stageGlow), 0, 1)
      : fallback.stageGlow
  };
}

export function resolveSessionFxProfile(
  config: SessionFxConfig | undefined,
  period: SessionPeriod
): Required<SessionFxProfileConfig> {
  const fallback = DEFAULT_SESSION_FX_CONFIG[period];
  return sanitizeSessionFxProfile(config?.[period], fallback);
}

export function normalizeSessionPeriod(
  sessionName: string | null | undefined,
  sessionIndexInDay?: number | null
): SessionPeriod {
  const normalizedName = (sessionName ?? "").toLowerCase();
  if (normalizedName.includes("morn")) {
    return "morning";
  }
  if (normalizedName.includes("after")) {
    return "afternoon";
  }
  if (normalizedName.includes("even") || normalizedName.includes("night")) {
    return "evening";
  }
  if (sessionIndexInDay === 2) {
    return "afternoon";
  }
  if (sessionIndexInDay === 3) {
    return "evening";
  }
  return "morning";
}

export function resolveSessionPreviewMode(
  value: string | null | undefined
): SessionFxPreviewMode {
  const normalized = (value ?? "").toLowerCase().trim();
  if (normalized === "morning") {
    return "morning";
  }
  if (normalized === "afternoon") {
    return "afternoon";
  }
  if (normalized === "evening") {
    return "evening";
  }
  return "auto";
}

