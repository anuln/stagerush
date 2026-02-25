export type StageSize = "large" | "medium" | "small";
export type ArtistTier = "headliner" | "midtier" | "newcomer";
export type AssetPath = string;
export type SessionPeriod = "morning" | "afternoon" | "evening";
export type DistractionType =
  | "merch_stand"
  | "burger_shack"
  | "paparazzi"
  | "fan_crowd";

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface StageConfig {
  id: string;
  size: StageSize;
  position: NormalizedPoint;
  snapRadius: number;
  sprite: AssetPath;
  color: string;
}

export interface SpawnPointConfig {
  id: string;
  position: NormalizedPoint;
  driftAngle: number;
}

export interface DistractionConfig {
  id: string;
  type: DistractionType;
  position: NormalizedPoint;
  radius: number;
  delay: number;
  appearsAtLevel: number;
  sprite: AssetPath;
}

export interface ArtistSpriteConfig {
  id: string;
  name: string;
  tier: ArtistTier;
  genre?: string;
  debutLevel?: number;
  rotationWeight?: number;
  seed?: number;
  seedDeterminismWarning?: string;
  performanceAudio?: {
    clip?: AssetPath;
    lengthSec?: number;
    promptText?: string;
  };
  promptByPose?: {
    pose1?: string;
    pose2?: string;
    pose3?: string;
    distracted?: string;
    performing?: string;
    performanceAudio?: string;
  };
  sprites: {
    walk: AssetPath[];
    idle?: AssetPath;
    distracted?: AssetPath;
    performing: AssetPath;
  };
}

export interface LevelConfig {
  levelNumber: number;
  totalArtists: number;
  targetSets?: number;
  maxSimultaneous: number;
  timerRange: [number, number];
  tierWeights: {
    headliner: number;
    midtier: number;
    newcomer: number;
  };
  activeDistractions: string[];
  spawnInterval: [number, number];
}

export interface FestivalScheduleConfig {
  days?: number;
  sessionsPerDay?: number;
  sessionNames?: string[];
}

export interface IntroPresentationConfig {
  fitMode?: "cover" | "contain";
  focusX?: number;
  focusY?: number;
  zoom?: number;
  overlayOpacity?: number;
}

export interface SessionFxProfileConfig {
  overlayColor?: string;
  overlayOpacity?: number;
  particleColor?: string;
  particleCount?: number;
  particleSpeed?: number;
  stageGlow?: number;
}

export interface SessionFxConfig {
  morning?: SessionFxProfileConfig;
  afternoon?: SessionFxProfileConfig;
  evening?: SessionFxProfileConfig;
}

export interface FestivalAssets {
  artists: ArtistSpriteConfig[];
  stageSprites: Record<string, AssetPath>;
  distractionSprites: Record<string, AssetPath>;
  audio: Record<string, AssetPath>;
}

export interface FestivalMap {
  id: string;
  name: string;
  description: string;
  themeId?: string;
  schedule?: FestivalScheduleConfig;
  totalLevels: number;
  background: AssetPath;
  introScreen?: AssetPath;
  introPresentation?: IntroPresentationConfig;
  sessionFx?: SessionFxConfig;
  stages: StageConfig[];
  spawnPoints: SpawnPointConfig[];
  distractions: DistractionConfig[];
  levels: LevelConfig[];
  assets: FestivalAssets;
}
