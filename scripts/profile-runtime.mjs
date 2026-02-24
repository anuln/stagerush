#!/usr/bin/env node

import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import { extname, join, resolve } from "node:path";

const rootDir = process.cwd();
const distDir = join(rootDir, "dist");
const reportDir = join(rootDir, ".planning", "reports");
const mapConfigPath = join(
  rootDir,
  "public",
  "assets",
  "maps",
  "govball",
  "config.json"
);

if (!existsSync(distDir)) {
  console.log("dist/ not found, running build first...");
  execSync("npm run build", { stdio: "inherit" });
}

const files = listFiles(distDir).map((path) => ({
  path,
  bytes: statSync(path).size
}));

const totalBytes = files.reduce((sum, entry) => sum + entry.bytes, 0);
const jsBytes = bytesByExt(files, ".js");
const cssBytes = bytesByExt(files, ".css");
const htmlBytes = bytesByExt(files, ".html");
const largestJs = largestByExt(files, ".js");
const payloadBudgetBytes = 5 * 1024 * 1024;

const estimated4GBytesPerSecond = 750 * 1024;
const estimatedFirstInteractiveMs = Math.round(
  (totalBytes / estimated4GBytesPerSecond) * 1000 + 450
);

const mapAssetCount = countMapAssetReferences(mapConfigPath);
const now = new Date();
const isoStamp = now.toISOString();
const fileStamp = isoStamp.replace(/[:.]/g, "-");

const report = {
  generatedAt: isoStamp,
  mode: "static-artifact-baseline",
  metrics: {
    bundle: {
      totalBytes,
      jsBytes,
      cssBytes,
      htmlBytes,
      largestJs: largestJs
        ? {
            path: stripRoot(largestJs.path, rootDir),
            bytes: largestJs.bytes
          }
        : null
    },
    loading: {
      estimatedFirstInteractiveMs
    },
    content: {
      mapAssetReferences: mapAssetCount
    },
    runtimeTargets: {
      frameBudgetMs: 16.67,
      targetFps: 60
    }
  },
  budgets: {
    payloadBudgetBytes,
    targetFirstInteractiveMs: 3000,
    withinPayloadBudget: totalBytes <= payloadBudgetBytes,
    withinStartupBudget: estimatedFirstInteractiveMs <= 3000
  }
};

mkdirSync(reportDir, { recursive: true });
const timestampedReportPath = join(reportDir, `perf-baseline-${fileStamp}.json`);
const latestReportPath = join(reportDir, "perf-baseline-latest.json");
writeFileSync(timestampedReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(latestReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`Saved performance baseline: ${stripRoot(latestReportPath, rootDir)}`);
console.log(`  Total dist payload: ${formatBytes(totalBytes)}`);
console.log(`  Estimated first interactive: ${estimatedFirstInteractiveMs}ms`);
console.log(
  `  Payload budget (<= 5MB): ${report.budgets.withinPayloadBudget ? "PASS" : "FAIL"}`
);
console.log(
  `  Startup budget (<= 3000ms estimate): ${report.budgets.withinStartupBudget ? "PASS" : "FAIL"}`
);

function listFiles(dirPath) {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function bytesByExt(files, extension) {
  return files
    .filter((entry) => extname(entry.path) === extension)
    .reduce((sum, entry) => sum + entry.bytes, 0);
}

function largestByExt(files, extension) {
  const filtered = files.filter((entry) => extname(entry.path) === extension);
  if (filtered.length === 0) {
    return null;
  }
  return filtered.reduce((largest, current) =>
    current.bytes > largest.bytes ? current : largest
  );
}

function countMapAssetReferences(path) {
  if (!existsSync(path)) {
    return 0;
  }
  const mapConfig = JSON.parse(readFileSync(path, "utf8"));
  const assets = new Set();

  function visit(value) {
    if (typeof value === "string" && value.includes("/")) {
      assets.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (value && typeof value === "object") {
      for (const item of Object.values(value)) {
        visit(item);
      }
    }
  }

  visit(mapConfig);
  return assets.size;
}

function formatBytes(value) {
  const kb = value / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(2)} MB`;
}

function stripRoot(path, root) {
  const absoluteRoot = resolve(root);
  return path.startsWith(absoluteRoot)
    ? path.slice(absoluteRoot.length + 1)
    : path;
}
