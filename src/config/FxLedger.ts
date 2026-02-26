import type { SessionFxProfileConfig, SessionPeriod } from "./FestivalConfig";
import rawLedger from "./fx-ledger.json";

export interface FireworksFxProfile {
  enabled: boolean;
  burstCountMin: number;
  burstCountMax: number;
  particlesPerBurstMin: number;
  particlesPerBurstMax: number;
  launchIntervalMsMin: number;
  launchIntervalMsMax: number;
  durationMs: number;
  burstRadiusMin: number;
  burstRadiusMax: number;
  trailAlpha: number;
  colors: string[];
}

export interface LevelFxProfile {
  levelNumber: number;
  sessionPeriod: SessionPeriod;
  atmosphere: Required<SessionFxProfileConfig>;
  fireworks: FireworksFxProfile;
  notes?: string;
}

interface FxLedgerShape {
  schemaVersion: number;
  updatedAt: string;
  current: {
    version: string;
    defaults: {
      atmosphere: SessionFxProfileConfig;
      fireworks: FireworksFxProfile;
    };
    byLevel: Record<string, Partial<LevelFxProfile>>;
  };
  history: Array<{
    version: string;
    updatedAt: string;
    author?: string;
    summary: string;
  }>;
}

const LEDGER = rawLedger as FxLedgerShape;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeHexColor(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!/^#?[0-9a-fA-F]{6}$/.test(trimmed)) {
    return fallback;
  }
  return trimmed.startsWith("#") ? trimmed.toUpperCase() : `#${trimmed.toUpperCase()}`;
}

function normalizeSessionPeriod(value: unknown): SessionPeriod {
  if (value === "afternoon") {
    return "afternoon";
  }
  if (value === "evening") {
    return "evening";
  }
  return "morning";
}

function sanitizeAtmosphereProfile(
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
      ? Math.round(clamp(Number(profile?.particleCount), 0, 120))
      : fallback.particleCount,
    particleSpeed: Number.isFinite(profile?.particleSpeed)
      ? clamp(Number(profile?.particleSpeed), 4, 72)
      : fallback.particleSpeed,
    stageGlow: Number.isFinite(profile?.stageGlow)
      ? clamp(Number(profile?.stageGlow), 0, 1)
      : fallback.stageGlow
  };
}

function sanitizeFireworksProfile(
  profile: FireworksFxProfile | undefined,
  fallback: FireworksFxProfile
): FireworksFxProfile {
  const enabled = Boolean(profile?.enabled);
  const burstCountMin = Math.round(
    clamp(Number(profile?.burstCountMin ?? fallback.burstCountMin), 0, 30)
  );
  const burstCountMax = Math.round(
    clamp(
      Number(profile?.burstCountMax ?? fallback.burstCountMax),
      burstCountMin,
      36
    )
  );
  const particlesPerBurstMin = Math.round(
    clamp(
      Number(profile?.particlesPerBurstMin ?? fallback.particlesPerBurstMin),
      0,
      120
    )
  );
  const particlesPerBurstMax = Math.round(
    clamp(
      Number(profile?.particlesPerBurstMax ?? fallback.particlesPerBurstMax),
      particlesPerBurstMin,
      140
    )
  );
  const launchIntervalMsMin = Math.round(
    clamp(
      Number(profile?.launchIntervalMsMin ?? fallback.launchIntervalMsMin),
      60,
      2000
    )
  );
  const launchIntervalMsMax = Math.round(
    clamp(
      Number(profile?.launchIntervalMsMax ?? fallback.launchIntervalMsMax),
      launchIntervalMsMin,
      2200
    )
  );
  const durationMs = Math.round(
    clamp(Number(profile?.durationMs ?? fallback.durationMs), 400, 8000)
  );
  const burstRadiusMin = Math.round(
    clamp(Number(profile?.burstRadiusMin ?? fallback.burstRadiusMin), 12, 180)
  );
  const burstRadiusMax = Math.round(
    clamp(
      Number(profile?.burstRadiusMax ?? fallback.burstRadiusMax),
      burstRadiusMin,
      220
    )
  );
  const trailAlpha = clamp(
    Number(profile?.trailAlpha ?? fallback.trailAlpha),
    0.05,
    1
  );
  const colors = Array.isArray(profile?.colors)
    ? profile.colors.filter((value): value is string => typeof value === "string")
    : fallback.colors;
  return {
    enabled,
    burstCountMin,
    burstCountMax,
    particlesPerBurstMin,
    particlesPerBurstMax,
    launchIntervalMsMin,
    launchIntervalMsMax,
    durationMs,
    burstRadiusMin,
    burstRadiusMax,
    trailAlpha,
    colors: colors.length > 0 ? colors.map((entry) => normalizeHexColor(entry, "#FFFFFF")) : ["#FFFFFF"]
  };
}

function toRequiredAtmosphere(profile: SessionFxProfileConfig | undefined): Required<SessionFxProfileConfig> {
  const fallback: Required<SessionFxProfileConfig> = {
    overlayColor: "#8BBEFF",
    overlayOpacity: 0.1,
    particleColor: "#F9F3D2",
    particleCount: 14,
    particleSpeed: 16,
    stageGlow: 0.14
  };
  return sanitizeAtmosphereProfile(profile, fallback);
}

function toDefaultFireworks(profile: FireworksFxProfile | undefined): FireworksFxProfile {
  const fallback: FireworksFxProfile = {
    enabled: false,
    burstCountMin: 0,
    burstCountMax: 0,
    particlesPerBurstMin: 0,
    particlesPerBurstMax: 0,
    launchIntervalMsMin: 200,
    launchIntervalMsMax: 300,
    durationMs: 1000,
    burstRadiusMin: 20,
    burstRadiusMax: 30,
    trailAlpha: 0.8,
    colors: ["#FFFFFF"]
  };
  return sanitizeFireworksProfile(profile, fallback);
}

const DEFAULT_ATMOSPHERE = toRequiredAtmosphere(LEDGER.current.defaults.atmosphere);
const DEFAULT_FIREWORKS = toDefaultFireworks(LEDGER.current.defaults.fireworks);

function toLevelFxProfile(entry: Partial<LevelFxProfile>, levelNumber: number): LevelFxProfile {
  return {
    levelNumber,
    sessionPeriod: normalizeSessionPeriod(entry.sessionPeriod),
    atmosphere: sanitizeAtmosphereProfile(entry.atmosphere, DEFAULT_ATMOSPHERE),
    fireworks: sanitizeFireworksProfile(entry.fireworks, DEFAULT_FIREWORKS),
    notes: typeof entry.notes === "string" ? entry.notes : undefined
  };
}

export function resolveLevelFxProfile(levelNumber: number): LevelFxProfile {
  const bounded = Math.max(1, Math.floor(levelNumber));
  const fromLedger = LEDGER.current.byLevel[String(bounded)];
  if (fromLedger) {
    return toLevelFxProfile(fromLedger, bounded);
  }

  const fallbackLevels = Object.keys(LEDGER.current.byLevel)
    .map((key) => Number.parseInt(key, 10))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const highest = fallbackLevels[fallbackLevels.length - 1];
  if (Number.isFinite(highest)) {
    const highestEntry = LEDGER.current.byLevel[String(highest)];
    if (highestEntry) {
      return toLevelFxProfile(highestEntry, bounded);
    }
  }

  return {
    levelNumber: bounded,
    sessionPeriod: "morning",
    atmosphere: DEFAULT_ATMOSPHERE,
    fireworks: DEFAULT_FIREWORKS
  };
}

export function getFxLedgerSnapshot(): FxLedgerShape {
  return structuredClone(LEDGER);
}
