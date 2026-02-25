import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

function resolveClientPath() {
  const codeHome = process.env.CODEX_HOME ?? path.join(process.env.HOME ?? "", ".codex");
  return path.join(
    codeHome,
    "skills",
    "develop-web-game",
    "scripts",
    "web_game_playwright_client.js"
  );
}

const clientPath = resolveClientPath();
if (!existsSync(clientPath)) {
  console.error(
    `Playwright client not found at ${clientPath}. Set CODEX_HOME or install the develop-web-game skill.`
  );
  process.exit(1);
}

const url = process.env.STAGECALL_URL ?? "http://127.0.0.1:4273";
const iterations = process.env.STAGECALL_PW_ITERATIONS ?? "1";
const pauseMs = process.env.STAGECALL_PW_PAUSE_MS ?? "400";
const outDir = process.env.STAGECALL_PW_OUTDIR ?? "output/web-game/start-check";

const args = [
  clientPath,
  "--url",
  url,
  "--click-selector",
  ".screen-action.primary",
  "--actions-file",
  "scripts/playwright/start-actions.json",
  "--iterations",
  iterations,
  "--pause-ms",
  pauseMs,
  "--screenshot-dir",
  outDir
];

const child = spawn(process.execPath, args, {
  stdio: "inherit",
  cwd: process.cwd(),
  env: process.env
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
