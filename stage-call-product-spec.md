# Stage Call — Product Specification

## Overview

**Stage Call** is a mobile-first path-drawing arcade game where the player acts as a festival stage manager, routing artists to stages before their set times expire. Artists enter the festival grounds moving in a default direction and will wander off unless the player draws a path redirecting them to a stage. The game is played entirely via touch — the only input is drawing paths.

**Platform:** Mobile web (browser-based, shareable via URL)
**Engine:** PixiJS v8
**Genre:** Path-drawing traffic management (Flight Control lineage)
**Session length:** 3-5 minutes per level, 15-30 minutes per festival completion

---

## Core Game Loop

```
SPAWN → DRIFT → DRAW → FOLLOW → ARRIVE → SCORE → REPEAT
```

1. **SPAWN:** An artist appears at an entry point on the map edge, already moving in a default drift direction
2. **DRIFT:** The artist walks steadily in their drift direction. They will cross the festival and exit (or collide with another artist) unless intercepted
3. **DRAW:** The player draws a freeform path starting from the artist. Path auto-smooths but follows player intent. Path endpoint snaps to nearby stage
4. **FOLLOW:** The artist redirects and follows the drawn path toward the stage. Other artists continue moving simultaneously
5. **ARRIVE:** Artist reaches stage. Short set performance (2-3 seconds stage occupied). Stage frees up
6. **SCORE:** Points awarded based on artist tier × stage size match. Combo multiplier if consecutive arrivals on same stage

The player manages multiple artists simultaneously. The game ends when 3 artists miss their sets (timer expires or they exit the map).

---

## Core Design Principles

### 1. One Verb, Infinite Decisions
The player only draws paths. All complexity emerges from when, where, and in what order they draw. No menus, no abilities, no secondary inputs.

### 2. Always Forgiving, Optionally Demanding
Any artist can go to any stage — the game never punishes a "wrong" match. But optimal scoring requires matching artist tiers to stage sizes. Beginners survive; experts optimize.

### 3. Festival Theme Is Mechanically Integral
Artist collisions (chatting), distractions (merch stands, food, fans), and stage-matching all reflect real festival dynamics. Removing the festival theme would break the core systems, not just reskin them.

### 4. Pressure From Movement, Not Timers Alone
The primary tension is that artists are already moving. The world doesn't wait while you plan. Timers create a deadline, but the spatial choreography of intercepting moving targets and preventing collisions is the real challenge.

### 5. Readable at a Glance
During peak chaos (3-4 artists, multiple distractions), the player must be able to read the entire board instantly. Every gameplay element communicates its state visually without requiring the player to study it.

---

## Game Structure

### Festival Selection
The player chooses a festival from the main menu. Each festival is a distinct map with unique visual theme, stage layouts, distraction placements, and artist sprites. Festivals are the primary content unit.

Examples: Gov Ball 2026, Coachella Fields, Glastonbury Pyramid, Lollapalooza Park

### Levels Within a Festival
Each festival has a fixed number of levels (suggested: 8-12). Each level uses the same map but increases difficulty through:

- More simultaneous artists
- Tighter timer ranges
- Introduction and accumulation of distractions
- Faster spawn rates
- More varied artist tiers

Levels are lightly randomized: spawn points, drift directions, artist tier distribution, and distraction activation vary between attempts of the same level. The map layout and stage positions remain fixed.

### Session Flow
- Player selects a festival
- Plays levels sequentially (Level 1, Level 2, ...)
- Each level: artists spawn in waves until the level's quota is met
- 3 missed sets at any level = level failed. Player can replay the level or quit
- Completing all levels = festival completed
- Cumulative score across all levels goes to the leaderboard
- Each level also has its own score for per-level competition

### Lives System
- 3 missed sets per level
- A "missed set" occurs when an artist's timer expires (regardless of position) or an artist exits the map boundaries
- Visual: 3 musical note icons in HUD; one disappears per miss
- On 3rd miss: level ends, score tallied, player prompted to replay or exit
- Lives reset at start of each level

---

## Artists

### Spawning & Drift
Artists spawn at designated entry points on the map edges. Each spawn event includes:
- **Entry position:** A point on the map boundary
- **Drift direction:** An angle determining where they walk if unguided
- **Drift speed:** Consistent across tiers (simplifies readability). Starting value: moderate walking pace that crosses the map in ~20 seconds if uninterrupted

Artists do NOT stop on their own. They walk in their drift direction until:
- The player draws a path (redirects them)
- They collide with another artist (chat delay)
- They enter a distraction proximity zone (delay)
- They exit the map (missed set)
- Their timer expires (missed set)

### Artist Tiers
Three tiers determine scoring potential. Visually distinguished by sprite size and border ring color.

| Tier | Visual Indicator | Description |
|------|-----------------|-------------|
| **Headliner** | Large sprite, gold ring | Festival's biggest draw. Worth most on large stage |
| **Mid-tier** | Medium sprite, silver ring | Established act. Sweet spot on medium stage |
| **Newcomer** | Small sprite, bronze ring | Up-and-coming. Best fit for intimate small stage |

### Artist Sprites
Each artist has a configurable sprite with 2-3 animation frames:
- **Walking:** 2-frame walk cycle (alternating legs/bob)
- **Idle/Chatting:** 1 frame (standing with speech indicators)
- **Performing:** 1 frame (on-stage pose, used during set)

Artists can be given display names (shown in small text above sprite) for festival-specific personality, but names have no gameplay function.

### Timer
Each artist has a visible countdown timer displayed as a small circular progress ring around their sprite. The ring depletes clockwise. Color shifts from green → yellow → red as time runs low.

Timer durations are variable per spawn event:
- **Generous:** 20-25 seconds (early levels, allows circuitous routing)
- **Standard:** 14-18 seconds (mid levels)
- **Tight:** 8-12 seconds (late levels, demands efficient paths)

Timer continues during chat delays and distraction delays. This is what makes collisions and distractions consequential — they eat into limited time.

---

## Stages

### Properties
Each festival map has 2-3 stages (configurable). Each stage has:
- **Position:** Fixed location on the map
- **Size category:** Large, Medium, or Small
- **Visual:** Unique sprite per festival (e.g., Gov Ball main stage vs. Glastonbury pyramid)
- **Snap radius:** Area around stage entrance where drawn paths auto-complete

### Stage Occupancy
When an artist arrives at a stage:
1. Artist snaps to stage position
2. "Performing" state activates (short animation — lights flash, crowd reacts)
3. Stage is occupied for 2-3 seconds (starting value: 2.5s)
4. After set completes: stage frees up, artist disappears, score awarded

During occupancy, the stage visually indicates it's in use (glow, activity). A path drawn to an occupied stage is still valid — the artist will arrive and queue briefly, then perform when the stage frees. This prevents frustrating "wasted path" moments but rewards players who time arrivals to avoid queuing.

### Scoring Matrix

| Artist Tier / Stage Size | Large Stage | Medium Stage | Small Stage |
|-------------------------|-------------|--------------|-------------|
| **Headliner** | 300 pts (3x) | 200 pts (2x) | 100 pts (1x) |
| **Mid-tier** | 100 pts (1x) | 300 pts (3x) | 200 pts (2x) |
| **Newcomer** | 50 pts (0.5x) | 100 pts (1x) | 300 pts (3x) |

Base point value: 100. Multipliers applied as shown. All values are starting values — test whether scoring differentials feel meaningful enough to influence decisions without making mismatches feel punishing.

### Combo System: "Keep the Stage Hot"
Consecutive artist arrivals at the same stage within a time window earn escalating combo multipliers.

| Chain Length | Multiplier | Window After Previous Set Ends |
|-------------|------------|-------------------------------|
| 1st arrival | 1.0x | — |
| 2nd consecutive | 1.5x | Within 5 seconds |
| 3rd consecutive | 2.0x | Within 5 seconds |
| 4th consecutive | 3.0x | Within 5 seconds |
| Chain breaks | Reset to 1.0x | Gap exceeds 5 seconds |

Starting value: 5-second combo window. Test: Can skilled players maintain a 3-chain once per level with deliberate routing? If chains never reach 3, widen to 7s. If 4-chains are routine, tighten to 4s.

Combo multiplier is applied ON TOP of the tier-matching multiplier. So a headliner on a large stage (300 pts) at a 3-chain (3.0x) = 900 points. This makes combo-chaining the primary high-score strategy.

Visual feedback: the stage's crowd grows and gets more animated with each combo step. Confetti/particles at 3+ chains.

---

## Obstacles

### 1. Artist Collision (Chat Delay)
When two artists come within proximity of each other (whether on drawn paths or drifting), they stop and chat.

- **Proximity trigger radius:** Starting value: 40px (normalized to map scale). Test: Do collisions feel avoidable with good routing? If collisions happen even on well-separated paths, reduce to 30px
- **Chat duration:** Starting value: 3 seconds. Test: Does a 3s delay create meaningful timer pressure roughly 30% of the time? Adjust ±1s as needed
- **Resolution:** Both artists resume their previous trajectory (drawn path or drift) after chatting
- **Visual:** Both stop. Speech bubble / musical notes appear between them. Both timers continue ticking
- **Player action:** No intervention available during chat. Prevention (good routing) is the only counter. Player CAN draw a new path for either artist during the chat — the new path takes effect when the chat ends

This is the core obstacle from Level 1 onward. It's emergent (created by player's own routing decisions or failure to redirect drifting artists), visually clear, and thematically authentic.

### 2. Map Distractions (Later Levels)
Static elements placed on the festival map that delay any artist entering their proximity zone.

| Distraction | Sprite | Delay | Appears At |
|-------------|--------|-------|-----------|
| Merch Stand | Tent with t-shirt icon | 2s | Level 4 |
| Burger Shack | Food cart | 2s | Level 4 |
| Paparazzi | Camera with flash | 3s | Level 6 |
| Fan Crowd | Group of small figures | 3s | Level 7 |

- **Proximity radius:** Visible as a faint circular indicator around each distraction
- **Behavior:** Artist entering the radius stops and is "pulled" to the distraction center for the delay duration, then resumes path
- **Visual:** Artist moves to distraction, contextual animation plays (browsing merch, eating, posing, signing autographs)
- **Player action:** Cannot intervene during delay. Can redraw path after delay ends. Prevention via routing around the distraction zone is the intended counter
- **Placement:** Fixed per map, but which distractions are active depends on level number (progressive introduction)

Distractions and artist collisions can compound: an artist delayed at a burger shack might then collide with another artist who was routed nearby. This emergent chaos is desirable at higher levels.

---

## Path Drawing

### Input Model
- Player touches the screen on or near an artist to begin drawing
- **Auto-detection radius:** Starting value: 40px around artist center. Path begins from the artist, not from the touch point
- Dragging traces the path. Real-time visual feedback as a colored line
- Path auto-smooths using Catmull-Rom spline interpolation (follows intent, removes jitter)
- Releasing the touch finalizes the path
- **Stage snap:** If path endpoint is within snap radius of a stage, path completes to stage entrance. Starting value: 60px

### Path Behaviors
- **Path color:** Matches the destination stage's color if snapped, otherwise white/grey for incomplete paths
- **Path replacement:** Drawing a new path from an artist who already has one replaces the old path. Artist transitions from current position to new path seamlessly
- **Invalid path:** Path not ending near any stage fades away after 0.5s. Artist continues previous trajectory. No penalty
- **ETA indicator:** While drawing, a small time estimate appears showing expected travel time along the drawn path. If ETA exceeds remaining timer, the estimate turns red (warning). This is the player's planning tool
- **Path persistence:** Drawn paths remain visible as faint lines until the artist completes them. Helps the player track active routes and predict collision points
- **Simultaneous drawing:** Only one path can be drawn at a time (single-touch). Other artists continue moving while the player draws

### Movement Along Paths
- Artists follow drawn paths at a consistent speed (same as drift speed)
- Speed does not change based on path curvature or length
- If an artist is delayed (chat or distraction), they resume from their current position along the remaining path

---

## UI / UX

### Screen Layout (Portrait Orientation)

```
┌─────────────────────────────────┐
│ Score: 2,450      ♪ ♪ ♪        │  ← HUD bar (minimal)
│                                 │
│                                 │
│                                 │
│        [FESTIVAL MAP]           │  ← Full gameplay area
│                                 │
│      Artists, stages,           │
│      paths, distractions        │
│                                 │
│                                 │
│                                 │
│                                 │
└─────────────────────────────────┘
```

### HUD Elements
- **Score:** Top-left. Running total with animated increment on each delivery
- **Lives:** Top-right. 3 musical note icons. One disappears (with brief animation) per missed set
- **Combo indicator:** Appears near the stage when a combo is active. Shows current multiplier (1.5x, 2x, 3x) with escalating visual intensity
- **Level indicator:** Small text, top-center. "Level 3 / 10" format

### Non-Gameplay Screens

**Main Menu:**
- Game title / logo
- Festival selection grid (each festival is a card with artwork, name, and progress indicator)
- Settings icon (sound toggle, quality toggle)

**Festival Detail:**
- Festival artwork / description
- Level progress bar (levels completed out of total)
- Best cumulative score
- "Play" button (starts next incomplete level or Level 1 if replaying)

**Level Complete:**
- Level score breakdown (artists delivered, tier matches, combos, time bonuses)
- Star rating (1-3 stars based on score thresholds)
- Cumulative festival score
- "Next Level" / "Replay" / "Menu" options

**Level Failed (3 misses):**
- Score earned before failure
- "Replay Level" / "Quit Festival" options
- Brief encouragement text

**Festival Complete:**
- Celebratory animation
- Final cumulative score
- Leaderboard position
- "Play Again" / "Choose Festival" options

**Leaderboard:**
- Per-festival leaderboards
- Shows cumulative scores
- Player's best attempt highlighted

### Visual Style
Vibrant, illustrative, slightly cartoonish. Top-down/isometric perspective. Each festival has a distinct color palette and visual identity but all share the same UI framework and interaction patterns. Think: if each festival were a poster, they'd all look different but feel like they're from the same brand.

### Audio
- **Background:** Festival-appropriate ambient music per map (changes with combo intensity)
- **Artist arrival:** Subtle chime/notification sound
- **Path drawing:** Soft swoosh following finger
- **Artist delivery:** Crowd cheer (scales with combo level)
- **Missed set:** Descending tone + crowd murmur
- **Chat collision:** Brief conversation babble
- **Distraction delay:** Context-appropriate sound (sizzling for burger, camera clicks for paparazzi)
- **Combo escalation:** Rising musical stinger on each chain step
- **Level complete:** Full crowd celebration
- **Level failed:** Sympathetic tone

---

## Difficulty Progression (Per Festival)

| Level | Stages | Max Simultaneous Artists | Timers | Distractions Active | Spawn Rate |
|-------|--------|------------------------|--------|--------------------|----|
| 1 | 2 | 1 | 20-25s | None | Slow (one at a time) |
| 2 | 2 | 2 | 18-22s | None | Slow-medium |
| 3 | 3 | 2 | 16-20s | None | Medium |
| 4 | 3 | 3 | 14-18s | 1-2 (merch/burger) | Medium |
| 5 | 3 | 3 | 14-18s | 1-2 | Medium-fast |
| 6 | 3 | 3 | 12-16s | 2-3 (+ paparazzi) | Fast |
| 7 | 3 | 4 | 12-16s | 3-4 (+ fan crowd) | Fast |
| 8 | 3 | 4 | 10-14s | 3-4 | Fast |
| 9 | 3 | 4 | 10-14s | All active | Very fast |
| 10 | 3 | 4 | 8-12s | All active | Very fast |

All values are starting values. Difficulty curve should be validated through playtesting with target: Level 1-3 completable by anyone, Level 4-6 require attention, Level 7-9 require skilled routing, Level 10 is a genuine challenge.

### Randomization Per Level Attempt
The following vary between attempts of the same level:
- Which spawn points are used per wave
- Drift directions per artist
- Artist tier distribution within constraints (e.g., Level 5 always has at least 1 headliner per wave, but exact mix varies)
- Which subset of possible distraction positions are active (from a larger set defined in the map)

The following are fixed per level:
- Map layout and stage positions
- Maximum number of active distractions
- Timer range
- Total number of artists to route (level quota)

---

## Leaderboard

- One leaderboard per festival
- Score = cumulative across all levels in a single festival run
- If a player fails a level and replays it, only the successful attempt's score counts
- Leaderboard displays: rank, player name, score, date
- Local storage for V1; server-backed leaderboard is a future enhancement

---

## Admin / Content Pipeline

### Map Configuration
Each festival is defined by a JSON configuration file plus associated art assets. An admin tool (separate web application) allows non-technical users to:

1. Upload a background image for the festival map
2. Place stages on the map (click to position, configure size category)
3. Place spawn points on map edges (click to position, set drift angle)
4. Place distraction positions (click to position, set type and radius, set activation level)
5. Upload artist sprites (with animation frame definitions)
6. Upload stage sprites
7. Upload distraction sprites
8. Configure level count and difficulty curve parameters
9. Export festival configuration as JSON + asset manifest
10. Preview the map with all elements placed

### Map Data Format
See Technical Specification for JSON schema. All positions are stored as normalized coordinates (0.0 to 1.0) so maps scale to any screen aspect ratio.

---

## Success Metrics

### Player Experience Targets
- Time to first successful delivery: <15 seconds from level start
- New player can complete Level 1-2 without instruction
- "Aha moment" (player deliberately routes around a distraction or prevents a collision): by Level 3-4
- Session completion rate for Level 1-5: >70%
- Festival completion rate: 20-30% (challenging but achievable)

### Technical Targets
- 60 FPS on mid-range mobile devices (2022+ iPhone SE / Galaxy A series)
- First interactive: <3 seconds on 4G connection
- Total asset bundle per festival: <5MB
- No frame drops during path drawing (most critical interaction)
