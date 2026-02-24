export type StageSize = "large" | "medium" | "small";
export type ArtistTier = "headliner" | "midtier" | "newcomer";
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
  sprite: string;
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
  sprite: string;
}

export interface ArtistSpriteConfig {
  id: string;
  name: string;
  tier: ArtistTier;
  sprites: {
    walk: string[];
    idle: string;
    performing: string;
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
  stageSprites: Record<string, string>;
  distractionSprites: Record<string, string>;
  audio: Record<string, string>;
}

export interface FestivalMap {
  id: string;
  name: string;
  description: string;
  totalLevels: number;
  background: string;
  stages: StageConfig[];
  spawnPoints: SpawnPointConfig[];
  distractions: DistractionConfig[];
  levels: LevelConfig[];
  assets: FestivalAssets;
}
