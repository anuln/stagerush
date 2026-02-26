# Stage Rush Difficulty Progression Ledger

Last updated: 2026-02-26
Festival: `govball2026`

This is the master reference for progression tuning.  
Any change to session difficulty inputs must update this file in the same change set.

## Canonical Inputs

- `public/assets/maps/govball/config.json`
- `src/game/LevelProgression.ts`
- `src/systems/SpawnSystem.ts`
- `src/config/LevelConfig.ts`
- `src/config/GameConfig.ts`

## Global Runtime Rules

- Stages active each session: `3`
- Session duration: `60s`
- Max encounter strikes: `12`
- Spawn direction: inward cone (`+-30deg`) from edge spawn points
- Spawn budget cap: runtime `totalArtists` (includes timed-spawn budget expansion)

## Session Progression (Levels 1-9)

| Level | Day/Session | Spawn Budget Cap | Spawn Interval (ms) | Max Active Artists | Artist Timer (s) | Active Distractions |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | Day 1 Morning | 66 | 1455-2255 | 2 | 18.3-24.7 | 0 |
| 2 | Day 1 Afternoon | 74 | 1302-1951 | 2 | 17.6-23.7 | 0 |
| 3 | Day 1 Evening | 126 | 1083-1812 | 3 | 15.2-21.7 | 0 |
| 4 | Day 2 Morning | 120 | 1177-1844 | 3 | 14.5-19.4 | 2 |
| 5 | Day 2 Afternoon | 132 | 1092-1684 | 3 | 13.8-20.1 | 2 |
| 6 | Day 2 Evening | 188 | 942-1612 | 4 | 12.8-17.5 | 3 |
| 7 | Day 3 Morning | 192 | 821-1685 | 4 | 11.3-16.4 | 4 |
| 8 | Day 3 Afternoon | 208 | 860-1483 | 4 | 10.0-15.6 | 5 |
| 9 | Day 3 Evening | 285 | 771-1355 | 5 | 9.0-14.5 | 6 |

## Movement Speed by Artist Tier (px/s)

| Level | Overall | Headliner | Midtier | Newcomer |
| --- | ---: | ---: | ---: | ---: |
| 1 | 36.0-53.6 | 44.5-53.6 | 38.6-47.3 | 36.0-42.0 |
| 2 | 36.0-56.9 | 47.3-56.9 | 41.0-50.2 | 36.0-44.6 |
| 3 | 36.0-60.3 | 50.1-60.3 | 43.4-53.2 | 36.0-47.3 |
| 4 | 37.6-63.7 | 52.9-63.7 | 45.9-56.2 | 37.6-50.0 |
| 5 | 39.7-67.2 | 55.9-67.2 | 48.4-59.3 | 39.7-52.7 |
| 6 | 41.8-70.8 | 58.8-70.8 | 51.0-62.5 | 41.8-55.5 |
| 7 | 44.0-74.5 | 61.9-74.5 | 53.6-65.7 | 44.0-58.4 |
| 8 | 46.2-78.2 | 65.0-78.2 | 56.3-69.0 | 46.2-61.3 |
| 9 | 47.9-81.1 | 67.4-81.1 | 58.4-71.6 | 47.9-63.6 |

## Active Distraction IDs by Level

- L1: `[]`
- L2: `[]`
- L3: `[]`
- L4: `[merch1, burger1]`
- L5: `[merch1, burger1]`
- L6: `[merch1, burger1, paparazzi1]`
- L7: `[merch1, burger1, paparazzi1, fans1]`
- L8: `[merch1, burger1, paparazzi1, fans1, burger2]`
- L9: `[merch1, burger1, paparazzi1, fans1, burger2, merch2]`

## Update Protocol

When tuning progression, always update this ledger if any of these change:

- Level counts, targets, timers, spawn interval, max simultaneous
- Tier speed multipliers or drift/base speed math
- Distraction unlock or active set selection rules
- Session length or strike budget

