import { Assets } from "pixi.js";
import type { AssetBundleManifest } from "./manifest";

export interface AssetLoader {
  load(assetPaths: string[]): Promise<void>;
  unload(assetPaths: string[]): Promise<void>;
}

interface BundleManagerOptions {
  loader?: AssetLoader;
}

export interface BundleStatusSnapshot {
  activeBundles: string[];
  warmedAssets: string[];
}

const defaultLoader: AssetLoader = {
  async load(assetPaths: string[]): Promise<void> {
    if (assetPaths.length === 0) {
      return;
    }
    await Assets.load(assetPaths);
  },
  async unload(assetPaths: string[]): Promise<void> {
    if (assetPaths.length === 0) {
      return;
    }
    await Assets.unload(assetPaths);
  }
};

export class BundleManager {
  private readonly manifests = new Map<string, AssetBundleManifest>();
  private readonly loader: AssetLoader;
  private readonly activeBundles = new Set<string>();
  private readonly assetRefCounts = new Map<string, number>();
  private readonly warmedAssets = new Set<string>();

  constructor(
    manifests: AssetBundleManifest[] = [],
    options: BundleManagerOptions = {}
  ) {
    this.loader = options.loader ?? defaultLoader;
    for (const manifest of manifests) {
      this.registerManifest(manifest);
    }
  }

  registerManifest(manifest: AssetBundleManifest): void {
    this.manifests.set(manifest.id, {
      ...manifest,
      assets: Array.from(new Set(manifest.assets))
    });
  }

  isBundleLoaded(bundleId: string): boolean {
    return this.activeBundles.has(bundleId);
  }

  getStatus(): BundleStatusSnapshot {
    return {
      activeBundles: Array.from(this.activeBundles),
      warmedAssets: Array.from(this.warmedAssets)
    };
  }

  async warmBundle(bundleId: string): Promise<boolean> {
    const manifest = this.requireManifest(bundleId);
    const pendingAssets = manifest.assets.filter(
      (assetPath) =>
        (this.assetRefCounts.get(assetPath) ?? 0) === 0 &&
        !this.warmedAssets.has(assetPath)
    );

    if (pendingAssets.length === 0) {
      return false;
    }

    await this.loader.load(pendingAssets);
    for (const assetPath of pendingAssets) {
      this.warmedAssets.add(assetPath);
    }
    return true;
  }

  async loadBundle(bundleId: string): Promise<boolean> {
    if (this.activeBundles.has(bundleId)) {
      return false;
    }

    const manifest = this.requireManifest(bundleId);
    const pendingAssets = manifest.assets.filter(
      (assetPath) =>
        (this.assetRefCounts.get(assetPath) ?? 0) === 0 &&
        !this.warmedAssets.has(assetPath)
    );

    if (pendingAssets.length > 0) {
      await this.loader.load(pendingAssets);
      for (const assetPath of pendingAssets) {
        this.warmedAssets.add(assetPath);
      }
    }

    for (const assetPath of manifest.assets) {
      const count = this.assetRefCounts.get(assetPath) ?? 0;
      this.assetRefCounts.set(assetPath, count + 1);
    }
    this.activeBundles.add(bundleId);
    return true;
  }

  async unloadBundle(bundleId: string): Promise<boolean> {
    const manifest = this.requireManifest(bundleId);
    if (!this.activeBundles.has(bundleId)) {
      return false;
    }
    if (manifest.retainOnUnload) {
      return false;
    }

    this.activeBundles.delete(bundleId);
    const unloadableAssets: string[] = [];

    for (const assetPath of manifest.assets) {
      const nextCount = (this.assetRefCounts.get(assetPath) ?? 0) - 1;
      if (nextCount > 0) {
        this.assetRefCounts.set(assetPath, nextCount);
        continue;
      }
      this.assetRefCounts.delete(assetPath);
      this.warmedAssets.delete(assetPath);
      unloadableAssets.push(assetPath);
    }

    if (unloadableAssets.length > 0) {
      await this.loader.unload(unloadableAssets);
    }
    return true;
  }

  private requireManifest(bundleId: string): AssetBundleManifest {
    const manifest = this.manifests.get(bundleId);
    if (!manifest) {
      throw new Error(`Unknown asset bundle: ${bundleId}`);
    }
    return manifest;
  }
}
