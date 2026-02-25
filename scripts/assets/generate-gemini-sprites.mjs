#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { processTransparentSprite } from "./lib/transparency.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_MANIFEST = path.join(ROOT, "assets/sprites/generated/manifest.json");
const DEFAULT_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image-preview";
const MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";

function parseArgs(argv) {
  const args = {
    manifest: DEFAULT_MANIFEST,
    model: DEFAULT_MODEL,
    dryRun: false,
    max: null,
    only: null,
    concurrency: 1
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--manifest" && next) {
      args.manifest = path.resolve(next);
      i += 1;
      continue;
    }
    if (arg === "--model" && next) {
      args.model = next;
      i += 1;
      continue;
    }
    if (arg === "--max" && next) {
      args.max = Math.max(1, Number(next) || 1);
      i += 1;
      continue;
    }
    if (arg === "--only" && next) {
      args.only = new Set(
        next
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      );
      i += 1;
      continue;
    }
    if (arg === "--concurrency" && next) {
      args.concurrency = Math.max(1, Number(next) || 1);
      i += 1;
      continue;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function hasSips() {
  const probe = spawnSync("which", ["sips"], {
    stdio: "pipe",
    encoding: "utf8"
  });
  return probe.status === 0;
}

function extractInlineImage(responseJson) {
  const candidates = responseJson?.candidates;
  if (!Array.isArray(candidates)) {
    return null;
  }

  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) {
      continue;
    }
    for (const part of parts) {
      const inline = part?.inlineData || part?.inline_data;
      if (inline?.data) {
        return {
          data: inline.data,
          mimeType: inline.mimeType || inline.mime_type || "image/png"
        };
      }
    }
  }

  return null;
}

function appendStyle(prompt, styleSuffix) {
  if (!styleSuffix) {
    return prompt;
  }
  return `${prompt.trim()}\n\n${styleSuffix.trim()}`;
}

async function checkModelAvailability(apiKey, model) {
  const url = `${MODELS_URL}?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to list Gemini models (${response.status}): ${detail}`);
  }
  const body = await response.json();
  const models = Array.isArray(body.models) ? body.models : [];
  return models.some((entry) => typeof entry?.name === "string" && entry.name.includes(model));
}

async function generateImage({ apiKey, model, prompt }) {
  const url = `${MODELS_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"]
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${detail}`);
  }

  const body = await response.json();
  const inline = extractInlineImage(body);
  if (!inline) {
    throw new Error(`No inline image returned for prompt: ${prompt.slice(0, 80)}...`);
  }
  return inline;
}

function writePng(rawOutPath, dataBase64) {
  ensureDir(rawOutPath);
  fs.writeFileSync(rawOutPath, Buffer.from(dataBase64, "base64"));
}

function resizeWithSips(fromPath, toPath, width, height) {
  ensureDir(toPath);
  const result = spawnSync(
    "sips",
    [
      "--resampleHeightWidth",
      String(height),
      String(width),
      fromPath,
      "--out",
      toPath
    ],
    {
      stdio: "pipe",
      encoding: "utf8"
    }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Failed resizing ${toPath}`);
  }
}

async function runPool(items, limit, worker) {
  const queue = [...items];
  const workers = Array.from({ length: limit }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) {
        return;
      }
      await worker(next);
    }
  });
  await Promise.all(workers);
}

function selectEntries(entries, args) {
  let selected = entries;
  if (args.only) {
    selected = selected.filter((entry) => args.only.has(entry.id));
  }
  if (args.max) {
    selected = selected.slice(0, args.max);
  }
  return selected;
}

async function main() {
  const args = parseArgs(process.argv);
  const manifest = readJson(args.manifest);
  const manifestDir = path.dirname(args.manifest);
  const promptsRoot = path.resolve(ROOT, manifest.promptsRoot || "assets/sprites/generated/prompts");
  const outputsRoot = path.resolve(ROOT, manifest.outputsRoot || "public/assets/maps/govball/generated");
  const styleSuffix = manifest.styleSuffix || "";
  const runTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runReportPath = path.join(
    manifestDir,
    "reports",
    `sprite-run-${runTimestamp}.json`
  );
  const rawRoot = path.join(outputsRoot, "_raw");
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  const selected = selectEntries(entries, args);

  if (selected.length === 0) {
    throw new Error("No sprite entries selected. Check --only/--max and manifest content.");
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  console.log(`Manifest: ${args.manifest}`);
  console.log(`Model: ${args.model}`);
  console.log(`Entries selected: ${selected.length}`);

  if (!apiKey || args.dryRun) {
    if (!apiKey) {
      console.log("GEMINI_API_KEY/GOOGLE_API_KEY not set. Running in dry-run mode.");
    }
    for (const entry of selected) {
      const outPath = path.join(outputsRoot, entry.out);
      console.log(`[dry-run] ${entry.id} -> ${outPath}`);
    }
    return;
  }

  const modelAvailable = await checkModelAvailability(apiKey, args.model);
  if (!modelAvailable) {
    throw new Error(`Model "${args.model}" not listed for this API key.`);
  }

  const sipsAvailable = hasSips();
  if (!sipsAvailable) {
    console.warn("sips not found, raw outputs will be copied without deterministic resize.");
  }

  const report = {
    generatedAt: new Date().toISOString(),
    model: args.model,
    manifest: args.manifest,
    entries: []
  };

  await runPool(selected, args.concurrency, async (entry) => {
    const promptPath = path.join(promptsRoot, entry.promptFile);
    const targetPath = path.join(outputsRoot, entry.out);
    const rawPath = path.join(rawRoot, `${entry.id}.png`);
    const prompt = fs.readFileSync(promptPath, "utf8");
    const finalPrompt = appendStyle(prompt, styleSuffix);
    const startedAt = Date.now();
    try {
      console.log(`Generating: ${entry.id}`);
      const image = await generateImage({
        apiKey,
        model: args.model,
        prompt: finalPrompt
      });
      writePng(rawPath, image.data);
      if (sipsAvailable) {
        resizeWithSips(rawPath, targetPath, entry.width, entry.height);
      } else {
        ensureDir(targetPath);
        fs.copyFileSync(rawPath, targetPath);
      }
      let transparency = null;
      if (entry.category !== "background") {
        const transparencyResult = await processTransparentSprite(targetPath, {
          tolerance: 36,
          softTolerance: 24,
          maxSoftAlpha: 104
        });
        transparency = {
          changed: transparencyResult.changed,
          transparentPixels: transparencyResult.after.transparentPixels,
          semiTransparentPixels: transparencyResult.after.semiTransparentPixels,
          clearedPixels: transparencyResult.clearedPixels,
          softenedPixels: transparencyResult.softenedPixels
        };
      }
      report.entries.push({
        id: entry.id,
        promptFile: entry.promptFile,
        out: path.relative(ROOT, targetPath),
        status: "ok",
        transparency,
        durationMs: Date.now() - startedAt
      });
      console.log(`Saved: ${path.relative(ROOT, targetPath)}`);
    } catch (error) {
      report.entries.push({
        id: entry.id,
        promptFile: entry.promptFile,
        out: path.relative(ROOT, targetPath),
        status: "error",
        error: String(error),
        durationMs: Date.now() - startedAt
      });
      console.error(`Failed: ${entry.id}`);
      console.error(String(error));
    }
  });

  ensureDir(runReportPath);
  fs.writeFileSync(runReportPath, JSON.stringify(report, null, 2));
  console.log(`Report: ${path.relative(ROOT, runReportPath)}`);

  const failed = report.entries.filter((entry) => entry.status !== "ok");
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
