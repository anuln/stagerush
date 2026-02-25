import type { ArtistSpriteConfig, ArtistTier } from "../config/FestivalConfig";

interface ArtistProfilePoolOptions {
  levelNumber: number;
  rng?: () => number;
}

function clampWeight(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0.1, Math.min(6, value as number));
}

function toDebutLevel(entry: ArtistSpriteConfig): number {
  if (Number.isInteger(entry.debutLevel) && (entry.debutLevel ?? 0) > 0) {
    return entry.debutLevel as number;
  }
  return 1;
}

export class ArtistProfilePool {
  private readonly artists: ArtistSpriteConfig[];
  private readonly levelNumber: number;
  private readonly rng: () => number;
  private readonly bags: Record<ArtistTier, string[]> = {
    headliner: [],
    midtier: [],
    newcomer: []
  };
  private readonly lastPickByTier: Partial<Record<ArtistTier, string>> = {};

  constructor(artists: ArtistSpriteConfig[], options: ArtistProfilePoolOptions) {
    this.artists = artists;
    this.levelNumber = Math.max(1, Math.floor(options.levelNumber));
    this.rng = options.rng ?? Math.random;
  }

  pickProfileId(tier: ArtistTier): string | null {
    if (this.bags[tier].length === 0) {
      this.bags[tier] = this.buildBag(tier);
    }
    if (this.bags[tier].length === 0) {
      return null;
    }

    const bag = this.bags[tier];
    const last = this.lastPickByTier[tier];
    if (bag.length > 1 && last && bag[0] === last) {
      const swapIndex = 1 + Math.floor(this.rng() * (bag.length - 1));
      [bag[0], bag[swapIndex]] = [bag[swapIndex], bag[0]];
    }
    const next = bag.shift() ?? null;
    if (!next) {
      return null;
    }
    this.lastPickByTier[tier] = next;
    return next;
  }

  private buildBag(tier: ArtistTier): string[] {
    const tierArtists = this.artists.filter((entry) => entry.tier === tier);
    if (tierArtists.length === 0) {
      return [];
    }

    const eligible = tierArtists.filter(
      (entry) => toDebutLevel(entry) <= this.levelNumber
    );
    const source =
      eligible.length > 0
        ? eligible
        : [tierArtists.reduce((best, current) => (toDebutLevel(current) < toDebutLevel(best) ? current : best), tierArtists[0])];

    const weighted: string[] = [];
    for (const entry of source) {
      const copies = Math.max(1, Math.round(clampWeight(entry.rotationWeight)));
      for (let index = 0; index < copies; index += 1) {
        weighted.push(entry.id);
      }
    }

    for (let index = weighted.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(this.rng() * (index + 1));
      [weighted[index], weighted[swap]] = [weighted[swap], weighted[index]];
    }
    return weighted;
  }
}
