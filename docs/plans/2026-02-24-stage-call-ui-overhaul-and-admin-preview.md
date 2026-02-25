# Stage Call UI Overhaul + Admin Asset Preview Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the thematic UI overhaul defined in the storyboard/blueprint docs and add rich asset preview capabilities in the hidden admin panel for faster art/audio review.

**Architecture:** Keep gameplay rules and runtime logic stable while layering a new presentation system: theme tokens, storyboard-driven UI states, and controlled motion/audio cue hierarchy. For admin tooling, extend the existing catalog-driven panel with non-destructive preview surfaces (image + audio) and override-inspection utilities so content iteration stays fast and safe.

**Tech Stack:** TypeScript, PixiJS v8, Vite, Vitest, Playwright (`develop-web-game` script client), existing local JSON asset catalogs.

---

### Task 1: Theme Foundation and Festival Variant Infrastructure

**Files:**
- Create: `src/theme/ThemePreset.ts`
- Create: `src/theme/ThemeResolver.ts`
- Create: `src/theme/ThemeResolver.test.ts`
- Create: `public/assets/themes/festival-presets.json`
- Modify: `src/config/FestivalConfig.ts`
- Modify: `src/maps/MapLoader.ts`
- Modify: `public/assets/maps/govball/config.json`

**Step 1: Write the failing tests**
- Add tests in `src/theme/ThemeResolver.test.ts` for:
  - resolving a known festival theme by `map.id`/`themeId`
  - fallback to default theme when missing
  - semantic token invariants (`success|warning|danger` always present)

**Step 2: Run test to verify failure**
- Run: `npm test -- src/theme/ThemeResolver.test.ts`
- Expected: FAIL because theme resolver/types do not exist.

**Step 3: Write minimal implementation**
- Add `ThemePreset` shape with:
  - semantic colors
  - typography family refs
  - motion timing band presets
  - audio mix profile id
- Add resolver that reads `festival-presets.json` and returns default-safe tokens.
- Extend map schema with optional `themeId`.

**Step 4: Run tests to verify pass**
- Run: `npm test -- src/theme/ThemeResolver.test.ts src/maps/MapLoader.test.ts`
- Expected: PASS with existing maps still loading.

**Step 5: Commit**
```bash
git add src/theme/ThemePreset.ts src/theme/ThemeResolver.ts src/theme/ThemeResolver.test.ts public/assets/themes/festival-presets.json src/config/FestivalConfig.ts src/maps/MapLoader.ts public/assets/maps/govball/config.json
git commit -m "feat(theme): add festival theme preset foundation with safe resolver"
```

---

### Task 2: Storyboard-Driven Overlay Shell (Menu/End Screens)

**Files:**
- Modify: `src/ui/ScreenViewModels.ts`
- Modify: `src/ui/ScreenViewModels.test.ts`
- Modify: `src/ui/ScreenOverlayController.ts`
- Modify: `src/styles.css`

**Step 1: Write failing tests for new UI language and model**
- Add assertions for updated labels/rows aligned with storyboard:
  - `Set Score`, `Crowd Pressure`, `Time to Slot` language in relevant views
  - CTA labels in menu/failure/complete states

**Step 2: Run tests to verify failure**
- Run: `npm test -- src/ui/ScreenViewModels.test.ts`
- Expected: FAIL on old copy/model fields.

**Step 3: Write minimal implementation**
- Update view models with new language and summary structure.
- Update overlay controller markup hooks (`data-screen`, sections, aria labels).
- Introduce theme-driven class hooks for panel + action choreography.

**Step 4: Run tests and smoke**
- Run: `npm test -- src/ui/ScreenViewModels.test.ts`
- Run: `npm run qa:pw:start`
- Expected: PASS; start flow still enters PLAYING.

**Step 5: Commit**
```bash
git add src/ui/ScreenViewModels.ts src/ui/ScreenViewModels.test.ts src/ui/ScreenOverlayController.ts src/styles.css
git commit -m "feat(ui): align overlay screens with storyboard language and structure"
```

---

### Task 3: In-Round HUD Control Strip Overhaul

**Files:**
- Modify: `src/rendering/HudRenderer.ts`
- Modify: `src/rendering/HudRenderer.test.ts`
- Modify: `src/game/GameRuntime.ts`
- Modify: `src/config/GameConfig.ts`

**Step 1: Write failing HUD tests**
- Add tests verifying:
  - new HUD labels render in expected slots
  - warning/critical states activate style flags at thresholds
  - timer and pressure values remain legible at small viewport widths

**Step 2: Run tests to verify failure**
- Run: `npm test -- src/rendering/HudRenderer.test.ts`
- Expected: FAIL because new label/state model does not exist.

**Step 3: Write minimal implementation**
- Add HUD data contract updates in runtime.
- Implement compact “show control strip” rendering with semantic chips.
- Add threshold tokens for warning/critical states in config.

**Step 4: Run tests**
- Run: `npm test -- src/rendering/HudRenderer.test.ts src/game/GameRuntime.test.ts`
- Expected: PASS with no gameplay regressions.

**Step 5: Commit**
```bash
git add src/rendering/HudRenderer.ts src/rendering/HudRenderer.test.ts src/game/GameRuntime.ts src/config/GameConfig.ts
git commit -m "feat(hud): implement storyboard control-strip with urgency states"
```

---

### Task 4: Feedback Layer Pass (Combo, Hazard, Delivery Readability)

**Files:**
- Modify: `src/rendering/DeliveryFeedbackRenderer.ts`
- Modify: `src/rendering/DeliveryFeedbackRenderer.test.ts`
- Modify: `src/rendering/ComboFeedbackRenderer.ts`
- Modify: `src/rendering/ComboFeedbackRenderer.test.ts`
- Modify: `src/rendering/HazardOverlayRenderer.ts`
- Modify: `src/rendering/HazardOverlayRenderer.test.ts`

**Step 1: Write failing tests for event readability contract**
- Assert new event styles are:
  - localized (near stage/incident)
  - short-lived
  - non-blocking to map readability

**Step 2: Run tests to verify failure**
- Run: `npm test -- src/rendering/DeliveryFeedbackRenderer.test.ts src/rendering/ComboFeedbackRenderer.test.ts src/rendering/HazardOverlayRenderer.test.ts`
- Expected: FAIL due to missing style/state hooks.

**Step 3: Write minimal implementation**
- Introduce “single-hero-beat” rule in renderer behavior (no stacked hero bursts).
- Upgrade hazard markers to thought/speech bubble language.
- Rebalance combo visual intensity ladder.

**Step 4: Re-run tests**
- Run: `npm test -- src/rendering/DeliveryFeedbackRenderer.test.ts src/rendering/ComboFeedbackRenderer.test.ts src/rendering/HazardOverlayRenderer.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add src/rendering/DeliveryFeedbackRenderer.ts src/rendering/DeliveryFeedbackRenderer.test.ts src/rendering/ComboFeedbackRenderer.ts src/rendering/ComboFeedbackRenderer.test.ts src/rendering/HazardOverlayRenderer.ts src/rendering/HazardOverlayRenderer.test.ts
git commit -m "feat(feedback): implement storyboard-consistent combo and hazard readability pass"
```

---

### Task 5: Audio Cue Hierarchy and Mix Profile Wiring

**Files:**
- Modify: `src/audio/AudioManager.ts`
- Modify: `src/audio/AudioManager.test.ts`
- Modify: `src/game/GameRuntime.ts`
- Modify: `public/assets/maps/govball/config.json`

**Step 1: Write failing tests for cue hierarchy**
- Add tests for:
  - hero cue throttling (prevent stacked hero events)
  - category gain/fade behavior for `music` vs `tactical` vs `momentum` cues
  - graceful handling when optional cue files are absent

**Step 2: Run tests to verify failure**
- Run: `npm test -- src/audio/AudioManager.test.ts`
- Expected: FAIL because hierarchy/mix profile APIs are not implemented.

**Step 3: Write minimal implementation**
- Add mix profile methods keyed by theme/festival.
- Add cooldown/de-duplication for hero cues.
- Wire runtime cue calls to new categories.

**Step 4: Re-run tests**
- Run: `npm test -- src/audio/AudioManager.test.ts src/game/GameRuntime.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add src/audio/AudioManager.ts src/audio/AudioManager.test.ts src/game/GameRuntime.ts public/assets/maps/govball/config.json
git commit -m "feat(audio): add cue hierarchy and festival mix profile support"
```

---

### Task 6: Admin Panel Asset Preview (Sprites + Audio)

**Files:**
- Modify: `src/ui/AdminPanel.ts`
- Modify: `src/styles.css`
- Create: `src/admin/AdminPreviewModel.ts`
- Create: `src/admin/AdminPreviewModel.test.ts`
- Modify: `public/assets/admin/sprite_catalog.json`
- Modify: `public/assets/admin/audio_catalog.json`

**Step 1: Write failing tests for preview model**
- In `AdminPreviewModel.test.ts`, cover:
  - resolve selected override path -> preview payload
  - fallback to default asset path when no override
  - catalog lookup by id/category/type
  - “missing asset” preview state

**Step 2: Run tests to verify failure**
- Run: `npm test -- src/admin/AdminPreviewModel.test.ts`
- Expected: FAIL because model does not exist.

**Step 3: Write minimal implementation**
- Add `AdminPreviewModel` pure helper for:
  - selecting preview candidate from defaults + overrides + catalog
  - exposing label, asset path, prompt text, and type metadata
- Extend `AdminPanel` UI with:
  - sprite thumbnail preview pane (`<img>`) for selected row
  - audio preview pane (`<audio controls preload="none">`)
  - quick details card (asset path + prompt excerpt + source id)
- Ensure preview updates instantly when selector changes, before apply.

**Step 4: Re-run tests + manual smoke**
- Run: `npm test -- src/admin/AdminPreviewModel.test.ts`
- Run: `npm run qa:pw:start`
- Manual check: open `?admin=1`, validate previews for stage/distraction/artist/audio entries.

**Step 5: Commit**
```bash
git add src/ui/AdminPanel.ts src/styles.css src/admin/AdminPreviewModel.ts src/admin/AdminPreviewModel.test.ts public/assets/admin/sprite_catalog.json public/assets/admin/audio_catalog.json
git commit -m "feat(admin): add inline sprite/audio preview workflow for asset review"
```

---

### Task 7: Admin Panel Catalog UX for Review Throughput

**Files:**
- Modify: `src/ui/AdminPanel.ts`
- Modify: `src/styles.css`
- Create: `scripts/assets/validate-admin-catalogs.mjs`
- Modify: `package.json`

**Step 1: Write failing validation test script behavior**
- Add script expectation:
  - verify each catalog entry has `id`, `assetPath`, `promptText`
  - warn on duplicate ids and missing files under `public/assets`

**Step 2: Run script to verify failure**
- Run: `node scripts/assets/validate-admin-catalogs.mjs`
- Expected: FAIL/WARN until catalog and references are normalized.

**Step 3: Write minimal implementation**
- Add catalog validator script.
- Add admin panel controls for:
  - category filter (`background|stage|distraction|artist|music|sfx`)
  - search by id/path/prompt
  - sort by most recently reviewed (local state)

**Step 4: Run validation + smoke**
- Run: `node scripts/assets/validate-admin-catalogs.mjs`
- Run: `npm run qa:pw:start`
- Expected: validation passes; gameplay start unaffected.

**Step 5: Commit**
```bash
git add src/ui/AdminPanel.ts src/styles.css scripts/assets/validate-admin-catalogs.mjs package.json
git commit -m "feat(admin): improve catalog review throughput with validation, filter, and search"
```

---

### Task 8: Storyboard QA and Rollout Readiness

**Files:**
- Create: `scripts/playwright/run-storyboard-check.mjs`
- Create: `scripts/playwright/storyboard-actions.json`
- Modify: `package.json`
- Modify: `progress.md`
- Modify: `docs/ideation/2026-02-24-stage-call-ui-storyboard-spec.md`

**Step 1: Write failing storyboard assertions**
- Script should validate key states:
  - MENU visible and actionable
  - PLAYING with HUD visible
  - hazard/feedback event existence (render_game_to_text fields or telemetry hooks)
  - end-of-round overlay appears for completion/failure branch in deterministic scenario

**Step 2: Run to verify failure**
- Run: `node scripts/playwright/run-storyboard-check.mjs`
- Expected: FAIL before script/fixtures exist.

**Step 3: Write minimal implementation**
- Add deterministic action payloads to force representative beat transitions.
- Capture screenshots and state JSON per beat checkpoint.
- Add npm command: `npm run qa:pw:storyboard`.

**Step 4: Verify**
- Run: `npm run qa:pw:storyboard`
- Run: `npm test`
- Run: `npm run build`
- Expected: all pass.

**Step 5: Commit**
```bash
git add scripts/playwright/run-storyboard-check.mjs scripts/playwright/storyboard-actions.json package.json progress.md docs/ideation/2026-02-24-stage-call-ui-storyboard-spec.md
git commit -m "test(qa): add storyboard-level Playwright checks for UI overhaul readiness"
```

---

## Rollout Order (Recommended)
1. Task 1 -> Task 2 -> Task 3 (foundation and shell)
2. Task 4 -> Task 5 (feedback and audio polish)
3. Task 6 -> Task 7 (admin preview and review ergonomics)
4. Task 8 (end-to-end verification + release confidence)

## Non-Goals (This Plan)
- Changing core scoring matrix rules.
- Adding new gameplay mechanics beyond presentation/feedback.
- Replacing the existing map editor app architecture.

## Acceptance Criteria
- UI aligns with storyboard beats and remains readable under stress.
- Festival theming is configurable without breaking semantic states.
- Admin panel supports direct visual/audio preview and prompt context.
- Existing start flow and gameplay tests remain green.
- Build and Playwright storyboard checks pass.
