# Stage Call

## What This Is

Stage Call is a mobile-first, browser-based path-drawing arcade game where the player acts as a festival stage manager. Artists continuously drift across the map, and the player must draw fast, readable routes to deliver them to stages before timers expire. The core experience is short, high-pressure sessions where one touch verb drives all strategy: timing, sequencing, and traffic control.

## Core Value

Path drawing must feel immediate and readable on mobile while creating meaningful routing decisions under pressure.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Build the full spawn-drift-draw-follow-arrive-score gameplay loop for a complete festival run
- [ ] Preserve the one-verb touch interaction model with smooth pathing and high board readability
- [ ] Deliver strategic depth via tier-to-stage scoring, combo chaining, collisions, and distractions
- [ ] Ship progression, persistence, and leaderboard-ready session flow for replayability
- [ ] Hit mobile performance and latency targets on mid-range 2022+ devices
- [ ] Use a configuration-driven content pipeline for festival maps, entities, and assets

### Out of Scope

- Native app-store distribution (iOS/Android binaries) — V1 is web-first for rapid sharing and iteration
- Real-time multiplayer/co-op gameplay — not required for the single-player routing loop
- Server-backed live services (online leaderboard backend, accounts, cloud saves) — deferred until post-V1 validation
- Admin map editor in this codebase — planned as a separate application after core gameplay stabilizes

## Context

The project currently contains full design artifacts:
- Product specification defining mechanics, scoring, progression, UX, and targets
- Technical specification defining PixiJS v8 architecture, systems, schema, and performance constraints
- Implementation plan with phase-by-phase sequencing and dependencies
- Gov Ball 2026 asset list with placements, styles, and packaging guidance

The intended stack is TypeScript + Vite + PixiJS v8 on mobile web, with local-storage persistence in V1 and festival-specific content bundles.

## Constraints

- **Tech Stack**: PixiJS v8 + TypeScript + Vite — required by technical specification and rendering model
- **Platform**: Portrait mobile web only — interaction and layout are touch-first
- **Performance**: 60 FPS target on iPhone SE 2022 / Galaxy A53 class devices — core interaction quality depends on it
- **Interaction**: Single-touch path drawing as the only gameplay verb — preserves design clarity
- **Asset Budget**: Target <5 MB per festival bundle (prefer ~2-3 MB) — supports fast first-play on 4G
- **Data Model**: Normalized map coordinates and config-driven content — enables scaling and future festival reuse

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Mobile web delivery with PixiJS v8 | Fast iteration, shareable URL, strong 2D mobile rendering | — Pending |
| One-verb interaction model (draw paths only) | Keeps controls approachable while allowing high skill ceiling | — Pending |
| Config-driven festival schema with normalized coordinates | Supports responsive layouts and content authoring reuse | — Pending |
| Placeholder-first gameplay implementation before final art pass | Prioritizes mechanics feel and balancing ahead of polish | — Pending |
| Admin editor handled as separate project stream | Avoids blocking core game loop delivery | — Pending |

---
*Last updated: 2026-02-24 after initialization*
