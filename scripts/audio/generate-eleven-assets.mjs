#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_MANIFEST = path.join(ROOT, "assets/audio/generated/manifest.json");
const DEFAULT_MODEL_ID = "music_v1";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";

function parseArgs(argv) {
  const args = {
    manifest: DEFAULT_MANIFEST,
    dryRun: false,
    overwrite: false,
    only: null,
    max: null,
    modelId: DEFAULT_MODEL_ID,
    outputFormat: DEFAULT_OUTPUT_FORMAT,
    timeoutMs: 180_000
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--manifest" && next) {
      args.manifest = path.resolve(next);
      index += 1;
      continue;
    }
    if (arg === "--only" && next) {
      args.only = new Set(
        next
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      );
      index += 1;
      continue;
    }
    if (arg === "--max" && next) {
      args.max = Math.max(1, Number(next) || 1);
      index += 1;
      continue;
    }
    if (arg === "--model-id" && next) {
      args.modelId = next;
      index += 1;
      continue;
    }
    if (arg === "--output-format" && next) {
      args.outputFormat = next;
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms" && next) {
      args.timeoutMs = Math.max(5_000, Number(next) || 180_000);
      index += 1;
      continue;
    }
    if (arg === "--overwrite") {
      args.overwrite = true;
      continue;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function buildBody(entry, defaultModelId) {
  if (entry.type === "music") {
    return {
      prompt: entry.prompt,
      music_length_ms: Number(entry.durationMs),
      model_id: entry.modelId || defaultModelId
    };
  }
  if (entry.type === "sfx") {
    return {
      text: entry.prompt,
      duration_seconds: Number(entry.durationSec),
      prompt_influence: Number(entry.promptInfluence ?? 0.5)
    };
  }
  throw new Error(`Unsupported entry type "${entry.type}" for ${entry.id}`);
}

async function requestAudio({
  entry,
  apiKey,
  body,
  outputFormat,
  timeoutMs
}) {
  const endpoint = entry.type === "music" ? "/v1/music" : "/v1/sound-generation";
  const url = new URL(`https://api.elevenlabs.io${endpoint}`);
  if (outputFormat) {
    url.searchParams.set("output_format", outputFormat);
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const contentType = String(response.headers.get("content-type") || "");
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`HTTP ${response.status}: ${detail.slice(0, 600)}`);
    }
    if (!contentType.includes("audio") && !contentType.includes("octet-stream")) {
      const detail = await response.text();
      throw new Error(`Expected audio, got ${contentType || "unknown"}: ${detail.slice(0, 600)}`);
    }
    const payload = await response.arrayBuffer();
    return Buffer.from(payload);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function generateWithRetry(config, maxAttempts = 3) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await requestAudio(config);
    } catch (error) {
      const message = String(error);
      const retriable = message.includes("HTTP 429") || message.includes("HTTP 5");
      if (!retriable || attempt >= maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 1250));
    }
  }
  throw new Error("Audio generation retries exhausted");
}

async function main() {
  const args = parseArgs(process.argv);
  const manifest = readJson(args.manifest);
  const manifestDir = path.dirname(args.manifest);
  const promptsRoot = path.resolve(ROOT, manifest.promptsRoot || "assets/audio/generated/prompts");
  const outputsRoot = path.resolve(ROOT, manifest.outputsRoot || "public/assets/audio/govball/generated");
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  const selected = selectEntries(entries, args);

  if (selected.length === 0) {
    throw new Error("No audio entries selected. Check --only/--max and manifest content.");
  }

  console.log(`Manifest: ${args.manifest}`);
  console.log(`Entries selected: ${selected.length}`);
  console.log(`Output format: ${args.outputFormat}`);

  const apiKey = process.env.ELEVENLABS_API_KEY || "";
  if (!apiKey || args.dryRun) {
    if (!apiKey) {
      console.log("ELEVENLABS_API_KEY is not set. Running dry-run.");
    }
    for (const entry of selected) {
      const promptPath = path.join(promptsRoot, entry.promptFile);
      const targetPath = path.join(outputsRoot, entry.out);
      console.log(`[dry-run] ${entry.id} (${entry.type})`);
      console.log(`  prompt: ${promptPath}`);
      console.log(`  out: ${targetPath}`);
    }
    return;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    manifest: args.manifest,
    outputFormat: args.outputFormat,
    entries: []
  };

  for (const entry of selected) {
    const promptPath = path.join(promptsRoot, entry.promptFile);
    const targetPath = path.join(outputsRoot, entry.out);
    const startedAt = Date.now();
    if (!args.overwrite && fs.existsSync(targetPath)) {
      report.entries.push({
        id: entry.id,
        status: "skipped",
        out: path.relative(ROOT, targetPath),
        durationMs: Date.now() - startedAt
      });
      console.log(`Skipping existing: ${entry.id}`);
      continue;
    }

    try {
      const prompt = fs.readFileSync(promptPath, "utf8").trim();
      const body = buildBody(
        {
          ...entry,
          prompt
        },
        args.modelId
      );
      const bytes = await generateWithRetry({
        entry,
        apiKey,
        body,
        outputFormat: args.outputFormat,
        timeoutMs: args.timeoutMs
      });
      ensureDir(targetPath);
      fs.writeFileSync(targetPath, bytes);
      report.entries.push({
        id: entry.id,
        status: "ok",
        out: path.relative(ROOT, targetPath),
        bytes: bytes.length,
        durationMs: Date.now() - startedAt
      });
      console.log(`Saved: ${path.relative(ROOT, targetPath)}`);
    } catch (error) {
      report.entries.push({
        id: entry.id,
        status: "error",
        out: path.relative(ROOT, targetPath),
        error: String(error),
        durationMs: Date.now() - startedAt
      });
      console.error(`Failed: ${entry.id}`);
      console.error(String(error));
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(manifestDir, "reports", `audio-run-${stamp}.json`);
  ensureDir(reportPath);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report: ${path.relative(ROOT, reportPath)}`);

  const hasError = report.entries.some((entry) => entry.status === "error");
  if (hasError) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
