# Requirements: Stage Call

**Defined:** 2026-02-24
**Core Value:** Path drawing must feel immediate and readable on mobile while creating meaningful routing decisions under pressure.

## v1 Requirements

### Core Gameplay

- [ ] **CORE-01**: Artist entities spawn from configured map spawn points and drift automatically using configured drift angles
- [ ] **CORE-02**: Player can start path drawing by touching near an eligible artist and draw a freeform route with continuous visual feedback
- [ ] **CORE-03**: Finalized paths are smoothed and can snap to stage entrances using configurable snap radius
- [ ] **CORE-04**: Artist follows the most recent valid assigned path; invalid unsnapped paths fade without changing the artist trajectory
- [ ] **CORE-05**: Each active artist displays a visible countdown timer ring that transitions from safe to warning to critical colors
- [ ] **CORE-06**: Artist is marked as missed when timer reaches zero or artist exits map bounds
- [ ] **CORE-07**: Level fails after 3 misses and provides replay-or-quit flow
- [ ] **CORE-08**: Artist arriving at a stage enters performance occupancy, then resolves and leaves active play

### Scoring and Combo

- [ ] **SCORE-01**: Delivery scoring applies artist-tier and stage-size matrix multipliers exactly as defined in product spec
- [ ] **SCORE-02**: If target stage is occupied, arriving artist queues and performs when stage becomes available
- [ ] **SCORE-03**: Consecutive deliveries to same stage inside combo window increment per-stage chain and multiplier
- [ ] **SCORE-04**: Combo multiplier stacks on top of tier-stage scoring and is reflected in HUD and score popups

### Obstacles and Routing Pressure

- [ ] **OBST-01**: Nearby active artists trigger chat-collision delay that pauses both artists for configured duration
- [ ] **OBST-02**: Artist timers continue ticking during collision, distraction, and queue delays
- [ ] **OBST-03**: Active map distractions pull artists into delay behavior based on configured radius and level activation
- [ ] **OBST-04**: Player can re-route artists by replacing prior paths, including during temporary blocked states where queued updates apply on resume

### Progression and Session Flow

- [ ] **PROG-01**: Festival contains sequential levels with escalating difficulty parameters (timers, spawn pressure, active hazards)
- [ ] **PROG-02**: Level attempts include controlled randomization of spawn usage, drift variance, tier mix, and distraction subsets
- [ ] **PROG-03**: Festival run tracks cumulative score across all completed levels in the run
- [ ] **PROG-04**: Game provides complete flow across menu, festival select/detail, playing, level complete/fail, and festival complete states
- [ ] **PROG-05**: Progress, best scores, and player settings persist locally between browser sessions

### UI and UX

- [ ] **UI-01**: Portrait HUD shows score, lives, and level status without obstructing gameplay readability
- [ ] **UI-02**: ETA preview appears while drawing and warns when projected arrival exceeds remaining artist timer
- [ ] **UI-03**: Visual states for stage occupancy, combo intensity, timer urgency, and hazard zones are legible at gameplay speed
- [ ] **UI-04**: Non-gameplay screens include leaderboard, settings, and run result summaries with clear next actions

### Data, Content, and Asset Pipeline

- [ ] **DATA-01**: FestivalMap schema supports normalized positions for stages, spawn points, distractions, level configs, and asset references
- [ ] **DATA-02**: Gov Ball 2026 content pack is playable end-to-end with specified stage topology, spawn design, and distraction cadence
- [ ] **DATA-03**: Asset bundle lifecycle supports per-festival loading/unloading with boot bundle retained

### Performance and Verification

- [ ] **PERF-01**: Game sustains 60 FPS on target mid-range mobile devices under typical load and degrades gracefully when needed
- [ ] **PERF-02**: Path drawing interaction remains responsive with no noticeable stutter during peak board complexity
- [ ] **PERF-03**: First interactive load time is under 3 seconds on throttled 4G for V1 festival experience
- [ ] **PERF-04**: Festival asset payload remains under 5 MB target budget
- [ ] **TEST-01**: Unit tests validate path smoothing, collision detection, scoring matrix, spawn rules, and legal state transitions
- [ ] **TEST-02**: Integration, edge-case, and performance tests cover full session reliability on supported mobile profiles

## v2 Requirements

### Online and Scale

- **NET-01**: Server-backed leaderboard replaces local-only ranking for global score competition
- **NET-02**: Cloud sync supports restoring festival progress across devices

### Content Tooling

- **ADMIN-01**: Standalone admin map editor enables non-technical creation, validation, preview, and export of festival configs
- **ADMIN-02**: Asset packaging toolchain auto-generates manifests and optimization outputs for new festivals

### Product Expansion

- **FEST-01**: Additional festivals ship with distinct maps, assets, and tuned difficulty curves

## Out of Scope

| Feature | Reason |
|---------|--------|
| Native app-store app (iOS/Android binaries) | Web-first launch is faster and aligns with current deployment strategy |
| Multiplayer/co-op routing | Not required to validate single-player core loop |
| Account system and authentication | Local persistence is sufficient for V1 |
| Real-money monetization systems | Not part of current gameplay validation scope |
| In-game social/chat systems | Adds complexity unrelated to core routing loop |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Complete |
| CORE-01 | Phase 2 | Complete |
| CORE-05 | Phase 2 | Complete |
| CORE-06 | Phase 2 | Complete |
| CORE-02 | Phase 3 | Complete |
| CORE-03 | Phase 3 | Complete |
| CORE-04 | Phase 3 | Complete |
| UI-02 | Phase 3 | Complete |
| CORE-08 | Phase 4 | Complete |
| SCORE-01 | Phase 4 | Complete |
| SCORE-02 | Phase 4 | Complete |
| UI-01 | Phase 4 | Complete |
| OBST-01 | Phase 5 | Complete |
| OBST-02 | Phase 5 | Complete |
| OBST-03 | Phase 5 | Complete |
| OBST-04 | Phase 5 | Complete |
| UI-03 | Phase 5 | Complete |
| SCORE-03 | Phase 6 | Complete |
| SCORE-04 | Phase 6 | Complete |
| PROG-01 | Phase 7 | Pending |
| PROG-02 | Phase 7 | Pending |
| PROG-03 | Phase 7 | Pending |
| PROG-04 | Phase 7 | Pending |
| PROG-05 | Phase 7 | Pending |
| CORE-07 | Phase 7 | Pending |
| UI-04 | Phase 7 | Pending |
| DATA-02 | Phase 8 | Pending |
| DATA-03 | Phase 8 | Pending |
| PERF-01 | Phase 9 | Pending |
| PERF-02 | Phase 9 | Pending |
| PERF-03 | Phase 9 | Pending |
| PERF-04 | Phase 9 | Pending |
| TEST-01 | Phase 9 | Pending |
| TEST-02 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0

---
*Requirements defined: 2026-02-24*
*Last updated: 2026-02-24 after Phase 6 completion*
