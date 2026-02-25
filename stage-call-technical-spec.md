# Stage Call — Technical Specification

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Rendering** | PixiJS v8 | Mobile-optimized 2D WebGL renderer, async init, asset management |
| **Language** | TypeScript | Type safety for game state, sprite configs, map data |
| **Build** | Vite | Fast HMR for development, efficient production bundles |
| **Platform** | Mobile web (browser) | Shareable via URL, no app store overhead |
| **Hosting** | Static files (CDN) | Simple deployment, fast global delivery |
| **Data** | Local Storage (V1) | Leaderboard, progress persistence. Server-backed in future |

---

## Architecture Overview

```
src/
├── main.ts                    # Entry point, PixiJS app init
├── game/
│   ├── GameManager.ts         # Top-level game state machine
│   ├── LevelManager.ts        # Level lifecycle, wave spawning, scoring
│   ├── PathDrawing.ts         # Touch input → path generation → smoothing
│   ├── PathFollower.ts        # Artist movement along paths
│   ├── CollisionSystem.ts     # Artist-artist proximity + distraction proximity
│   ├── ComboTracker.ts        # Per-stage combo chain state
│   └── ScoreManager.ts        # Scoring calculations, leaderboard persistence
├── entities/
│   ├── Artist.ts              # Artist entity (state machine, sprite, timer)
│   ├── Stage.ts               # Stage entity (occupancy, snap zone, combo state)
│   ├── Distraction.ts         # Distraction entity (proximity zone, delay)
│   └── Path.ts                # Rendered path (graphics, ETA calculation)
├── maps/
│   ├── MapLoader.ts           # Load festival JSON + resolve asset paths
│   └── MapRenderer.ts         # Render background, stages, distractions, spawn markers
├── ui/
│   ├── HUD.ts                 # Score, lives, combo indicator, level counter
│   ├── MainMenu.ts            # Festival selection screen
│   ├── LevelComplete.ts       # Score breakdown, star rating
│   ├── LevelFailed.ts         # Retry/quit prompt
│   └── FestivalComplete.ts    # Final score, leaderboard
├── config/
│   ├── GameConfig.ts          # Global constants, tuning values
│   └── FestivalConfig.ts      # TypeScript types for map JSON schema
├── systems/
│   ├── SpawnSystem.ts         # Wave timing, artist creation from spawn points
│   ├── TimerSystem.ts         # Per-artist countdown management
│   └── QualityScaler.ts       # Frame-time adaptive quality (resolution, particles)
├── audio/
│   └── AudioManager.ts        # Sound loading, playback, ducking
└── utils/
    ├── ObjectPool.ts          # Generic pool for artists, paths, particles
    ├── Spline.ts              # Catmull-Rom path smoothing
    └── MathUtils.ts           # Distance, angle, lerp helpers
```

---

## PixiJS v8 Configuration

### Renderer Init

```ts
import { Application } from 'pixi.js';

const isMobile = /Mobi|Android/i.test(navigator.userAgent);
const dpr = window.devicePixelRatio || 1;
const resolution = isMobile ? Math.min(dpr, 1.5) : dpr;

const app = new Application();
await app.init({
  resizeTo: window,
  autoDensity: true,
  resolution,
  powerPreference: isMobile ? 'low-power' : 'high-performance',
  backgroundAlpha: 1,
  backgroundColor: 0x1a1a2e,
});

document.body.appendChild(app.canvas);
```

Key decisions:
- Resolution clamped to 1.5x DPR on mobile (fill-rate budget)
- Low-power GPU preference on mobile
- `resizeTo: window` for responsive canvas
- Portrait orientation enforced via CSS + viewport meta

### Asset Loading Strategy

```ts
import { Assets } from 'pixi.js';

// Boot bundle: UI chrome, fonts, menu assets
await Assets.loadBundle('boot');

// Festival bundle: loaded when player selects a festival
await Assets.loadBundle('govball2026');

// On festival exit: reclaim memory
await Assets.unloadBundle('govball2026');
```

Each festival is a separate asset bundle. Only one festival loaded at a time. Boot bundle stays resident.

### Scene Graph Structure

```
app.stage
├── mapLayer          # Background, static map elements
├── distractionLayer  # Distraction sprites + radius indicators
├── pathLayer         # All drawn/active path lines
├── artistLayer       # Artist sprites (above paths for visibility)
├── stageLayer        # Stage sprites + occupancy indicators
├── fxLayer           # Particles, combo effects, delivery celebrations
└── uiLayer           # HUD elements (score, lives, combo text)
```

Layers use PixiJS v8 RenderLayers for draw-order control without reparenting. `mapLayer` and `distractionLayer` use RenderGroups since they change infrequently.

### Event Mode Discipline
- All non-interactive elements: `eventMode = 'none'`
- Artist sprites: `eventMode = 'static'` with circular `hitArea`
- Stage sprites: `eventMode = 'none'` (stages aren't tapped directly)
- Background/map: `eventMode = 'static'` on a full-screen invisible hit target for path drawing start detection

---

## Core Systems

### Path Drawing System

**Input handling:**
1. `pointerdown` on the gameplay area
2. Check if touch position is within grab radius of any artist (40px, configurable)
3. If yes: begin path from that artist. Enter drawing mode
4. `pointermove`: accumulate touch points into a raw point array
5. `pointerup`: finalize path

**Path smoothing:**
Raw touch points → Catmull-Rom spline interpolation → uniformly sampled output points

```ts
interface PathData {
  artistId: string;
  rawPoints: { x: number; y: number }[];
  smoothedPoints: { x: number; y: number }[];
  totalLength: number;
  estimatedTime: number;  // seconds based on artist speed
  targetStageId: string | null;  // set if endpoint snapped to a stage
}
```

**Stage snapping:**
After path finalization, check if the last point is within snap radius (60px) of any stage entrance. If yes, extend/adjust the path endpoint to the exact stage entrance position and set `targetStageId`.

**Path rendering:**
Use `Graphics` to draw the smoothed path as a colored line. Color = destination stage color if snapped, grey if not. Line width: 3-4px. Alpha fades to 0.3 for the portion the artist has already traversed.

**ETA calculation:**
`totalLength / artistSpeed`. Compared against artist's remaining timer. Displayed as small text near the artist while drawing.

### Artist State Machine

```
          ┌──────────┐
          │ SPAWNING │
          └────┬─────┘
               │ (enters map)
          ┌────▼─────┐
     ┌────│ DRIFTING │◄────────────────────┐
     │    └────┬─────┘                     │
     │         │ (player draws path)       │
     │    ┌────▼──────┐                    │
     │    │ FOLLOWING  │───────────────┐   │
     │    └────┬──┬───┘               │   │
     │         │  │                   │   │
     │         │  │(enters distraction│   │
     │         │  │ radius)           │   │
     │         │  ▼                   │   │
     │         │ ┌────────────┐       │   │
     │         │ │ DISTRACTED │───────┘   │
     │         │ └────────────┘ (delay    │
     │         │                 ends,    │
     │         │                 resume)  │
     │    (meets├──────────────────────┐  │
     │    another│                     │  │
     │    artist)│                     │  │
     │         ▼                      ▼  │
     │    ┌──────────┐          ┌────────┐│
     │    │ CHATTING  │         │ARRIVING││
     │    └────┬─────┘          └────┬───┘│
     │         │(delay ends)        │     │
     │         └─────►DRIFTING──────┘     │
     │                or FOLLOWING        │
     │                                    │
     │    (timer=0 or exits map)          │
     │    ┌────────┐                      │
     └───►│ MISSED │                      │
          └────────┘                      │
                                          │
          ┌───────────┐                   │
          │PERFORMING │◄──────────────────┘
          └─────┬─────┘
                │ (set duration ends)
          ┌─────▼─────┐
          │ COMPLETED │
          └───────────┘
```

State transitions:
- `SPAWNING → DRIFTING`: Immediately on creation
- `DRIFTING → FOLLOWING`: Player draws valid path from this artist
- `FOLLOWING → ARRIVING`: Artist reaches stage position
- `ARRIVING → PERFORMING`: Stage is available (or becomes available after brief queue)
- `PERFORMING → COMPLETED`: Set duration (2.5s) ends. Artist removed from play
- `DRIFTING/FOLLOWING → CHATTING`: Proximity to another artist triggers collision
- `CHATTING → DRIFTING/FOLLOWING`: Chat delay (3s) ends. Resumes previous state
- `FOLLOWING → DISTRACTED`: Enters distraction proximity zone
- `DISTRACTED → FOLLOWING`: Distraction delay ends. Resumes path
- `ANY (except PERFORMING/COMPLETED) → MISSED`: Timer expires or artist exits map bounds

### Collision System

Runs every frame. Two checks:

**1. Artist-Artist proximity:**
For each pair of active artists (DRIFTING or FOLLOWING states), check distance. If within collision radius (40px) and neither is already CHATTING:
- Both transition to CHATTING
- Store their current state and path progress for resume
- Start chat timer (3s)

Optimization: with max 4-5 active artists, brute-force pairwise check is fine (max 10 pairs). No spatial partitioning needed.

**2. Artist-Distraction proximity:**
For each active artist, check distance to each active distraction center. If within distraction radius and artist is FOLLOWING or DRIFTING:
- Transition to DISTRACTED
- Move artist toward distraction center (short tween)
- Start distraction delay timer

Optimization: distractions are static and few (<6). Simple distance checks per artist per frame.

### Combo Tracker

Per-stage state:

```ts
interface StageComboState {
  chainLength: number;      // current consecutive deliveries
  lastDeliveryTime: number; // timestamp of last set completion
  comboWindow: number;      // ms before chain breaks (5000ms default)
}
```

On artist delivery to stage:
1. Check if `now - lastDeliveryTime < comboWindow`
2. If yes: increment `chainLength`, apply multiplier
3. If no: reset `chainLength` to 1
4. Update `lastDeliveryTime` to when this artist's set ends (not starts)

Multiplier lookup: `[1.0, 1.5, 2.0, 3.0, 3.0, ...]` (caps at 3.0x for 4+)

### Spawn System

Each level defines:
```ts
interface LevelConfig {
  levelNumber: number;
  totalArtists: number;         // how many artists total this level
  maxSimultaneous: number;      // max active artists at once
  timerRange: [number, number]; // [min, max] seconds
  tierWeights: { headliner: number; midtier: number; newcomer: number };
  activeDistractions: string[]; // which distraction IDs are active
  spawnInterval: [number, number]; // [min, max] ms between spawns
}
```

Spawning logic:
1. Track active artist count
2. When active < maxSimultaneous and spawn timer elapsed: spawn next artist
3. Select random spawn point from map's spawn point list
4. Select tier based on weighted random from `tierWeights`
5. Set timer based on random within `timerRange`
6. Level ends when `totalArtists` have been spawned AND all are resolved (completed or missed)

---

## Map Data Schema

```ts
interface FestivalMap {
  id: string;                    // "govball2026"
  name: string;                  // "Gov Ball 2026"
  description: string;
  totalLevels: number;
  background: string;            // asset path: "maps/govball/bg.png"

  stages: StageConfig[];
  spawnPoints: SpawnPointConfig[];
  distractions: DistractionConfig[];
  levels: LevelConfig[];

  assets: {
    artists: ArtistSpriteConfig[];
    stageSprites: Record<string, string>;     // stageId → asset path
    distractionSprites: Record<string, string>; // distractionType → asset path
    audio: Record<string, string>;              // soundId → asset path
  };
}

interface StageConfig {
  id: string;
  size: 'large' | 'medium' | 'small';
  position: { x: number; y: number };  // normalized 0-1
  snapRadius: number;                   // normalized
  sprite: string;                       // asset path
  color: string;                        // hex, used for path coloring
}

interface SpawnPointConfig {
  id: string;
  position: { x: number; y: number };  // normalized, on map edge
  driftAngle: number;                   // degrees, direction artist walks
}

interface DistractionConfig {
  id: string;
  type: 'merch_stand' | 'burger_shack' | 'paparazzi' | 'fan_crowd';
  position: { x: number; y: number };  // normalized
  radius: number;                       // normalized
  delay: number;                        // seconds
  appearsAtLevel: number;
  sprite: string;                       // asset path
}

interface ArtistSpriteConfig {
  id: string;
  name: string;                         // display name (optional flavor)
  tier: 'headliner' | 'midtier' | 'newcomer';
  sprites: {
    walk: string[];                     // 2-3 frame paths
    idle: string;                       // standing/chatting frame
    performing: string;                 // on-stage frame
  };
}
```

All position coordinates are normalized (0.0 to 1.0). The game scales these to actual pixel positions based on the current viewport and map background dimensions. This ensures maps work across all screen sizes and aspect ratios.

---

## Rendering & Performance

### Target
- 60 FPS on iPhone SE 2022 / Samsung Galaxy A53
- Graceful degradation to 30 FPS on lower-end devices

### Resolution Strategy
- DPR clamped to 1.5 on mobile
- Quality scaler monitors rolling average frame time
- If sustained >20ms: reduce resolution clamp to 1.0
- If sustained <14ms: restore resolution clamp to 1.5

### Draw Call Budget
Typical frame at peak complexity (4 artists, 4 paths, 4 distractions, combo particles):
- Background: 1 draw call (single sprite)
- Stages: 3 draw calls (3 sprites)
- Distractions: 4 draw calls (4 sprites)
- Distraction radius indicators: 4 draw calls (4 circles via Graphics, can batch)
- Artists: 4 draw calls (4 sprites)
- Paths: 4 draw calls (4 Graphics objects)
- HUD: 3-4 draw calls (text + icons)
- Particles/FX: 1-2 draw calls (ParticleContainer)
- **Total: ~25-30 draw calls** — well within mobile budget

### Object Pooling
Artists, paths, and particle effects are pooled. No per-frame allocations in the game loop. Artist pool size: 8 (max 4 active + 4 recycling). Path pool size: 8. Particle pool: 50 sprites.

### Texture Memory
Per festival:
- Background: 1 texture (1024×1824 or similar portrait, compressed)
- Stage sprites: 3 textures (128×128 each)
- Artist sprites: ~10-15 textures (64×64 each, all tiers × all frames)
- Distraction sprites: 4 textures (96×96 each)
- UI: atlas (512×512)
- FX: atlas (256×256)
- **Total: ~3-4MB GPU memory per festival** — very safe

### Asset Format
- Sprites: PNG with transparency (or WebP where supported)
- Spritesheets: TexturePacker format (JSON hash + atlas PNG)
- Audio: MP3 (broad compatibility) + OGG fallback
- Compressed textures (Basis/KTX2) for future optimization

---

## Responsive Layout

### Viewport
Game runs in portrait orientation. CSS enforced:

```css
html, body {
  margin: 0;
  overflow: hidden;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}
```

Viewport meta:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
```

### Coordinate System
The game uses a virtual coordinate system based on the map background dimensions. All gameplay logic operates in normalized coordinates (0-1). Rendering scales to the actual canvas size.

**Aspect ratio handling:** The map background is designed for a target aspect ratio (e.g., 9:16). On devices with different ratios, the map is scaled to fit width and either crops vertically (wider) or adds padding (narrower). Stages and spawn points are positioned so they remain visible in the safe area.

---

## State Persistence (Local Storage)

```ts
interface SaveData {
  version: number;
  festivals: Record<string, FestivalProgress>;
  settings: {
    soundEnabled: boolean;
    musicEnabled: boolean;
    quality: 'auto' | 'high' | 'low';
  };
}

interface FestivalProgress {
  currentLevel: number;           // furthest level unlocked
  levelScores: Record<number, number>; // best score per level
  cumulativeBestScore: number;    // best total across all levels
  completed: boolean;
}
```

Saved on: level completion, level failure, settings change.
Loaded on: app start.

---

## Admin Tool (Separate Application)

The map editor is a standalone web application (React or vanilla JS) that produces festival JSON config files.

### Features
1. **Canvas workspace:** Upload and display background image
2. **Stage placement:** Click to place, drag to reposition. Configure size, color, snap radius
3. **Spawn point placement:** Click on map edges. Set drift angle via drag
4. **Distraction placement:** Click to place. Set type, radius (visualized as circle), delay, activation level
5. **Artist sprite manager:** Upload sprite sheets, define animation frames, assign tiers
6. **Level curve editor:** Configure per-level parameters (artist count, timer range, spawn rate, active distractions)
7. **Validation:** Checks for minimum stage count, minimum spawn points, no overlapping stages, spawn points on edges, distraction radii not covering stages
8. **Preview mode:** Simulate artist spawning and drifting to verify map playability
9. **Export:** JSON config + asset manifest

### Output
- `festival-config.json` — full FestivalMap JSON
- `assets/` — directory with all referenced sprites and audio files
- `manifest.json` — PixiJS Assets manifest for bundle loading

---

## Testing Strategy

### Unit Tests
- Path smoothing: input raw points → output smooth spline
- Collision detection: artist proximity calculations
- Scoring: tier × stage × combo multiplier matrix
- Spawn system: respects maxSimultaneous and tier weights
- State machine: all transitions valid, no illegal states

### Integration Tests
- Full level playthrough simulation (scripted inputs)
- Memory leak detection: play 10 levels, verify no texture/object accumulation
- Asset loading/unloading: switch festivals, verify previous bundle freed

### Performance Tests
- Benchmark at peak complexity (4 artists, 4 paths, 4 distractions, particles)
- Frame time histogram on target devices
- Touch input latency measurement (touch → visual path update)

### Playtest Validation
See product spec playtest scenarios. Key metrics to capture:
- Average path draw time (touch-down to touch-up)
- Collision frequency per level
- Miss rate per level
- Score distribution per level
- Session length
