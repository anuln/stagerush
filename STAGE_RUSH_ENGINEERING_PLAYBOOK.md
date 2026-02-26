# STAGE RUSH Engineering Playbook

This document captures how the current game works, why the technical architecture is the way it is, what tradeoffs were made, and how to reuse the stack for future games or additional festivals.

## 1) Game at a glance

**Game:** STAGE RUSH  
**Current live festival:** `govball2026`  
**Core loop:** spawn artists -> draw paths -> route to stages while avoiding collisions/distractions -> complete timed session targets -> progress through day/session structure.

### Current festival structure

- 3 days x 3 sessions/day = 9 sessions total.
- Session cadence: Morning, Afternoon, Evening.
- Difficulty ramps by session through higher artist volume, lower timers, tighter spawn cadence, more active distractions, and higher collision budgets.

### Current content shape

- Stages: 3 (`main-stage`, `side-stage`, `acoustic-stage`)
- Spawn points: 4 (north/east/south/west edges)
- Distractions: 6 (progressively introduced)
- Artist roster: 15 total (5 headliners, 5 midtier, 5 newcomers)
- Artist pose model: pose1, pose2, pose3, distracted, performing (+ optional performance audio clip)

## 2) Gameplay rules and scoring model

## Session success/fail

A session completes when timer reaches zero. Progression behavior is:

- **Success path:** session marked complete only if routed artists meet or exceed `sessionTargetSets`.
- **Fail path:** if target is not met, the session is treated as failed and player is asked to retry.
- **Collision fail guard:** collisions/distractions consume a strike budget (`maxEncounterStrikes`). When it reaches 0 remaining lives, session fails immediately.

## Scoring model

Scoring is additive per delivery, with penalties for misses:

- Base matrix by artist tier x stage size (`src/config/ScoreConfig.ts`)
- Combo multipliers (windowed chain)
- Miss penalties:
  - timeout: `-60`
  - bounds: `-90`
  - manual: `0`

### Wrong stage behavior (intentional design)

Wrong-stage deliveries still score at **70%** of normal (`WRONG_STAGE_DELIVERY_MULTIPLIER = 0.7`).

Reason: this keeps triage gameplay viable (player can choose speed over perfect matching), while still rewarding correct routing.

## Collision/distraction behavior

- Collisions/distractions decrement strike budget.
- Collision chat duration starts short and scales up modestly over repeated encounters.
- Timer continues while artist is in active states (including `ARRIVING`) by design.

## 3) Session progression table (current config)

| Lvl | Day | Session | Target Sets | Total Artists | Max Simultaneous | Timer (s) | Spawn Interval (ms) | Max Collisions | Active Distractions |
|---:|---:|---|---:|---:|---:|---|---|---:|---|
| 1 | 1 | Morning | 7 | 12 | 2 | 18-24 | 1400-2200 | 5 | none |
| 2 | 1 | Afternoon | 8 | 14 | 2 | 17-23 | 1300-2100 | 6 | none |
| 3 | 1 | Evening | 10 | 16 | 3 | 15-21 | 1200-2000 | 7 | none |
| 4 | 2 | Morning | 12 | 18 | 3 | 14-20 | 1100-1900 | 8 | merch1, burger1 |
| 5 | 2 | Afternoon | 14 | 20 | 3 | 13-19 | 1000-1800 | 9 | merch1, burger1 |
| 6 | 2 | Evening | 16 | 22 | 4 | 12-18 | 900-1700 | 11 | merch1, burger1, paparazzi1 |
| 7 | 3 | Morning | 18 | 24 | 4 | 11-17 | 850-1600 | 12 | merch1, burger1, paparazzi1, fans1 |
| 8 | 3 | Afternoon | 20 | 26 | 4 | 10-16 | 800-1500 | 13 | merch1, burger1, paparazzi1, fans1, burger2 |
| 9 | 3 | Evening | 22 | 28 | 5 | 9-14 | 750-1400 | 15 | merch1, burger1, paparazzi1, fans1, burger2, merch2 |

## 4) Runtime architecture (what runs where)

## High-level stack

- **Renderer:** PixiJS (`src/main.ts`, renderers/systems)
- **Game state/control:** pure TypeScript managers and systems
- **Menus/interstitial/final screens:** DOM overlay controller (`ScreenOverlayController`)
- **Admin tooling:** DOM-heavy panel (`AdminPanel`)
- **Persistence:** browser storage (localStorage + sessionStorage)
- **Publishing:** optional GitHub Contents API write from admin

## Why this split

- Pixi is used for high-frequency in-game visuals (artists, paths, FX) where frame performance matters.
- DOM is used for UI-heavy flows (onboarding overlays, interstitial cards, admin forms) where layout ergonomics and iteration speed matter.
- This keeps gameplay render loop lean while preserving rapid product iteration on screens/tooling.

## Runtime flow

1. Load festival registry and selected map.
2. Resolve layout and assets, apply optional admin overrides.
3. Create game runtime + managers + renderers.
4. Tick loop updates systems and draws world each frame.
5. Screen state transitions handled by `GameManager`.
6. Overlay UI rebuilt only when model key changes.

## 5) Core module map

## Entry and orchestration

- `src/main.ts`: app bootstrap, quality scaling, overlay wiring, admin initialization, map switching.
- `src/game/GameManager.ts`: top-level game state machine (`MENU`, `PLAYING`, `LEVEL_FAILED`, `LEVEL_COMPLETE`, `FESTIVAL_COMPLETE`).

## Runtime simulation

- `src/game/GameRuntime.ts`: per-session simulation orchestration.
- `src/systems/SpawnSystem.ts`: spawn cadence, inward-cone direction, artist speed variance.
- `src/systems/PathFollower.ts`: path assignment/following, blocked states, nearest-point entry (no harsh backtracking).
- `src/systems/CollisionSystem.ts`: chat encounters, cooldown/immunity, duration scaling.
- `src/systems/DistractionSystem.ts`: distraction zones and delay logic.
- `src/systems/StageSystem.ts`: queueing/performing/completion.
- `src/systems/TimerSystem.ts`: timer depletion and timeout events.

## Scoring/progression

- `src/game/ScoreManager.ts`: delivery registration + penalties.
- `src/config/ScoreConfig.ts`: score matrix, combo windows, wrong-stage multiplier.
- `src/config/LevelConfig.ts`: map-level config -> runtime config.
- `src/game/LevelProgression.ts`: deterministic tuning/jitter per level (seeded by map+level).

## UI layers

- `src/rendering/*`: Pixi renderers for artists, HUD, effects, path, feedback.
- `src/ui/ScreenViewModels.ts`: transforms runtime snapshot into menu/interstitial/final card model.
- `src/ui/ScreenOverlayController.ts`: DOM rendering of overlay screens and actions.

## 6) Admin architecture and asset pipeline

## What admin controls today

- Asset replacement and preview for background, intro screen/video, stages, distractions, artists, audio cues.
- Map marker placement for stages and distractions.
- Artist generation flows (pose-level control + batch generation).
- Prompt review.
- Session FX tuning inputs.
- Git commit flow for resolved map and materialized inline assets.

## Storage model

- Draft overrides: `localStorage` keyed by festival (`stagecall:admin-asset-overrides:v1` store v2 schema).
- Session secrets (Gemini/Eleven/GitHub token): `sessionStorage`, festival-scoped.
- GitHub publish settings: `localStorage`, festival-scoped v2 schema.

## Important sync behavior

- Admin preview now auto-persists draft overrides continuously (not only on a special apply button).
- Library tab now reflects **actual in-play slots**, including overrides, not only static catalog rows.
- Generate tab explicitly shows the **current active in-game asset** before generation.

## Publishing behavior

- Admin can commit through GitHub Contents API (`src/admin/GitHubPublisher.ts`).
- Inline `data:` assets are materialized to files under festival committed assets paths before map commit.
- After successful publish, admin syncs map + prunes applied overrides to avoid repeated full re-commits.

## 7) Audio system decisions

## Runtime behavior

- Music cues loop by player design (`AudioManager.playMusic` uses loop=true).
- App visibility lifecycle is respected: audio pauses when tab/app loses focus and resumes on return.
- Mix profiles and cue-category gains support better SFX clarity at high intensity.

## Asset-generation behavior

- ElevenLabs generation is integrated in admin for cue/artist audio clips.
- Short clip strategy is used intentionally and looped for BGM usage.

## 8) FX and atmosphere strategy

## Session atmosphere

- Atmosphere is data-driven by session period and level (`FxLedger` + `SessionFx`).
- Morning/afternoon/evening tone shifts are defined as overlays + particles + glow.

## Fireworks strategy

- Evening sessions receive fireworks progression.
- Final evening climax starts pre-end and continues into completion moments.
- Separate control exists between gameplay timing and post-session celebration timing.

## 9) Performance strategy (mobile-first)

## What is implemented

- Dynamic quality scaling by sustained FPS windows.
- Resolution scaling and effects-density scaling.
- Density-aware rendering reductions for feedback/hazard overlays in heavy scenes.
- Bundle loading/unloading to reduce active memory and startup cost.

## Why it matters

Late sessions are entity-dense; these controls are required for stable play on mobile where thermals and battery constraints are real.

## 10) FTUX/onboarding strategy

FTUX is embedded into gameplay (not a detached tutorial):

- First artist route hint.
- First collision hint.
- First distraction context hint.
- First successful arrival reinforcement.
- First timeout miss feedback.

These are tracked map-wide so they do not repeat every session.

## 11) Key technical decisions and compromises

## Decisions

- **Pixi for simulation visuals, DOM for meta UI:** faster iteration + better runtime performance separation.
- **Data-first festival configs:** maps/schedules/assets fully config-driven for scaling to more festivals.
- **No backend dependency:** local-first overrides + direct GitHub publish keeps tooling fast and portable.
- **Deterministic level jitter by map+level seed:** keeps each level stable across retries while avoiding static feel.
- **Wrong-stage still scores (70%):** supports tactical routing rather than binary “right/wrong” collapse.

## Compromises

- **Admin panel remains monolithic (`AdminPanel.ts`)** for velocity; maintainability debt is acknowledged.
- **Client-side secrets in browser session storage:** practical for rapid iteration, not enterprise-grade secret handling.
- **ARRIVING still timer-active:** intentionally increases pressure/fairness tension in queue-heavy moments.
- **Single-festival production content currently active:** architecture supports multiple, but content ops still mostly one-festival.

## 12) Known operational guardrails

- Use committed file paths rather than persistent inline data for durable production sync.
- Keep global fallback assets intact so missing/generated assets do not break runtime.
- Validate map JSON and asset existence before publishing.
- Use tests and build checks before shipping.

## 13) How to extend this game safely

## Add a new festival (same game mechanics)

1. Add entry to `public/assets/maps/index.json`.
2. Create new map config JSON matching `FestivalMap` schema.
3. Provide stage/distraction/artist/audio assets (or rely on fallback first).
4. Verify in admin with per-slot preview and map marker placement.
5. Run tests/build; publish.

## Expand mechanics in current game

Priority order:

1. Add new distractions and tune strike budgets.
2. Add artist archetype behaviors (speed/patience/personality). 
3. Add richer stage queue mechanics and audience reactions.
4. Add deeper score model (streak bonuses, recovery bonuses, clean routing bonus).

## Reuse stack for a new game genre

Reusable layers:

- Keep: app bootstrap, bundle manager, screen overlay system, persistence, admin publishing pipeline.
- Replace: runtime systems (`SpawnSystem`, `PathFollower`, `StageSystem`, etc.) and view models.
- Keep config-led content approach and festival-like progression abstraction.

## 14) Suggested next engineering investments

1. Split `AdminPanel.ts` into modules (state, generation, publish, map tools, UI components).
2. Add authoritative "dirty state" tracking and conflict-aware publish UX.
3. Add CI checks for map schema + asset path validity + transparency requirements.
4. Add lightweight telemetry hooks for session completion funnels and performance KPIs.
5. Add small server option for shared multi-user admin collaboration (optional future).

## 15) Verification commands used in this project

Typical validation loop:

- `npm test`
- `npm run build`
- targeted e2e/storyboard scripts under `scripts/playwright/`

These should remain mandatory before production publish.

---

If you are using this as a template for a new game, preserve the **separation of concerns** that worked well here:

- simulation systems independent of rendering,
- map/content data externalized,
- UI overlays independent of game world renderer,
- and admin tooling as a first-class product, not an afterthought.
