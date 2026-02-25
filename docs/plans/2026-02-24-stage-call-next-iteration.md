# Stage Call Next Iteration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement gameplay items #1/#2/#3/#5 from the design audit, then ship a polished UI pass and upgraded visual/audio assets generated with Nano Banana (Gemini image) and ElevenLabs.

**Architecture:** Keep core game logic changes isolated to runtime + hazard systems, with new feedback events flowing into renderers and end-of-round screen models. Treat visual/audio generation as a separate asset pipeline phase (scripted, reproducible, env-key gated) so gameplay iteration stays fast and deterministic. Merge generated assets via map config references only after smoke checks pass.

**Tech Stack:** TypeScript, PixiJS, Vite, Vitest, Playwright smoke scripts, Gemini image API (Nano Banana model family), ElevenLabs API.

---

### Task 1: Round Performance Tiers (Design Item #1)

**Files:**
- Modify: `src/game/GameRuntime.ts`
- Modify: `src/game/GameManager.ts`
- Modify: `src/ui/ScreenViewModels.ts`
- Modify: `src/ui/ScreenViewModels.test.ts`
- Test: `src/game/GameRuntime.test.ts`

**Step 1: Write failing tests for tier calculation and level-complete messaging**
- Add tests asserting `LEVEL_COMPLETE` view model includes a tier label (example: `Bronze/Silver/Gold`) derived from runtime output.
- Add runtime tests asserting round completion returns a deterministic tier for score/delivery thresholds.

**Step 2: Run tests to verify failure**
- Run: `npm test -- src/game/GameRuntime.test.ts src/ui/ScreenViewModels.test.ts`
- Expected: FAIL for missing tier fields and/or missing tier text.

**Step 3: Implement minimal tier model**
- In runtime status, expose: `performanceTier`, `deliveredArtists`, `missedArtists`.
- Add thresholds in config (score + delivery count) and compute tier at round end.
- Thread tier through `GameManager` into screen model.

**Step 4: Re-run focused tests**
- Run: `npm test -- src/game/GameRuntime.test.ts src/ui/ScreenViewModels.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add src/game/GameRuntime.ts src/game/GameManager.ts src/ui/ScreenViewModels.ts src/ui/ScreenViewModels.test.ts src/game/GameRuntime.test.ts
git commit -m "feat(gameplay): add round performance tiers and completion messaging"
```

---

### Task 2: Soft Miss Penalty + Combo Break (Design Item #2)

**Files:**
- Modify: `src/game/ComboTracker.ts`
- Modify: `src/game/ScoreManager.ts`
- Modify: `src/game/GameRuntime.ts`
- Modify: `src/game/ComboTracker.test.ts`
- Modify: `src/game/ScoreManager.test.ts`
- Modify: `src/game/GameRuntime.test.ts`

**Step 1: Write failing tests for miss penalties**
- Add tests to assert:
- Timeout/out-of-bounds miss applies score penalty (clamped at `>= 0`).
- Miss clears active combo chain pressure for impacted stage/global policy.

**Step 2: Run tests to verify failure**
- Run: `npm test -- src/game/ComboTracker.test.ts src/game/ScoreManager.test.ts src/game/GameRuntime.test.ts`
- Expected: FAIL due to missing APIs (`break...`, `applyPenalty...`).

**Step 3: Implement minimal penalty APIs**
- Add combo-break API(s) in `ComboTracker` (`breakStageChain`, optional `breakAllChains`).
- Add score penalty API in `ScoreManager` (`applyMissPenalty` with reason mapping).
- Call these from runtime miss handling and emit renderer events for `-score`.

**Step 4: Re-run focused tests**
- Run: `npm test -- src/game/ComboTracker.test.ts src/game/ScoreManager.test.ts src/game/GameRuntime.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add src/game/ComboTracker.ts src/game/ScoreManager.ts src/game/GameRuntime.ts src/game/ComboTracker.test.ts src/game/ScoreManager.test.ts src/game/GameRuntime.test.ts
git commit -m "feat(gameplay): add soft miss penalties and combo breaks"
```

---

### Task 3: Hazard Re-trigger Immunity Cooldown (Design Item #3)

**Files:**
- Modify: `src/config/GameConfig.ts`
- Modify: `src/systems/CollisionSystem.ts`
- Modify: `src/systems/DistractionSystem.ts`
- Modify: `src/systems/CollisionSystem.test.ts`
- Modify: `src/systems/DistractionSystem.test.ts`

**Step 1: Write failing cooldown tests**
- Add tests ensuring artist cannot re-enter collision/distraction strike for N ms after resolve.
- Add same-artist cooldown edge test while another artist remains eligible.

**Step 2: Run tests to verify failure**
- Run: `npm test -- src/systems/CollisionSystem.test.ts src/systems/DistractionSystem.test.ts`
- Expected: FAIL for missing cooldown tracking.

**Step 3: Implement cooldown maps**
- Add `immunityCooldownMs` config.
- Track per-artist cooldown-until timestamps in both systems.
- Suppress `started` events while cooldown active.

**Step 4: Re-run focused tests**
- Run: `npm test -- src/systems/CollisionSystem.test.ts src/systems/DistractionSystem.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add src/config/GameConfig.ts src/systems/CollisionSystem.ts src/systems/DistractionSystem.ts src/systems/CollisionSystem.test.ts src/systems/DistractionSystem.test.ts
git commit -m "fix(gameplay): add hazard immunity cooldown after encounter resolution"
```

---

### Task 4: Fun Thought-Bubble Hazard Feedback (Design Item #5)

**Files:**
- Modify: `src/game/GameRuntime.ts`
- Modify: `src/rendering/DeliveryFeedbackRenderer.ts`
- Modify: `src/rendering/DeliveryFeedbackRenderer.test.ts`
- Modify: `src/audio/AudioManager.ts`
- Modify: `src/audio/AudioManager.test.ts`

**Step 1: Write failing feedback tests**
- Add tests for new hazard feedback event payload and renderer lifecycle.
- Add test ensuring “collision/distraction thought bubbles” render and expire.

**Step 2: Run tests to verify failure**
- Run: `npm test -- src/rendering/DeliveryFeedbackRenderer.test.ts src/audio/AudioManager.test.ts src/game/GameRuntime.test.ts`
- Expected: FAIL due to missing hazard-bubble frame data.

**Step 3: Implement thought-bubble event flow**
- Emit hazard event records from runtime when collisions/distractions start.
- Extend feedback renderer frame with `hazardEvents`.
- Render speech/thought bubbles (not flat floating text), with short easing and fun timing.
- Wire distinct SFX cues per hazard type.

**Step 4: Re-run focused tests**
- Run: `npm test -- src/rendering/DeliveryFeedbackRenderer.test.ts src/audio/AudioManager.test.ts src/game/GameRuntime.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add src/game/GameRuntime.ts src/rendering/DeliveryFeedbackRenderer.ts src/rendering/DeliveryFeedbackRenderer.test.ts src/audio/AudioManager.ts src/audio/AudioManager.test.ts
git commit -m "feat(feedback): add thought-bubble hazard feedback and audio cues"
```

---

### Task 5: UI Polish Pass (Frontend-Design Skill)

**Files:**
- Modify: `src/styles.css`
- Modify: `src/ui/ScreenOverlayController.ts`
- Modify: `src/ui/ScreenViewModels.ts`
- Optional Modify: `src/rendering/HudRenderer.ts`
- Test: `src/ui/ScreenViewModels.test.ts`, visual smoke via Playwright

**Step 1: Define aesthetic direction in-code comments/tokens**
- Commit to one visual direction (festival-poster editorial with high-contrast accents).
- Add CSS variables for typography, color, spacing, glow/shadow system.

**Step 2: Implement overlay + interaction polish**
- Improve typography hierarchy, button affordance, spacing rhythm, and responsive behavior.
- Add intentional animation choreography (panel reveal, CTA pulse, summary stagger).

**Step 3: Update HUD readability for mobile**
- Improve in-canvas text sizing, contrast, and placement for right-thumb visibility.

**Step 4: Verify**
- Run: `npm run qa:pw:start`
- Run: `npm run build && npm test -- src/ui/ScreenViewModels.test.ts`
- Expected: PASS + no start-screen interaction regressions.

**Step 5: Commit**
```bash
git add src/styles.css src/ui/ScreenOverlayController.ts src/ui/ScreenViewModels.ts src/rendering/HudRenderer.ts src/ui/ScreenViewModels.test.ts
git commit -m "feat(ui): apply frontend polish pass for overlay and hud readability"
```

---

### Task 6: Sprite Generation Pipeline (Nano Banana / Gemini)

**Files:**
- Create: `scripts/assets/generate-gemini-sprites.mjs`
- Create: `assets/sprites/generated/prompts/*.txt`
- Create: `assets/sprites/generated/manifest.json`
- Modify: `public/assets/maps/govball/config.json` (only after generated assets validated)
- Optional: `package.json` scripts for generation commands

**Step 1: Build prompt pack + manifest**
- Create prompts for: map bg, 3 stages, 4 distraction types, artist tiers (walk/idle/perform).
- Keep style constraints aligned with `stage-call-govball-assets.md`.

**Step 2: Implement generation script**
- Env input: `GEMINI_API_KEY` (user-provided Nano Banana key).
- Script flow:
- Check model availability.
- Generate assets by prompt.
- Save to deterministic output paths.
- Emit JSON report with status/errors.

**Step 3: Dry-run test**
- Run with `--dry-run` to verify prompt parsing and output path integrity.

**Step 4: Live generation + validation**
- Generate limited batch first (one stage, one distraction, one artist set).
- Visual inspect generated PNGs; only then generate full set.
- Update map config paths to generated assets.

**Step 5: Commit**
```bash
git add scripts/assets/generate-gemini-sprites.mjs assets/sprites/generated/prompts assets/sprites/generated/manifest.json public/assets/maps/govball/config.json package.json
git commit -m "feat(assets): add gemini nanobanana sprite generation pipeline and first pass assets"
```

---

### Task 7: Sound Design + ElevenLabs Asset Pipeline

**Files:**
- Create: `scripts/audio/generate-eleven-assets.mjs`
- Create: `assets/audio/generated/prompts/*.md`
- Create: `assets/audio/generated/manifest.json`
- Modify: `public/assets/maps/govball/config.json` (audio cue paths)
- Modify: `src/audio/AudioManager.ts` (mix polish: cue volume groups/fades)
- Modify: `src/audio/AudioManager.test.ts`

**Step 1: Define audio direction and cue sheet**
- Music: chill/energy/peak loops.
- SFX: collision-thought, distraction-thought, miss-soft, tier-up, timer-pressure.

**Step 2: Implement generation script**
- Env input: `ELEVENLABS_API_KEY`.
- Generate cues/loops into deterministic folders.
- Emit per-file metadata (duration, format, loudness target if available).

**Step 3: Integrate runtime mix polish**
- Add category volume controls and small fade behavior for BGM switching.
- Ensure no clipping with layered SFX (cap concurrent voices as needed).

**Step 4: Verify**
- Run focused audio tests.
- Manual runtime check for cue playback and missing-file resilience.

**Step 5: Commit**
```bash
git add scripts/audio/generate-eleven-assets.mjs assets/audio/generated/prompts assets/audio/generated/manifest.json public/assets/maps/govball/config.json src/audio/AudioManager.ts src/audio/AudioManager.test.ts
git commit -m "feat(audio): add elevenlabs pipeline and runtime mix polish"
```

---

### Task 8: End-to-End Validation and Mobile Acceptance

**Files:**
- Modify: `progress.md`
- Optional create: `.planning/reports/iteration-ux-audio-assets-YYYYMMDD.json`

**Step 1: Automated verification**
- Run:
- `npm test`
- `npm run build`
- `npm run qa:pw:start`

**Step 2: Mobile UAT pass**
- Launch LAN server.
- Validate: start flow, round timer clarity, encounter thought bubbles, penalty fairness.

**Step 3: Asset/audio sanity**
- Confirm all generated file paths in map config exist.
- Confirm no console errors for asset decode/load.

**Step 4: Document outcomes**
- Update `progress.md` with what changed, what still needs tuning (#4 from audit).

**Step 5: Commit**
```bash
git add progress.md
git commit -m "chore: finalize gameplay polish and asset/audio validation notes"
```

---

## Required Inputs Before Execution

1. `GEMINI_API_KEY` (Nano Banana image generation)
2. `ELEVENLABS_API_KEY` (audio generation)

## Guardrails

- Keep all gameplay behavior deterministic under tests.
- Keep generated assets in dedicated folders; do not overwrite manually curated files without explicit flag.
- Do not block gameplay if generated assets are missing; fallback rendering/audio behavior must remain intact.
- Preserve mobile-first ergonomics for overlays and touch-driven interactions.

## Definition of Done

- Items #1/#2/#3/#5 implemented and verified.
- UI polish visibly upgraded on desktop and mobile.
- First full generated sprite/audio packs integrated with successful runtime loading.
- Tests/build/playwright checks pass without new critical errors.
