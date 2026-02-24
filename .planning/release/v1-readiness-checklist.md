# Stage Call V1 Readiness Checklist

**Owner:** Engineering  
**Last run:** 2026-02-24  
**Release target:** Stage Call V1 web release

## Gate Status

| Gate | Threshold | Command / Source | Latest Evidence | Status |
|---|---|---|---|---|
| Build integrity | Typecheck + production build succeed | `npm run build` | Build passes (2026-02-24) | PASS |
| Regression suite | Full automated tests pass | `npm test` | `91/91` tests pass (2026-02-24) | PASS |
| Soak reliability | 5/5 soak runs pass with zero command failures | `npm run qa:soak` | `.planning/reports/soak-latest.json` (`passedRuns=5`, `failedRuns=0`, `anomalies=0`) | PASS |
| Payload budget | `dist` payload <= 5 MB | `npm run perf:profile` | `.planning/reports/perf-baseline-latest.json` (`totalBytes=620722`) | PASS |
| Startup budget | Estimated first interactive <= 3000 ms | `npm run perf:profile` | `.planning/reports/perf-baseline-latest.json` (`estimatedFirstInteractiveMs=1258`) | PASS |
| Runtime frame policy | 60 FPS target with scaler fallback | `?perf=1&quality=auto` overlay + `GAME_CONFIG.performance` | Tiered quality scaler + runtime telemetry hooks implemented in app shell/runtime | PASS (tooling) |

## Required Commands

Run these in order before a release tag:

1. `npm run build`
2. `npm test`
3. `npm run perf:profile`
4. `npm run qa:soak`
5. `npm run qa:release` (optional combined re-check)

## Evidence Files

1. `.planning/reports/perf-baseline-latest.json`
2. `.planning/reports/soak-latest.json`
3. `.planning/phases/09-performance-qa-and-release-hardening/09-VERIFICATION.md`

## Manual Sign-Off

1. Confirm mobile interaction responsiveness using `?perf=1&quality=auto` in a representative browser/device profile.
2. Confirm no blocker defects in current issue queue.
3. Record release decision in Phase 9 verification report.
