# Stage Call — Implementation Plan

## Reference Documents

Before starting any phase, the implementing agent should read:
- `stage-call-product-spec.md` — Full game design, rules, UX
- `stage-call-technical-spec.md` — Architecture, data schemas, PixiJS v8 patterns
- `stage-call-govball-assets.md` — Asset list for the first festival map
- Project skill files: `pixijs-v8-mobile-rich-ux-skill.md` (PixiJS v8 best practices), `SKILL.md` (game design framework)

---

## Phase 0: Project Scaffolding

**Goal:** Runnable PixiJS v8 app with a colored rectangle on screen.

**Tasks:**
1. Initialize project with Vite + TypeScript
2. Install PixiJS v8 (`pixi.js` latest v8.x)
3. Create `index.html` with viewport meta for mobile (no zoom, no scroll)
4. Create `main.ts`:
   - Initialize `Application` with mobile-optimized settings (see technical spec: resolution clamping, low-power preference, resizeTo window)
   - Append canvas to document body
   - Add a colored rectangle to confirm rendering works
5. Configure Vite for static asset serving from `public/assets/`
6. Add base CSS: no margin, overflow hidden, touch-action none, user-select none
7. Verify: app loads, canvas fills screen in portrait, rectangle visible

**Acceptance:** Running `npm run dev` shows a full-screen PixiJS canvas with a test shape. No console errors. Responsive to window resize.

---

## Phase 1: Map Rendering + Stages

**Goal:** Load and display a festival map with stages. No interactivity yet.

**Tasks:**
1. Create `FestivalConfig` TypeScript types matching the map data schema (see technical spec)
2. Create a test `govball.json` config file with:
   - 3 stages (positions, sizes, colors)
   - 4 spawn points (positions, drift angles)
   - Placeholder background color (no image asset yet)
3. Build `MapLoader.ts`: load JSON config, resolve positions from normalized (0-1) to screen coordinates
4. Build `MapRenderer.ts`:
   - Render background (solid color for now, image later)
   - Render stages as colored rectangles at configured positions, sized by category (large > medium > small)
   - Render spawn points as small arrows showing drift direction (debug visualization)
5. Set up scene graph layers:
   - `mapLayer` → background
   - `stageLayer` → stage sprites
   - `debugLayer` → spawn point indicators (toggleable)
6. Handle window resize: recalculate positions from normalized coords

**Acceptance:** Map renders with 3 colored rectangles representing stages at correct positions. Spawn point arrows visible. Resizing window repositions everything correctly.

**Placeholder assets:** Colored rectangles for stages, arrow graphics for spawn points. Real sprites come later.

---

## Phase 2: Artist Spawning + Drift Movement

**Goal:** Artists appear at spawn points and walk in their drift direction.

**Tasks:**
1. Create `Artist.ts` entity class:
   - Properties: id, tier, position, velocity, state (DRIFTING initially), timer (countdown), path (null initially)
   - State machine with states: SPAWNING, DRIFTING, FOLLOWING, CHATTING, DISTRACTED, ARRIVING, PERFORMING, COMPLETED, MISSED
   - Update method: move position by velocity per frame (delta-time based)
   - Timer decrement per frame
2. Create `ObjectPool.ts`: generic pool with acquire/release. Pre-allocate artist objects
3. Create `SpawnSystem.ts`:
   - Accept level config (maxSimultaneous, timerRange, tierWeights, spawnInterval)
   - On spawn tick: if active artists < maxSimultaneous, create artist at random spawn point with random tier
   - Set drift velocity from spawn point's driftAngle and configured speed
4. Create `TimerSystem.ts`:
   - Update all active artists' timers each frame
   - When timer hits 0: transition to MISSED state, trigger miss event
5. Add artist rendering:
   - Colored circle per tier (gold/silver/bronze) as placeholder sprite
   - Timer visualization: circular progress ring (Graphics arc) depleting over time, color shift green→yellow→red
   - Add to `artistLayer`
6. Detect map boundary exit: if artist position is outside map bounds, transition to MISSED
7. Wire up lives system: track miss count, emit event at 3 misses

**Acceptance:** Artists spawn at edges, walk in drift directions, timers count down visually. Artists that exit the map or expire are marked as missed. After 3 misses, a console log fires (UI for this comes later). Multiple artists can be active simultaneously.

---

## Phase 3: Path Drawing + Following

**Goal:** Player can draw paths from artists to stages. Artists follow drawn paths.

**This is the most critical phase. Path drawing MUST feel responsive and smooth on mobile touch.**

**Tasks:**
1. Create `PathDrawing.ts`:
   - Listen for `pointerdown` on gameplay area
   - On down: check if touch is within grab radius (40px) of any DRIFTING or FOLLOWING artist
   - If yes: enter drawing mode. Capture artist reference. Begin collecting touch points
   - On `pointermove`: append position to raw point array. Render in-progress path
   - On `pointerup`: finalize path
2. Create `Spline.ts`:
   - Catmull-Rom interpolation function
   - Input: raw touch points. Output: smoothed point array with uniform spacing
   - Resample to fixed interval (e.g., every 8px along the curve) for consistent movement speed
3. Implement stage snapping:
   - After finalization, check last point proximity to each stage
   - If within snap radius (60px): extend path to stage entrance point, set targetStageId
   - If not near any stage: path is invalid, fade it out, artist continues current trajectory
4. Create `Path.ts` rendering:
   - Graphics object drawing the smoothed path as a colored line
   - Color: matches target stage color if snapped, grey if not snapped
   - Fade traversed portion to lower alpha as artist moves along it
5. Create `PathFollower.ts`:
   - Given a smoothed point array, move artist from point to point at configured speed
   - Track progress as an index/interpolation along the point array
   - On reaching final point (stage): transition artist to ARRIVING
6. Implement path replacement: drawing a new path from an artist who already has one replaces the old path. Artist begins following new path from current position
7. Implement ETA display: while drawing, show estimated travel time near artist. Red if ETA > remaining timer

**Acceptance:** Player can touch an artist, drag to draw a visible path, release to confirm. Path auto-smooths. Artist follows the path to a stage. Path snaps to stage when endpoint is close. Drawing a new path replaces the old one. ETA shows while drawing. Path drawing feels immediate with no perceptible lag on mobile.

**Performance critical:** Path rendering and touch handling must not drop frames. Profile on mobile device or throttled DevTools.

---

## Phase 4: Stage Delivery + Scoring

**Goal:** Artists arrive at stages, perform briefly, score is calculated and displayed.

**Tasks:**
1. Implement `Stage.ts` entity:
   - Properties: id, size, position, color, snapRadius, occupied (boolean), currentArtist, occupiedTimer
   - Occupied state: when artist arrives, stage is occupied for 2.5 seconds
   - After set duration: stage frees, artist transitions to COMPLETED, removed from play
2. Implement scoring in `ScoreManager.ts`:
   - Tier × Stage size matrix (see product spec scoring table)
   - Base points: 100. Multipliers: 0.5x to 3x based on match
   - Running total, emits score events
3. Implement arrival queuing: if artist arrives at occupied stage, they wait at the entrance until stage frees, then begin their set. Timer still ticks during wait — this is intentional (adds risk to sending artists to busy stages)
4. Add visual feedback for delivery:
   - Stage "glow" brightens when occupied
   - Score number pops up and floats upward (tween: scale up, move up, fade out)
   - Brief particle burst (confetti) on delivery — simple sprite pool
5. Build `HUD.ts`:
   - Score display (top-left): text with animated increment
   - Lives display (top-right): 3 note icons, animate out on miss
   - Level indicator (top-center): "Level X"
6. Add miss feedback:
   - When artist state → MISSED: brief red flash on the artist, fade out
   - Life icon animates away
   - Sound trigger placeholder (actual audio later)

**Acceptance:** Artists arriving at stages trigger a performance period, then score. Correct score calculated for tier/stage match. Score displays in HUD and animates on change. Lives decrement on miss with visual feedback. Stage shows as occupied during performance.

---

## Phase 5: Artist-Artist Collision

**Goal:** Artists that come near each other stop and chat, delaying both.

**Tasks:**
1. Create `CollisionSystem.ts`:
   - Each frame: iterate all pairs of active artists (DRIFTING or FOLLOWING)
   - If distance < collision radius (40px) and neither is CHATTING: trigger chat
   - Both transition to CHATTING state
   - Store each artist's pre-chat state and path progress
   - Start chat delay timer (3 seconds)
2. Chat state behavior:
   - Artists stop moving
   - Chat timer counts down
   - On timer end: both resume previous state (DRIFTING continues drift, FOLLOWING continues path from current position)
3. Visual feedback:
   - Speech bubble sprite appears between the two artists
   - Artists play idle animation (placeholder: just stop moving)
   - Artists' countdown timers continue ticking (visible pressure)
4. Allow path redraw during chat: player can draw a new path for a chatting artist. The new path takes effect when the chat ends

**Acceptance:** Two artists crossing paths stop and display a chat bubble for 3 seconds. Both timers continue. After chat, they resume. Player can queue a new path during chat. Collisions feel like a consequence of routing decisions.

---

## Phase 6: Combo System

**Goal:** Consecutive deliveries to the same stage earn multiplier bonuses.

**Tasks:**
1. Implement `ComboTracker.ts`:
   - Per-stage state: chain length, last delivery timestamp, combo window (5 seconds)
   - On delivery: check if within combo window of previous delivery to same stage
   - If yes: increment chain, calculate multiplier (1x → 1.5x → 2x → 3x cap)
   - If no: reset chain to 1
   - Apply multiplier to score calculation
2. Visual feedback:
   - Combo badge appears near stage showing current multiplier ("1.5x", "2x", "3x")
   - Badge scales up on increment, pulses while active
   - Stage glow intensifies with combo level
   - At 3x+: confetti particles increase
3. Combo break feedback:
   - Badge fades out when combo window expires
   - Subtle visual reset on stage (glow returns to normal)

**Acceptance:** Delivering 3 artists to the same stage within 5-second windows produces escalating multiplier. Score reflects multiplier correctly. Visual combo indicator is clear and satisfying. Combo resets on timeout.

---

## Phase 7: Distractions

**Goal:** Map distractions that delay artists who pass too close.

**Tasks:**
1. Create `Distraction.ts` entity:
   - Properties: id, type, position, radius, delay, appearsAtLevel, sprite
   - Active/inactive based on current level number
2. Add distraction rendering:
   - Distraction sprite at configured position
   - Faint radius circle (very low alpha) showing danger zone
   - Only render active distractions for current level
3. Extend `CollisionSystem.ts`:
   - Check each active artist against each active distraction
   - If artist enters distraction radius and is DRIFTING or FOLLOWING: transition to DISTRACTED
   - Tween artist toward distraction center
   - Start distraction delay timer
   - On timer end: resume previous trajectory
4. Visual feedback:
   - Artist moves toward distraction
   - Context animation placeholder (artist stops at distraction, brief interaction implied)
   - Distraction radius circle briefly brightens when triggered
5. Ensure distractions and chat collisions can compound (artist delayed at distraction, then collides with passing artist)

**Acceptance:** Distractions appear at configured levels. Artists passing through radius get pulled in and delayed. Player can see distraction zones clearly. Delays feel consequential but not unfair (zones are visible and avoidable).

---

## Phase 8: Level Progression + Game Flow

**Goal:** Complete game session: festival selection → levels → completion/failure.

**Tasks:**
1. Create `GameManager.ts` state machine:
   - States: MENU, FESTIVAL_SELECT, PLAYING, LEVEL_COMPLETE, LEVEL_FAILED, FESTIVAL_COMPLETE
   - Manages transitions between states, loads/unloads appropriate scenes
2. Create `LevelManager.ts`:
   - Load level config from festival data
   - Configure spawn system for current level
   - Activate appropriate distractions
   - Track level completion: all artists in level quota resolved
   - Track level failure: 3 misses
   - Calculate level score
3. Implement level progression:
   - On level complete: show score breakdown, option to continue
   - On level fail: show score, option to replay or quit
   - Track cumulative score across levels
4. Implement randomization per level attempt:
   - Randomize spawn point selection per wave
   - Randomize drift angles within ±15° of configured angle
   - Randomize tier distribution within configured weights
   - Randomize which subset of distraction positions are active (from the full set)
5. Build UI screens (simple, functional — polish later):
   - Main menu: festival selection cards
   - Level complete: score breakdown, stars, next/replay buttons
   - Level failed: score, replay/quit buttons
   - Festival complete: total score, celebration
6. Implement local storage persistence:
   - Save: level scores, cumulative best, current progress, settings
   - Load: on app start, restore progress

**Acceptance:** Player can select a festival, play through levels with escalating difficulty, see score breakdowns, retry failed levels, and complete a festival. Progress persists across browser sessions. Randomization makes replays feel varied.

---

## Phase 9: Polish + Visual Assets

**Goal:** Replace all placeholders with real sprites and add juice.

**Tasks:**
1. Integrate actual sprite assets:
   - Load artist spritesheets, assign to artist entities by tier
   - Load stage sprites, replace colored rectangles
   - Load distraction sprites with radius indicators
   - Load background image for Gov Ball map
2. Implement artist animations:
   - Walk cycle: alternate between 2 walk frames based on movement
   - Idle: static frame during chat/distraction
   - Performing: pose on stage during set
3. Add particle effects:
   - Delivery celebration: confetti burst from stage (ParticleContainer, pooled)
   - Combo escalation: increasing particle density
   - Stage lights: subtle light ray sprites with additive blend during performance
4. Add screen transitions:
   - Fade between menu and gameplay
   - Level complete overlay with animated score tally
5. Implement audio:
   - Load audio assets
   - Wire up sound triggers to game events (spawn, delivery, miss, chat, distraction, combo, level complete/fail)
   - Background music per level range, crossfade between tracks
   - Audio manager with mute toggle
6. Add path drawing visual polish:
   - Smooth line rendering with rounded caps
   - Subtle glow/shadow on path lines for readability against busy backgrounds
   - Path fade-behind animation as artist traverses

**Acceptance:** Game looks and sounds like a finished product. All placeholder graphics replaced. Animations play correctly. Audio triggers at appropriate moments. Visual effects enhance gameplay without hurting readability or performance.

---

## Phase 10: Performance Optimization + Testing

**Goal:** Stable 60 FPS on target mobile devices. No bugs.

**Tasks:**
1. Profile on real devices:
   - iPhone SE 2022 (or equivalent)
   - Mid-range Android (Samsung Galaxy A53 or equivalent)
   - Use browser DevTools performance tab + PixiJS stats
2. Optimize if needed:
   - Implement quality scaler (resolution reduction if frame time > 20ms)
   - Reduce particle counts on low-end
   - Verify object pooling prevents GC spikes
   - Ensure no texture leaks between levels
3. Verify asset loading:
   - Festival bundle loads <3 seconds on throttled 4G
   - Bundle unloads correctly when returning to menu
4. Touch input testing:
   - Path drawing latency is imperceptible
   - No missed touch events during multi-artist scenarios
   - Artist grab radius works reliably (no wrong-artist grabs, no failed grabs)
5. Edge case testing:
   - Rapid path redraw spam
   - Drawing while all stages occupied
   - Artist arriving at stage at exact moment stage frees
   - Two artists colliding at exact same frame
   - Timer expiring while artist is CHATTING or DISTRACTED
   - Browser tab going to background and returning
   - Window resize during active gameplay
6. Playtest against product spec scenarios:
   - New player test: can complete Level 1-2 without instruction
   - Skill test: expert-level play produces 40-50% higher scores
   - Readability test: observer can narrate gameplay correctly

**Acceptance:** 60 FPS sustained on target devices. No crashes or visual glitches. All edge cases handled gracefully. Touch interactions are reliable and responsive.

---

## Phase 11: Admin Map Editor (Separate Project)

**Goal:** Web tool for creating and editing festival map configurations.

**Tasks:**
1. Create standalone web app (React or vanilla HTML/JS)
2. Canvas workspace:
   - Upload and display background image
   - Click to place stages, drag to reposition
   - Configure stage properties (size, color, snap radius) via sidebar
3. Spawn point editor:
   - Click on map edges to place
   - Drag to set drift angle (arrow visualization)
4. Distraction editor:
   - Click to place
   - Set type (dropdown), radius (drag handle), delay, activation level
   - Visualize radius as translucent circle
5. Artist sprite manager:
   - Upload sprite images
   - Define animation frames (walk1, walk2, idle, performing)
   - Assign tier
   - Optional: set display name
6. Level curve editor:
   - Table/form for per-level parameters
   - Columns: level number, total artists, max simultaneous, timer range, tier weights, spawn interval, active distractions
7. Validation:
   - Minimum 2 stages
   - Minimum 2 spawn points (on map edges)
   - No stages overlapping distraction radii
   - All referenced sprites exist
   - Level curve values are sane (no negative timers, etc.)
8. Export:
   - Generate `festival-config.json` matching FestivalMap schema
   - Generate PixiJS asset manifest
   - Package asset files for deployment
9. Preview mode:
   - Simulate artist spawning and drifting on the configured map
   - Visualize all placements with actual sprites

**Acceptance:** Non-technical user can create a complete festival configuration by uploading art and clicking to place elements. Exported JSON loads correctly in the game. Validation catches common mistakes.

---

## Dependency Graph

```
Phase 0 (Scaffold)
  └── Phase 1 (Map + Stages)
        └── Phase 2 (Artists + Drift)
              └── Phase 3 (Path Drawing) ← MOST CRITICAL
                    ├── Phase 4 (Delivery + Scoring)
                    │     └── Phase 6 (Combos)
                    ├── Phase 5 (Collisions)
                    └── Phase 7 (Distractions)
                          └── Phase 8 (Level Flow + Game Flow)
                                └── Phase 9 (Polish + Assets)
                                      └── Phase 10 (Optimization + Testing)

Phase 11 (Admin Tool) — independent, can start after Phase 1 schemas are stable
```

---

## Key Implementation Notes

### Critical Path
Phase 3 (Path Drawing) is the make-or-break feature. If path drawing doesn't feel good on mobile touch, nothing else matters. Allocate extra time here. Test on real devices early and often.

### Placeholder Asset Strategy
Phases 1-8 use programmatic placeholder art (colored shapes, circles, lines). This keeps the focus on mechanics and feel. Real assets integrate in Phase 9. Do not block gameplay development on art production.

### Configuration-Driven Design
All tuning values (speeds, timers, radii, scoring multipliers, combo windows) should be defined in `GameConfig.ts` as named constants, not magic numbers in code. This enables rapid iteration during playtesting.

### Delta-Time Everything
All movement, timers, and animations must use delta-time from PixiJS ticker. Never assume fixed frame rate. The game should behave identically at 30 FPS and 60 FPS.

### Mobile-First Testing
After each phase, test on mobile (or mobile-emulated DevTools with touch events and throttled CPU). Do not wait until Phase 10 to discover mobile issues.

### Asset Manifest Structure
```
public/
├── assets/
│   ├── manifests/
│   │   └── govball2026.json       # PixiJS Assets manifest
│   ├── maps/
│   │   └── govball/
│   │       ├── config.json        # FestivalMap data
│   │       ├── bg.png
│   │       ├── artists.json + .png  # spritesheet
│   │       ├── stages.json + .png   # spritesheet
│   │       ├── ui.json + .png       # spritesheet
│   │       └── audio/
│   │           ├── bg_chill.mp3
│   │           ├── sfx_deliver.mp3
│   │           └── ...
│   └── boot/
│       ├── fonts/
│       ├── ui_common.json + .png
│       └── ...
```
