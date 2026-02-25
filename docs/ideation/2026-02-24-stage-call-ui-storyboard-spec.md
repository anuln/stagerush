# Stage Call — UI Storyboard Spec (Full Round)
Date: 2026-02-24  
Status: Companion doc for review  
Scope: Ideation + production-direction (no implementation)
Companion to: `2026-02-24-stage-call-thematic-upgrade-blueprint.md`

## 1) Purpose
Define a production-ready storyboard for one full round that translates the thematic direction into concrete on-screen behavior.  
This document is the bridge between brand vision and build execution.

Primary objective:
- Preserve one-verb gameplay clarity.
- Raise emotional intensity like a live set (build, drop, release).
- Keep readability under pressure on mobile portrait screens.

---

## 2) Storyboard Principles
1. **Gameplay legibility first**  
UI must never obscure routing decisions.
2. **Music-structured pacing**  
The round should feel like a set progression.
3. **State is visible instantly**  
Score, crowd pressure, and time should be readable in under 500 ms glance.
4. **Festival identity is expressive, scaffold is stable**  
Each festival can look/sound different without changing interaction grammar.

---

## 3) Round Narrative Arc
Round arc language:
- **Intro:** “Open the gates”
- **Warm-up:** “Establish control”
- **Escalation:** “Crowd pressure rises”
- **Peak:** “Hit the combo run”
- **Resolve:** “Land or lose the set”

System mapping:
- Mechanics: spawn, drift, route, hazard, delivery, combo, timer.
- Dynamics: route tradeoffs, social friction, risk stacking.
- Aesthetics: authority -> tension -> euphoria (or collapse).

---

## 4) Storyboard Timeline (One Full Round)
## Beat 0 — Menu Ready (Pre-Round)
**Moment:** Player sees `Start Festival`.
**Visual:** Hero panel over map with lineup-poster energy.
**UI focus:** Primary CTA + run context.
**Motion:** Staggered card reveal, 250-350 ms.
**Audio:** Low-energy ambient bed, no percussive urgency yet.
**Success cue:** “I’m about to run the show.”

## Beat 1 — Start Trigger
**Moment:** Player taps start.
**Visual:** Overlay retracts upward; map breathes in.
**UI focus:** HUD strip fades in immediately.
**Motion:** Quick confidence move (no floaty easing), <= 300 ms.
**Audio:** Gate-open stinger + subtle crowd wake.
**Success cue:** Instant transition to control.

## Beat 2 — First Spawn Onboarding (No Tutorial Text Wall)
**Moment:** First artist enters.
**Visual:** Spawn-in cue from off-screen edge, directional intention clear.
**UI focus:** Brief micro-callout near artist (“Route me” equivalent style).
**Motion:** Artist pulse ring once, then normal drift.
**Audio:** Short spawn tick.
**Success cue:** Prompt action without stopping play.

## Beat 3 — Early Routing Flow
**Moment:** Player draws initial path.
**Visual:** “Inked” route trail with high contrast and subtle texture.
**UI focus:** ETA micro-indicator while drawing.
**Motion:** Path follows touch tightly, no lag, no decorative delay.
**Audio:** Soft draw swoosh + delivery ping on arrival.
**Success cue:** Cause/effect feels immediate and clean.

## Beat 4 — Pressure Build
**Moment:** 2-3 active artists + route crossing risk.
**Visual:** HUD pressure chip grows warmer in tone.
**UI focus:** Time-to-slot and crowd pressure chips become salient.
**Motion:** Lightweight urgency pulse only on meaningful thresholds.
**Audio:** Rhythm layer density increases.
**Success cue:** Controlled stress, still readable.

## Beat 5 — Hazard Contact
**Moment:** Chat/distraction event occurs.
**Visual:** Thought/speech bubble style interruption marker (social friction language).
**UI focus:** Local event indicator near incident, not full-screen alert.
**Motion:** 1 strong pop + settle (avoid prolonged float).
**Audio:** Contextual friction cue; timers remain sonically present.
**Success cue:** “I understand what happened and what it cost.”

## Beat 6 — Recovery Decision Window
**Moment:** Player reroutes after hazard delay.
**Visual:** Existing path de-emphasizes; new path takes visual priority.
**UI focus:** Remaining time reads as tactical urgency, not panic.
**Motion:** Re-route response immediate; no stutter.
**Audio:** Quick neutral confirmation cue.
**Success cue:** Skill expression through correction.

## Beat 7 — Combo Ignition
**Moment:** Consecutive same-stage deliveries begin.
**Visual:** Stage-local hype indicators rise (lights, badge, crowd density).
**UI focus:** Combo multiplier appears near stage and in HUD echo.
**Motion:** Escalation ladder with clear tier steps.
**Audio:** Distinct combo layer enters; each step adds energy.
**Success cue:** “I’m building momentum intentionally.”

## Beat 8 — Combo Peak
**Moment:** Highest chain tier in round.
**Visual:** Hero burst localized around scoring stage; map remains readable.
**UI focus:** Score surge + multiplier lock-in.
**Motion:** Single signature crescendo (not continuous fireworks).
**Audio:** Peak stinger + crowd lift.
**Success cue:** Euphoria payoff for mastery.

## Beat 9 — Final 10 Seconds
**Moment:** Round enters closing pressure.
**Visual:** Timer chip enters warning state; peripheral urgency rises.
**UI focus:** Only final-critical cues animate.
**Motion:** Minimal but unmistakable countdown tension.
**Audio:** Tight pulse bed, avoid fatigue.
**Success cue:** Urgency without visual overload.

## Beat 10A — Round Complete (Win Branch)
**Moment:** Timer ends / success state achieved.
**Visual:** Strong punctuation burst, then clean summary card.
**UI focus:** Attempt score, tier, run total.
**Motion:** Hero beat -> calm settle.
**Audio:** Celebration fanfare + crowd release.
**Success cue:** Competence and replay motivation.

## Beat 10B — Round Failed (Fail Branch)
**Moment:** Crowd pressure limit reached.
**Visual:** Warm failure tone shift, not harsh red punishment wall.
**UI focus:** What happened + immediate retry path.
**Motion:** Controlled deceleration.
**Audio:** Sympathetic drop cue.
**Success cue:** “I want one more try,” not frustration quit.

---

## 5) Portrait Layout Blueprint
## Spatial Zones
1. **Top strip (persistent telemetry):** score, pressure, time, level.
2. **Center field (gameplay priority):** artists, stages, paths, hazards.
3. **Upper-center transient lane:** combo and event callouts.
4. **Bottom safe margin:** leave finger room; avoid critical UI here.

## Readability Rules
- No persistent panel may cover stage entrances.
- Event callouts auto-expire quickly and never stack into clutter.
- Path color contrast must remain legible over all map variants.
- On small devices, reduce text before reducing state visibility.

---

## 6) Component Behavior Spec
## A) HUD Control Strip
Contents:
- `Set Score`
- `Crowd Pressure`
- `Time to Slot`
- `Level`

Behavior:
- Baseline: calm, compact.
- Warning state: color/intensity shift only for affected chip.
- Critical state: pulse frequency increases, no full-strip flashing.

## B) Stage Combo Beacon
Contents:
- Local multiplier marker + stage energy treatment.
Behavior:
- Escalates only on valid chain extension.
- Resets clearly when window breaks.

## C) Hazard Interruption Bubble
Contents:
- Context icon + concise label style.
Behavior:
- Appears at incident location, short-lived.
- Never pauses gameplay.

## D) End-of-Round Summary Card
Contents:
- Attempt score
- Performance tier
- Run total
- Next action (retry/next/menu)

Behavior:
- Entry: assertive but short.
- Decision buttons: large, thumb-safe, high contrast.

---

## 7) Motion + Audio Cue Sheet
## Motion Timing Bands
- Micro feedback: 80-180 ms
- Interaction transitions: 200-320 ms
- Hero moments: 350-600 ms max

## Audio Layering Bands
- Base bed (always contextual, low fatigue)
- Tactical cues (spawn, route, hazard, delivery)
- Momentum cues (combo ladder)
- Outcome punctuation (win/fail)

Hard rule:
- Never trigger multiple “hero” sounds at once; maintain hierarchy.

---

## 8) Festival Variation Hooks (Storyboard-Safe)
May vary by festival:
- Color pack + texture motif
- Accent typography for headers/cards
- Stage/distraction art language
- Audio instrumentation palette
- Flavor copy wrappers

Must remain constant:
- HUD information architecture
- Path readability logic
- Hazard readability grammar
- Round pacing beats and interaction semantics

---

## 9) Review Checklist (For Creative + Product + UX)
1. Can a first-time player identify actionable state in <5 seconds?
2. During peak chaos, can test users still route confidently?
3. Does combo escalation feel exciting and earned?
4. Does fail state preserve motivation to retry?
5. Do festival variants feel distinct without re-learning controls?
6. Is there any decorative element that obscures play-critical information?

---

## 10) Approval Gates Before UI Production
1. **Narrative gate:** Round arc approved (beats 0-10 win/fail).
2. **Readability gate:** Mobile stress screenshots pass review.
3. **Motion gate:** Timing ladder approved for micro/transition/hero cues.
4. **Audio gate:** Cue hierarchy approved (no fatigue overload).
5. **Variant gate:** At least one alternate festival theme validated against same storyboard.

This keeps execution expressive while protecting core play quality.
