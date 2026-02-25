import { existsSync, readFileSync } from "node:fs";
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
const outDir = process.env.STAGECALL_PW_STORYBOARD_OUTDIR ?? "output/web-game/storyboard-check";

const args = [
  clientPath,
  "--url",
  url,
  "--click-selector",
  ".screen-action.primary",
  "--actions-file",
  "scripts/playwright/storyboard-actions.json",
  "--iterations",
  "1",
  "--pause-ms",
  "450",
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
  if ((code ?? 1) !== 0) {
    process.exit(code ?? 1);
    return;
  }

  const statePath = path.join(process.cwd(), outDir, "state-0.json");
  if (!existsSync(statePath)) {
    console.error(`Storyboard check failed: missing ${statePath}`);
    process.exit(1);
    return;
  }

  const state = JSON.parse(readFileSync(statePath, "utf-8"));
  if (state.screen !== "PLAYING" || state.overlayVisible !== false) {
    console.error("Storyboard check failed: did not enter stable playing state.", state);
    process.exit(1);
    return;
  }

  console.log("Storyboard check passed.");
  process.exit(0);
});
