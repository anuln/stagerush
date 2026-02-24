#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const reportDir = join(rootDir, ".planning", "reports");
const now = new Date();
const isoStamp = now.toISOString();
const fileStamp = isoStamp.replace(/[:.]/g, "-");
const latestPath = join(reportDir, "soak-latest.json");
const timestampPath = join(reportDir, `soak-${fileStamp}.json`);

const args = parseArgs(process.argv.slice(2));
const runs = Math.max(1, args.runs);
const commands = [
  "npm test -- src/game/GameRuntime.test.ts src/game/GameManager.test.ts src/systems/CollisionSystem.test.ts src/systems/DistractionSystem.test.ts src/input/PathDrawingInput.test.ts",
  "npm run perf:profile"
];

const runReports = [];
const anomalies = [];

for (let index = 0; index < runs; index += 1) {
  const commandReports = [];
  for (const command of commands) {
    const started = Date.now();
    const result = spawnSync(command, {
      shell: true,
      cwd: rootDir,
      encoding: "utf8"
    });
    const durationMs = Date.now() - started;
    const report = {
      command,
      durationMs,
      exitCode: result.status ?? 1
    };
    commandReports.push(report);

    if ((result.status ?? 1) !== 0) {
      anomalies.push({
        run: index + 1,
        command,
        type: "command_failure",
        exitCode: result.status ?? 1,
        stderrTail: tail(result.stderr ?? "")
      });
    }
    if (durationMs > args.slowMs) {
      anomalies.push({
        run: index + 1,
        command,
        type: "slow_command",
        durationMs
      });
    }
  }
  runReports.push({
    run: index + 1,
    commands: commandReports,
    totalDurationMs: commandReports.reduce((sum, item) => sum + item.durationMs, 0)
  });
}

const totalDurationMs = runReports.reduce(
  (sum, item) => sum + item.totalDurationMs,
  0
);
const passedRuns = runReports.filter((run) =>
  run.commands.every((entry) => entry.exitCode === 0)
).length;

const report = {
  generatedAt: isoStamp,
  runs,
  commands,
  thresholds: {
    slowCommandMs: args.slowMs
  },
  totals: {
    passedRuns,
    failedRuns: runs - passedRuns,
    totalDurationMs
  },
  anomalies,
  runsDetail: runReports
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(timestampPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(latestPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`Saved soak report: ${stripRoot(latestPath, rootDir)}`);
console.log(`  Runs: ${runs}`);
console.log(`  Passed: ${passedRuns}/${runs}`);
console.log(`  Total duration: ${totalDurationMs}ms`);
console.log(`  Anomalies: ${anomalies.length}`);

process.exit(passedRuns === runs ? 0 : 1);

function parseArgs(argv) {
  const config = {
    runs: 5,
    slowMs: 4000
  };

  for (const arg of argv) {
    if (arg.startsWith("--runs=")) {
      const value = Number.parseInt(arg.slice("--runs=".length), 10);
      if (Number.isFinite(value) && value > 0) {
        config.runs = value;
      }
      continue;
    }
    if (arg.startsWith("--slow-ms=")) {
      const value = Number.parseInt(arg.slice("--slow-ms=".length), 10);
      if (Number.isFinite(value) && value > 0) {
        config.slowMs = value;
      }
    }
  }

  return config;
}

function tail(value, maxLength = 300) {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(value.length - maxLength);
}

function stripRoot(path, root) {
  return path.startsWith(root) ? path.slice(root.length + 1) : path;
}
