# Roadmap: Stage Call

## Overview

This roadmap takes Stage Call from an empty codebase to a production-ready mobile web festival-routing game by building core interaction feel first, then layering scoring depth, progression systems, content integration, and final performance hardening. Phase order follows dependency risk: path drawing quality and movement orchestration come before polish and content scaling.

## Phases

- [ ] **Phase 1: Foundation and Map Schema** - Establish PixiJS app shell, responsive rendering, and normalized festival data model
- [ ] **Phase 2: Artist Lifecycle and Spawn Pressure** - Implement artist entities, drift movement, timer pressure, and miss accounting
- [ ] **Phase 3: Touch Path Drawing and Following** - Deliver touch input, smoothing, snapping, and artist path-following behavior
- [ ] **Phase 4: Stage Delivery, HUD, and Base Scoring** - Add stage occupancy, delivery resolution, HUD, and tier-stage score matrix
- [ ] **Phase 5: Collisions and Distractions** - Add chat collisions, distraction hazards, and delay interactions that maintain timer pressure
- [ ] **Phase 6: Combo Layer and High-Score Feedback** - Introduce stage combo chains and multiplier-driven score expression
- [ ] **Phase 7: Level Flow and Persistence** - Build full run loop, level progression, fail/complete states, menu flows, and local persistence
- [ ] **Phase 8: Gov Ball Content and Production Assets** - Replace placeholders with festival assets, audio, animation, and bundle lifecycle
- [ ] **Phase 9: Performance, QA, and Release Hardening** - Validate 60 FPS targets, edge-case stability, and readiness for public release

## Phase Details

### Phase 1: Foundation and Map Schema
**Goal**: Ship a running mobile-first PixiJS application with normalized map schema and rendered stage/spawn layout scaffolding.
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01
**Success Criteria** (what must be TRUE):
1. App boots in portrait mobile web with correct viewport and input-safe CSS defaults.
2. FestivalMap schema loads and normalized coordinates correctly map to current viewport space.
3. Stages and spawn points render from config and remain correctly positioned across resize/orientation changes.
**Plans**: 3 plans

Plans:
- [ ] 01-01: Initialize Vite + TypeScript + PixiJS app shell and base render loop
- [ ] 01-02: Implement FestivalMap types, loader, and normalization utilities
- [ ] 01-03: Render map/stage/spawn debug layers with resize-safe layout

### Phase 2: Artist Lifecycle and Spawn Pressure
**Goal**: Introduce active artists with drift behavior, timers, misses, and spawn-system pacing.
**Depends on**: Phase 1
**Requirements**: CORE-01, CORE-05, CORE-06
**Success Criteria** (what must be TRUE):
1. Artists spawn from configured points with tier assignment and deterministic drift vectors.
2. Artist timer ring updates visually and transitions urgency colors over time.
3. Miss conditions trigger reliably on timeout and bounds exit, with life tracking in game state.
**Plans**: 3 plans

Plans:
- [ ] 02-01: Implement Artist entity/state model and delta-time updates
- [ ] 02-02: Build SpawnSystem and TimerSystem with level-config inputs
- [ ] 02-03: Add placeholder artist visuals and miss event plumbing

### Phase 3: Touch Path Drawing and Following
**Goal**: Deliver the core touch interaction: draw, smooth, snap, and follow.
**Depends on**: Phase 2
**Requirements**: CORE-02, CORE-03, CORE-04, UI-02
**Success Criteria** (what must be TRUE):
1. Player can reliably grab artists with touch and draw responsive in-progress routes.
2. Finalized routes smooth correctly, snap to stages when eligible, and reject invalid endpoints safely.
3. Artists follow the latest valid path with seamless re-route replacement behavior.
4. ETA preview appears during drawing and warns when estimated arrival exceeds remaining timer.
**Plans**: 4 plans

Plans:
- [ ] 03-01: Implement touch gesture capture and artist grab targeting
- [ ] 03-02: Implement spline smoothing, resampling, and stage snapping
- [ ] 03-03: Implement path rendering, lifecycle, and invalid-path fade logic
- [ ] 03-04: Implement PathFollower movement and ETA warning display

### Phase 4: Stage Delivery, HUD, and Base Scoring
**Goal**: Turn arrivals into stage performances with visible scoring and run-state feedback.
**Depends on**: Phase 3
**Requirements**: CORE-08, SCORE-01, SCORE-02, UI-01
**Success Criteria** (what must be TRUE):
1. Stage occupancy locks and releases as artists perform, including queue behavior when occupied.
2. Score calculations match the tier-to-stage matrix and update total score correctly.
3. HUD clearly communicates score, lives, and level status without hiding gameplay.
**Plans**: 3 plans

Plans:
- [ ] 04-01: Implement Stage entity occupancy/queue flow and arrival transitions
- [ ] 04-02: Implement ScoreManager with matrix-based scoring and score events
- [ ] 04-03: Implement HUD and delivery/miss feedback hooks

### Phase 5: Collisions and Distractions
**Goal**: Add emergent and static hazards that consume time and force better routing choices.
**Depends on**: Phase 4
**Requirements**: OBST-01, OBST-02, OBST-03, OBST-04, UI-03
**Success Criteria** (what must be TRUE):
1. Artist-artist collisions reliably trigger chat delay and resume prior trajectories after timeout.
2. Distraction zones trigger delay behavior based on active level configuration.
3. Timers continue through all delay states, preserving intended pressure model.
4. Hazard and urgency visuals are readable enough to support quick tactical re-routing.
**Plans**: 3 plans

Plans:
- [ ] 05-01: Implement CollisionSystem for artist proximity and chat state transitions
- [ ] 05-02: Implement Distraction entities, activation rules, and delay behaviors
- [ ] 05-03: Implement hazard readability pass and reroute/resume edge handling

### Phase 6: Combo Layer and High-Score Feedback
**Goal**: Add combo chaining that rewards intentional sequencing and raises score ceiling.
**Depends on**: Phase 5
**Requirements**: SCORE-03, SCORE-04
**Success Criteria** (what must be TRUE):
1. Per-stage combo chain increments, resets, and caps exactly to design rules.
2. Combo multiplier applies correctly on top of base delivery score.
3. Combo state is visually and audibly legible enough to influence player decisions.
**Plans**: 2 plans

Plans:
- [ ] 06-01: Implement ComboTracker and score integration
- [ ] 06-02: Implement combo UI and VFX/SFX feedback loop

### Phase 7: Level Flow and Persistence
**Goal**: Complete playable session loop from menu through festival completion with saved progression.
**Depends on**: Phase 6
**Requirements**: PROG-01, PROG-02, PROG-03, PROG-04, PROG-05, CORE-07, UI-04
**Success Criteria** (what must be TRUE):
1. Player can progress through levels with escalating parameters and replay failed levels.
2. Level/festival complete and fail screens present clear outcomes and next actions.
3. Cumulative scoring and local leaderboard flow work for full-run attempts.
4. Progress and settings persist correctly across app reloads.
**Plans**: 4 plans

Plans:
- [ ] 07-01: Implement GameManager and LevelManager state flow
- [ ] 07-02: Implement level randomization and progression parameter wiring
- [ ] 07-03: Build non-gameplay screens and result summaries
- [ ] 07-04: Implement local persistence and leaderboard storage model

### Phase 8: Gov Ball Content and Production Assets
**Goal**: Integrate the full Gov Ball content pack with final visual/audio presentation and bundle controls.
**Depends on**: Phase 7
**Requirements**: DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
1. Gov Ball 2026 festival is fully playable with authored map assets and configured entities.
2. Festival-specific sprites, animations, and audio replace placeholder content cleanly.
3. Asset bundle loading/unloading works without stale resource leaks between sessions.
**Plans**: 3 plans

Plans:
- [ ] 08-01: Integrate Gov Ball map/stage/artist/distraction assets
- [ ] 08-02: Integrate animation states, particles, and audio event wiring
- [ ] 08-03: Implement and verify bundle load/unload lifecycle behavior

### Phase 9: Performance, QA, and Release Hardening
**Goal**: Prove target performance and robustness through profiling, stress checks, and regression coverage.
**Depends on**: Phase 8
**Requirements**: PERF-01, PERF-02, PERF-03, PERF-04, TEST-01, TEST-02
**Success Criteria** (what must be TRUE):
1. Performance profile meets FPS and input-latency targets on representative target devices.
2. Festival bundle size and load-time targets are met with measured evidence.
3. Unit, integration, edge-case, and soak tests pass with no release-blocking defects.
**Plans**: 3 plans

Plans:
- [ ] 09-01: Run mobile profiling and quality-scaler tuning pass
- [ ] 09-02: Add/complete automated tests for critical systems and edge cases
- [ ] 09-03: Execute release checklist, defect triage, and stability sign-off

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation and Map Schema | 0/3 | Not started | - |
| 2. Artist Lifecycle and Spawn Pressure | 0/3 | Not started | - |
| 3. Touch Path Drawing and Following | 0/4 | Not started | - |
| 4. Stage Delivery, HUD, and Base Scoring | 0/3 | Not started | - |
| 5. Collisions and Distractions | 0/3 | Not started | - |
| 6. Combo Layer and High-Score Feedback | 0/2 | Not started | - |
| 7. Level Flow and Persistence | 0/4 | Not started | - |
| 8. Gov Ball Content and Production Assets | 0/3 | Not started | - |
| 9. Performance, QA, and Release Hardening | 0/3 | Not started | - |
