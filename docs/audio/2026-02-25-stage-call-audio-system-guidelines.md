# Stage Call Audio System Guidelines (Festival Poster Energy)

## 1) Audio Pillars
- Readability first: every SFX must communicate gameplay state in under 300 ms.
- Festival identity: music and SFX should feel like one world, not generic UI beeps.
- Escalation by progression: rounds should sound denser and brighter as pressure rises.
- No fatigue: avoid harsh highs, clipped transients, and excessive low-end on mobile speakers.

## 2) Progression Model (Narrative + Difficulty)
- Session 1 (Morning / Setup): relaxed optimism, lighter percussion, lower rhythmic density.
- Session 2 (Afternoon / Crowds Build): tighter groove, stronger transient definition, more motion.
- Session 3 (Evening / Headliner Peak): higher energy, wider stereo, more impact and tension.

Current runtime mapping:
- `bg_chill` for early levels.
- `bg_energy` for mid levels.
- `bg_peak` for late levels.

## 3) Event-to-Sound Intent
- Spawn: short welcoming ping; neutral-positive.
- Path draw: tactile glide confirming gesture start.
- Deliver: concise success punctuation.
- Deliver combo: elevated hero punctuation, brighter and bigger.
- Miss: informative loss cue, not punishing.
- Chat collision: social clutter cue; playful and brief.
- Distraction trigger: curious attention hijack cue.
- Timer warning: clear urgency pulse; repeat-safe.
- Level complete: compact fanfare with release.
- Level failed: controlled downward cadence with quick reset feel.

## 4) Mix Targets (Mobile-first)
- Master peak ceiling: -3 dBFS.
- Music bus: around -12 to -8 dBFS perceived.
- SFX bus: around -9 to -5 dBFS perceived.
- Hero cues (`deliver_combo`, `level_complete`): up to +1.5 dB over standard SFX.
- Use short fades (5-12 ms) on SFX to prevent clicks.

## 5) Voice/Polyphony Budget
- Mobile target: 16-24 active voices max.
- Priority (highest to lowest): timer warning, miss, deliver_combo, deliver, distraction/chat, spawn/path_draw.
- Cooldowns:
  - `timer_warning`: 250-350 ms.
  - hero cues: 700-900 ms.

## 6) Asset Requirements for Generation
- Music:
  - Instrumental only, no vocals or spoken words.
  - Seamless loop behavior (start/end compatible).
  - Keep arrangement stable; avoid huge one-off intros.
- SFX:
  - Mono-compatible and punchy on phone speakers.
  - Fast attack, controlled decay, minimal long tails.
  - Distinct spectral lanes to reduce masking.

## 7) Prompt Design Rules (ElevenLabs)
- Always specify: function, emotional role, style, duration, and hard constraints.
- For music prompts, include BPM band and loopability constraints.
- For SFX prompts, include envelope shape and “no clipping/no harshness” constraints.
- Avoid over-descriptive narrative text that can blur event specificity.

## 8) QA Checklist
- Cue differentiation test: blind A/B between miss vs distraction vs timer warning.
- Loop seam test: 3 consecutive loops should not reveal seam on headphones.
- Mobile speaker test: intelligibility at 40-60% device volume.
- Gameplay density test: 60+ sec high-action session without audio masking.
