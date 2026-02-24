import type { FestivalMap } from "../config/FestivalConfig";
import { collectMapAssetPaths, resolveAssetPath } from "../maps/MapLoader";

export interface AssetBundleManifest {
  id: string;
  assets: string[];
  retainOnUnload?: boolean;
}

export const GOVBALL_MAP_CONFIG_PATH = "/assets/maps/govball/config.json";
export const BOOT_BUNDLE_ID = "boot";
export const GOVBALL_BUNDLE_ID = "govball-festival";

export const BOOT_BUNDLE_MANIFEST: AssetBundleManifest = {
  id: BOOT_BUNDLE_ID,
  assets: [GOVBALL_MAP_CONFIG_PATH],
  retainOnUnload: true
};

export function createGovBallBundleManifest(
  map: FestivalMap
): AssetBundleManifest {
  const assets = collectMapAssetPaths(map).map(resolveAssetPath);
  return {
    id: GOVBALL_BUNDLE_ID,
    assets: Array.from(new Set(assets))
  };
}
