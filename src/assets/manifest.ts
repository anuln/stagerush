import type { FestivalMap } from "../config/FestivalConfig";
import { collectMapAssetPaths, resolveAssetPath } from "../maps/MapLoader";

export interface AssetBundleManifest {
  id: string;
  assets: string[];
  retainOnUnload?: boolean;
}

export const FESTIVAL_INDEX_PATH = "/assets/maps/index.json";
export const GOVBALL_MAP_CONFIG_PATH = "/assets/maps/govball/config.json";
export const BOOT_BUNDLE_ID = "boot";
export const GOVBALL_BUNDLE_ID = "govball-festival";

export const BOOT_BUNDLE_MANIFEST: AssetBundleManifest = {
  id: BOOT_BUNDLE_ID,
  assets: [FESTIVAL_INDEX_PATH],
  retainOnUnload: true
};

export function createGovBallBundleManifest(
  map: FestivalMap
): AssetBundleManifest {
  return createFestivalBundleManifest(map, GOVBALL_BUNDLE_ID);
}

export function createFestivalBundleManifest(
  map: FestivalMap,
  bundleId: string
): AssetBundleManifest {
  const assets = collectMapAssetPaths(map).map(resolveAssetPath);
  return {
    id: bundleId,
    assets: Array.from(new Set(assets))
  };
}
