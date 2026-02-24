# Stage Call

## What This Is

Stage Call is a shipped mobile-first browser arcade game where players route drifting artists to stages using a single touch-drawing interaction under time pressure.

## Core Value

Path drawing must feel immediate and readable on mobile while creating meaningful routing decisions under pressure.

## Current State (v1.0 Shipped)

- Milestone: `v1.0 MVP` shipped on `2026-02-24`
- Scope delivered: phases `01` through `09` (foundation -> content -> performance hardening)
- Runtime quality controls: telemetry hooks, quality-tier scaler, profiling and soak command pipeline
- Validation status: all v1 requirements closed in milestone audit (`.planning/milestones/v1.0-MILESTONE-AUDIT.md`)
- Release evidence:
  - `.planning/reports/perf-baseline-latest.json`
  - `.planning/reports/soak-latest.json`
  - `.planning/release/v1-readiness-checklist.md`

## Validated Requirements (v1.0)

All v1 requirements were completed and audited:

- Core gameplay loop (`CORE-*`)
- Scoring/combo systems (`SCORE-*`)
- Hazards/routing pressure (`OBST-*`)
- Progression/session flow (`PROG-*`)
- UI/UX and readability (`UI-*`)
- Data/content/bundling (`DATA-*`)
- Performance and reliability gates (`PERF-*`, `TEST-*`)

See archive: `.planning/milestones/v1.0-REQUIREMENTS.md`.

## Next Milestone Goals (Draft)

- Run real-device thermal/performance validation to complement current command-based evidence.
- Capture browser-throttled network startup traces for non-estimated load timing evidence.
- Define post-v1 feature scope (services/expansion) via `$gsd-new-milestone`.

## Active Risks

- Thermal behavior on long sessions still needs physical-device confirmation.
- Startup timing currently uses artifact-based estimation; add real trace evidence in next milestone.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Mobile web delivery with PixiJS + TypeScript | Fast iteration and URL-native access | ✓ Good |
| One-touch path drawing as the primary verb | Keeps control model simple but skillful | ✓ Good |
| Config-driven festival schema and asset bundles | Supports scaling content packs without core rewrites | ✓ Good |
| Verify-before-claim workflow with phase summaries/verification docs | Prevents unverifiable completion claims | ✓ Good |
| Release gates as command pipeline (`build`, `test`, `perf`, `soak`) | Repeatable go/no-go evidence | ✓ Good |

---
*Last updated: 2026-02-24 after v1.0 milestone completion*
