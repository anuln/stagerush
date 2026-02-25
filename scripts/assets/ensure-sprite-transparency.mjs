#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeAlpha,
  ensureFileDir,
  processTransparentSprite,
  readImageRGBA
} from "./lib/transparency.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAP_CONFIG_PATH = path.join(ROOT, "public/assets/maps/govball/config.json");
const SPRITE_CATALOG_PATH = path.join(
  ROOT,
  "public/assets/admin/sprite_catalog.json"
);
const FALLBACK_ARTIST_PATH = path.join(
  ROOT,
  "public/assets/maps/govball/generated/artists/artist_headliner_a_idle_v1.png"
);

function parseArgs(argv) {
  return {
    checkOnly: argv.includes("--check"),
    noHydrateMissing: argv.includes("--no-hydrate-missing")
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function toAbsolutePublicPath(relativePath) {
  return path.join(ROOT, "public", String(relativePath).replace(/^\/+/, ""));
}

function collectSpritePaths() {
  const mapConfig = readJson(MAP_CONFIG_PATH);
  const spriteCatalog = readJson(SPRITE_CATALOG_PATH);
  const paths = new Set();

  for (const stage of mapConfig.stages ?? []) {
    if (stage?.sprite) {
      paths.add(stage.sprite);
    }
  }
  for (const distraction of mapConfig.distractions ?? []) {
    if (distraction?.sprite) {
      paths.add(distraction.sprite);
    }
  }
  for (const artist of mapConfig.assets?.artists ?? []) {
    if (artist?.sprites?.idle) {
      paths.add(artist.sprites.idle);
    }
    if (artist?.sprites?.performing) {
      paths.add(artist.sprites.performing);
    }
    for (const frame of artist?.sprites?.walk ?? []) {
      paths.add(frame);
    }
  }
  for (const entry of spriteCatalog.entries ?? []) {
    if (entry?.category === "background") {
      continue;
    }
    if (entry?.assetPath) {
      paths.add(entry.assetPath);
    }
  }

  return Array.from(paths)
    .map((assetPath) => ({
      assetPath,
      absolutePath: toAbsolutePublicPath(assetPath)
    }))
    .sort((a, b) => a.assetPath.localeCompare(b.assetPath));
}

function looksLikeArtistPath(absolutePath) {
  return absolutePath.includes("/assets/maps/govball/artists/");
}

function hydrateMissingAsset(absolutePath) {
  if (!fs.existsSync(FALLBACK_ARTIST_PATH)) {
    return false;
  }
  ensureFileDir(absolutePath);
  fs.copyFileSync(FALLBACK_ARTIST_PATH, absolutePath);
  return true;
}

async function main() {
  const args = parseArgs(process.argv);
  const targets = collectSpritePaths();
  const report = {
    checkedAt: new Date().toISOString(),
    checkOnly: args.checkOnly,
    processed: [],
    missing: [],
    failedTransparency: []
  };

  for (const target of targets) {
    const exists = fs.existsSync(target.absolutePath);
    if (!exists) {
      let hydrated = false;
      if (!args.noHydrateMissing && looksLikeArtistPath(target.absolutePath)) {
        hydrated = hydrateMissingAsset(target.absolutePath);
      }
      if (!hydrated) {
        report.missing.push(target.assetPath);
        continue;
      }
    }

    if (args.checkOnly) {
      const { data } = await readImageRGBA(target.absolutePath);
      const alpha = analyzeAlpha(data);
      report.processed.push({
        path: target.assetPath,
        changed: false,
        transparentPixels: alpha.transparentPixels,
        semiTransparentPixels: alpha.semiTransparentPixels
      });
      if (alpha.transparentPixels === 0 && alpha.semiTransparentPixels === 0) {
        report.failedTransparency.push(target.assetPath);
      }
      continue;
    }

    const result = await processTransparentSprite(target.absolutePath, {
      tolerance: 36,
      softTolerance: 24,
      maxSoftAlpha: 104
    });
    report.processed.push({
      path: target.assetPath,
      changed: result.changed,
      transparentPixels: result.after.transparentPixels,
      semiTransparentPixels: result.after.semiTransparentPixels,
      clearedPixels: result.clearedPixels,
      softenedPixels: result.softenedPixels
    });
    if (
      result.after.transparentPixels === 0 &&
      result.after.semiTransparentPixels === 0
    ) {
      report.failedTransparency.push(target.assetPath);
    }
  }

  const changedCount = report.processed.filter((item) => item.changed).length;
  console.log(`Processed: ${report.processed.length}`);
  console.log(`Changed: ${changedCount}`);
  if (report.missing.length > 0) {
    console.log(`Missing: ${report.missing.length}`);
    for (const missing of report.missing) {
      console.log(`  - ${missing}`);
    }
  }
  if (report.failedTransparency.length > 0) {
    console.log(`No transparency detected: ${report.failedTransparency.length}`);
    for (const item of report.failedTransparency) {
      console.log(`  - ${item}`);
    }
  }

  const reportDir = path.join(ROOT, "output/assets");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, "sprite-transparency-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report: ${path.relative(ROOT, reportPath)}`);

  if (report.missing.length > 0 || report.failedTransparency.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
