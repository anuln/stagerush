# Stage Call — Asset List: Gov Ball 2026

## Festival Identity

**Theme:** Urban festival in a NYC park. Concrete meets grass. Bold graphic colors, street-art influenced. Daytime progressing to golden hour to night across levels.

**Color Palette:**
- Primary: Electric Orange (#FF6B35)
- Secondary: Deep Navy (#1A1A2E)
- Accent: Hot Pink (#FF1493)
- Stage Main: Orange (#FF6B35)
- Stage Side: Cyan (#00D4FF)
- Stage Acoustic: Lime (#7BFF00)
- Background: Warm grey-green (park grass + paths)

---

## Map Background

| Asset | Filename | Dimensions | Format | Notes |
|-------|----------|-----------|--------|-------|
| Festival ground (full map) | `govball_bg.png` | 1080 × 1920 px | PNG | Top-down illustrated park. Grass areas, walkways, decorative tents. No gameplay elements baked in — stages and distractions are overlaid. Portrait orientation. Should feel alive but visually recessive (gameplay elements must read on top of it). |

**Art direction:** Illustrated/flat style. Visible elements include grass patches, gravel paths, decorative flags/banners, small trees, porta-potties in corners (non-interactive flavor). Color palette is muted greens and warm greys so that bright gameplay elements (stages, artists, paths) pop clearly.

---

## Stages (3)

| Asset | Filename | Dimensions | Format | Notes |
|-------|----------|-----------|--------|-------|
| Main Stage | `stage_main.png` | 160 × 120 px | PNG (transparent) | Largest stage. Big arch/truss structure. Orange-themed. Viewed from above/slight iso. Should have a clear "entrance" point at the front for path snapping. |
| Side Stage | `stage_side.png` | 120 × 96 px | PNG (transparent) | Mid-size tent/canopy stage. Cyan-themed. Same perspective as main. |
| Acoustic Tent | `stage_acoustic.png` | 96 × 80 px | PNG (transparent) | Small intimate tent. Lime-themed. Cozy/enclosed feel. |
| Stage glow (active/occupied) | `stage_glow.png` | 192 × 192 px | PNG (transparent) | Soft radial glow sprite, white. Tinted per-stage-color at runtime. Used when stage is occupied or during combo. |

**Stage placement (normalized coordinates):**
- Main Stage: (0.20, 0.25) — upper-left quadrant
- Side Stage: (0.75, 0.50) — right side, mid-height
- Acoustic Tent: (0.35, 0.78) — lower-left area

This triangle layout forces artists to cross the central area, creating collision opportunities.

---

## Spawn Points (4)

| ID | Position | Drift Angle | Description |
|----|----------|-------------|-------------|
| north | (0.50, 0.0) | 180° (straight down) | Top edge center |
| east | (1.0, 0.40) | 250° (down-left) | Right edge, upper |
| south | (0.60, 1.0) | 350° (up, slight right) | Bottom edge |
| west | (0.0, 0.65) | 80° (right, slight down) | Left edge, lower |

Drift angles chosen so default paths cross the festival center, ensuring unguided artists create collision situations.

---

## Artist Sprites

### Headliner Artists (3 characters)

| Asset | Filename | Dimensions | Format | Notes |
|-------|----------|-----------|--------|-------|
| Headliner A — walk frame 1 | `artist_headliner_a_walk1.png` | 64 × 64 px | PNG (transparent) | Large sprite. Gold ring border baked into sprite or applied at runtime. Character: bold outfit, sunglasses, confident pose. |
| Headliner A — walk frame 2 | `artist_headliner_a_walk2.png` | 64 × 64 px | PNG (transparent) | Alternate leg/arm position for walk cycle |
| Headliner A — idle | `artist_headliner_a_idle.png` | 64 × 64 px | PNG (transparent) | Standing pose, used during chat delay |
| Headliner A — performing | `artist_headliner_a_perform.png` | 64 × 64 px | PNG (transparent) | Arms-up / singing pose for stage performance |
| Headliner B — walk frame 1 | `artist_headliner_b_walk1.png` | 64 × 64 px | PNG (transparent) | Different character design. Same dimensions. |
| Headliner B — walk frame 2 | `artist_headliner_b_walk2.png` | 64 × 64 px | PNG (transparent) | |
| Headliner B — idle | `artist_headliner_b_idle.png` | 64 × 64 px | PNG (transparent) | |
| Headliner B — performing | `artist_headliner_b_perform.png` | 64 × 64 px | PNG (transparent) | |
| Headliner C — walk frame 1 | `artist_headliner_c_walk1.png` | 64 × 64 px | PNG (transparent) | |
| Headliner C — walk frame 2 | `artist_headliner_c_walk2.png` | 64 × 64 px | PNG (transparent) | |
| Headliner C — idle | `artist_headliner_c_idle.png` | 64 × 64 px | PNG (transparent) | |
| Headliner C — performing | `artist_headliner_c_perform.png` | 64 × 64 px | PNG (transparent) | |

### Mid-Tier Artists (3 characters)

| Asset | Filename | Dimensions | Format | Notes |
|-------|----------|-----------|--------|-------|
| Mid-tier A — walk frame 1 | `artist_mid_a_walk1.png` | 48 × 48 px | PNG (transparent) | Medium sprite. Silver ring. Character: cool but less flashy than headliner. |
| Mid-tier A — walk frame 2 | `artist_mid_a_walk2.png` | 48 × 48 px | PNG (transparent) | |
| Mid-tier A — idle | `artist_mid_a_idle.png` | 48 × 48 px | PNG (transparent) | |
| Mid-tier A — performing | `artist_mid_a_perform.png` | 48 × 48 px | PNG (transparent) | |
| Mid-tier B — walk frame 1 | `artist_mid_b_walk1.png` | 48 × 48 px | PNG (transparent) | |
| Mid-tier B — walk frame 2 | `artist_mid_b_walk2.png` | 48 × 48 px | PNG (transparent) | |
| Mid-tier B — idle | `artist_mid_b_idle.png` | 48 × 48 px | PNG (transparent) | |
| Mid-tier B — performing | `artist_mid_b_perform.png` | 48 × 48 px | PNG (transparent) | |
| Mid-tier C — walk frame 1 | `artist_mid_c_walk1.png` | 48 × 48 px | PNG (transparent) | |
| Mid-tier C — walk frame 2 | `artist_mid_c_walk2.png` | 48 × 48 px | PNG (transparent) | |
| Mid-tier C — idle | `artist_mid_c_idle.png` | 48 × 48 px | PNG (transparent) | |
| Mid-tier C — performing | `artist_mid_c_perform.png` | 48 × 48 px | PNG (transparent) | |

### Newcomer Artists (3 characters)

| Asset | Filename | Dimensions | Format | Notes |
|-------|----------|-----------|--------|-------|
| Newcomer A — walk frame 1 | `artist_new_a_walk1.png` | 40 × 40 px | PNG (transparent) | Small sprite. Bronze ring. Character: simpler outfit, guitar/backpack. |
| Newcomer A — walk frame 2 | `artist_new_a_walk2.png` | 40 × 40 px | PNG (transparent) | |
| Newcomer A — idle | `artist_new_a_idle.png` | 40 × 40 px | PNG (transparent) | |
| Newcomer A — performing | `artist_new_a_perform.png` | 40 × 40 px | PNG (transparent) | |
| Newcomer B — walk frame 1 | `artist_new_b_walk1.png` | 40 × 40 px | PNG (transparent) | |
| Newcomer B — walk frame 2 | `artist_new_b_walk2.png` | 40 × 40 px | PNG (transparent) | |
| Newcomer B — idle | `artist_new_b_idle.png` | 40 × 40 px | PNG (transparent) | |
| Newcomer B — performing | `artist_new_b_perform.png` | 40 × 40 px | PNG (transparent) | |
| Newcomer C — walk frame 1 | `artist_new_c_walk1.png` | 40 × 40 px | PNG (transparent) | |
| Newcomer C — walk frame 2 | `artist_new_c_walk2.png` | 40 × 40 px | PNG (transparent) | |
| Newcomer C — idle | `artist_new_c_idle.png` | 40 × 40 px | PNG (transparent) | |
| Newcomer C — performing | `artist_new_c_perform.png` | 40 × 40 px | PNG (transparent) | |

**Total artist sprites: 36** (9 characters × 4 poses each)

### Tier Visual Indicators (Runtime)

| Asset | Filename | Dimensions | Format | Notes |
|-------|----------|-----------|--------|-------|
| Tier ring — gold | `ring_gold.png` | 72 × 72 px | PNG (transparent) | Circular ring, placed behind artist sprite. Used for headliners. |
| Tier ring — silver | `ring_silver.png` | 56 × 56 px | PNG (transparent) | For mid-tier. |
| Tier ring — bronze | `ring_bronze.png` | 48 × 48 px | PNG (transparent) | For newcomers. |
| Timer ring | `timer_ring.png` | 72 × 72 px | PNG (transparent) | Thin circular track for the countdown. Filled arc rendered at runtime. White base, tinted green→yellow→red. |

---

## Distractions (4 types)

| Asset | Filename | Dimensions | Format | Notes |
|-------|----------|-----------|--------|-------|
| Merch Stand | `distraction_merch.png` | 96 × 96 px | PNG (transparent) | Small tent/booth with t-shirts hanging. Top-down view. |
| Burger Shack | `distraction_burger.png` | 96 × 96 px | PNG (transparent) | Food cart/truck. Smoke wisps optional. |
| Paparazzi | `distraction_paparazzi.png` | 80 × 80 px | PNG (transparent) | Figure with camera. Flash effect is separate sprite. |
| Fan Crowd | `distraction_fans.png` | 112 × 80 px | PNG (transparent) | Small cluster of 3-4 simplified figures. Slightly larger footprint. |
| Paparazzi flash | `fx_camera_flash.png` | 64 × 64 px | PNG (transparent) | White burst. Animated at runtime (alpha flash). |
| Distraction radius indicator | `distraction_radius.png` | 256 × 256 px | PNG (transparent) | Soft circular gradient, white. Scaled and tinted at runtime to show proximity zone. Very low alpha (0.1-0.15). |

**Distraction placement (Gov Ball):**

| ID | Type | Position | Radius | Delay | Appears At Level |
|----|------|----------|--------|-------|-----------------|
| merch1 | merch_stand | (0.50, 0.42) | 0.07 | 2.0s | 4 |
| burger1 | burger_shack | (0.30, 0.55) | 0.06 | 2.0s | 4 |
| paparazzi1 | paparazzi | (0.65, 0.35) | 0.06 | 3.0s | 6 |
| fans1 | fan_crowd | (0.45, 0.68) | 0.08 | 3.0s | 7 |
| burger2 | burger_shack | (0.72, 0.72) | 0.06 | 2.0s | 8 |
| merch2 | merch_stand | (0.18, 0.48) | 0.07 | 2.0s | 9 |

Placed to create routing challenges between stages without blocking direct paths entirely. Players can always find a route — the question is whether it's fast enough.

---

## UI Assets

| Asset | Filename | Dimensions | Format | Notes |
|-------|----------|-----------|--------|-------|
| Life icon (musical note) | `ui_life_note.png` | 32 × 32 px | PNG (transparent) | Stylized musical note. 3 shown in HUD. |
| Life icon lost | `ui_life_note_lost.png` | 32 × 32 px | PNG (transparent) | Grey/dim version for lost life. |
| Combo badge | `ui_combo_badge.png` | 80 × 40 px | PNG (transparent) | Rounded rectangle badge. Multiplier text rendered on top at runtime. |
| Star (level complete) | `ui_star_filled.png` | 48 × 48 px | PNG (transparent) | Gold star for score rating. |
| Star (empty) | `ui_star_empty.png` | 48 × 48 px | PNG (transparent) | Grey outline star. |
| Speech bubble (chat) | `fx_speech_bubble.png` | 48 × 32 px | PNG (transparent) | Small speech bubble. Appears between chatting artists. |
| Gov Ball logo/card | `govball_card.png` | 320 × 200 px | PNG | Festival selection card for main menu. |

---

## Effects / Particles

| Asset | Filename | Dimensions | Format | Notes |
|-------|----------|-----------|--------|-------|
| Confetti piece | `fx_confetti.png` | 8 × 8 px | PNG (transparent) | Small square. Tinted randomly at runtime for combo celebrations. |
| Stage light ray | `fx_lightray.png` | 16 × 128 px | PNG (transparent) | Narrow vertical beam. Used with additive blend on stage during performance/combo. |
| Score popup bg | `fx_score_popup.png` | 96 × 48 px | PNG (transparent) | Rounded rect for floating score numbers. |
| Path dot | `fx_path_dot.png` | 8 × 8 px | PNG (transparent) | Small circle. Can be used for dotted path style alternative. |

---

## Audio

| Asset | Filename | Format | Duration | Notes |
|-------|----------|--------|----------|-------|
| Background music (chill) | `audio_bg_chill.mp3` | MP3 | 60-90s loop | Levels 1-4. Relaxed festival vibe. |
| Background music (energy) | `audio_bg_energy.mp3` | MP3 | 60-90s loop | Levels 5-8. More driving beat. |
| Background music (peak) | `audio_bg_peak.mp3` | MP3 | 60-90s loop | Levels 9-10. Full intensity. |
| Artist spawn chime | `sfx_spawn.mp3` | MP3 | <1s | Subtle notification. Distinct but not alarming. |
| Path draw swoosh | `sfx_path_draw.mp3` | MP3 | <1s | Soft continuous swoosh during finger drag. |
| Stage delivery — normal | `sfx_deliver.mp3` | MP3 | <1s | Crowd cheer, short. |
| Stage delivery — combo | `sfx_deliver_combo.mp3` | MP3 | 1-2s | Bigger cheer with musical stinger. |
| Missed set | `sfx_miss.mp3` | MP3 | 1-2s | Descending tone, crowd "aww". |
| Artist chat | `sfx_chat.mp3` | MP3 | <1s | Brief babble/laugh. |
| Distraction trigger | `sfx_distraction.mp3` | MP3 | <1s | Context-neutral "ooh" or attention sound. |
| Level complete | `sfx_level_complete.mp3` | MP3 | 2-3s | Celebration fanfare. |
| Level failed | `sfx_level_failed.mp3` | MP3 | 2s | Sympathetic tone. |
| Timer warning (low time) | `sfx_timer_warning.mp3` | MP3 | <1s | Subtle tick/pulse when artist timer enters red zone. |

---

## Spritesheet Packing Plan

For production, individual PNGs should be packed into spritesheets to reduce draw calls and HTTP requests.

| Spritesheet | Contents | Estimated Size | Format |
|-------------|----------|----------------|--------|
| `govball_artists.json` + `.png` | All 36 artist sprites + 3 tier rings + timer ring | ~512 × 512 px atlas | TexturePacker JSON hash |
| `govball_map.json` + `.png` | 3 stage sprites + 6 distraction sprites + radius indicator | ~512 × 512 px atlas | TexturePacker JSON hash |
| `govball_ui.json` + `.png` | All UI elements + FX sprites | ~256 × 256 px atlas | TexturePacker JSON hash |
| `govball_bg.png` | Background (standalone, not atlased) | 1080 × 1920 px | PNG |

**Total estimated download per festival: ~2-3 MB** (compressed)

---

## Asset Generation Notes (for AI art tools)

### Style Guide for Sprite Generation

**Overall aesthetic:** Flat illustration with subtle shading. Bold outlines (2px dark). Limited color palette per sprite (4-6 colors max). Consistent top-down/45° viewing angle across all game elements.

**Artist sprites prompt guidance:**
- Top-down/isometric character, 2-head-tall proportions (chibi/simplified)
- Bold colored outlines
- Distinct silhouettes per character (recognizable at 48px)
- Walk animation: simple 2-frame leg alternation
- Transparent background, centered on canvas
- No fine detail that disappears at game scale

**Stage sprites prompt guidance:**
- Top-down festival stage structure
- Clear visual hierarchy: larger stage = more visual complexity
- Distinct color tinting per stage
- Visible "entrance" area at front/bottom
- Should read clearly against green/grey park background

**Distraction sprites prompt guidance:**
- Top-down view of festival elements
- Immediately recognizable icon-like quality (merch tent = tent + shirts, burger = cart + steam)
- Consistent style with stage/artist sprites
- Slightly smaller visual footprint than stages

### Recommended Tools
- **Sprites:** Gemini / Nano Banana for character generation, manual cleanup for consistency
- **Background:** Larger canvas generation, potentially composed from tiles
- **Audio:** ElevenLabs for crowd sounds, royalty-free libraries for music loops
