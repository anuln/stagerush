export type StageSize = "large" | "medium" | "small";
export type ArtistTier = "headliner" | "midtier" | "newcomer";
export type AssetPath = string;
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
  sprites: {
    walk: AssetPath[];
    idle: AssetPath;
    performing: AssetPath;
  };
}

export interface LevelConfig {
  levelNumber: number;
  totalArtists: number;
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
  totalLevels: number;
  background: AssetPath;
  stages: StageConfig[];
  spawnPoints: SpawnPointConfig[];
  distractions: DistractionConfig[];
  levels: LevelConfig[];
  assets: FestivalAssets;
}
