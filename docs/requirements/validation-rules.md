# Validation Rules
## Ultimate Stat Tracker

**Version:** 0.4 (resync with implementation)
**Last Updated:** 2026-05-24
**Status:** 🟡 In Progress

---

## Purpose

This document defines the sequence validation rules — what actions are valid after each game event. The UI only ever presents valid next actions based on current state, making invalid sequences structurally impossible. It is the single source of truth for "is this event allowed right now"; both the recording UI and the splice/paste validator consult the same `canRecord` predicate.

---

## Core Principle

> **Tapping a player is a possession transfer by default; opening the action rosette on a player surfaces non-default options.**
> A simple tap on a player records a `possession` event (the canonical event type — see "Vocabulary" below). Holding/expanding a player opens a chip rosette whose options depend on the current game phase: at point start, Pull / Pull Bonus / Brick; during play, Throwaway / Receiver Error / Defensive Block / Intercept / Goal (+ Stall when enabled).

### Vocabulary: Possession vs Pass

The canonical engine event is **`possession`** — meaning "this player now has the disc." A *pass* is the colloquial label for two consecutive same-team `possession` events; it is not a separate event type. The action of passing is assumed implicit in each successful possession transfer.

User-facing labels (event log entries, UI tooltips, pass-arrow overlays) may still use the word "pass" where it reads more naturally — the model says `possession`, the human-friendly label can say `pass`.

---

## Event Types

### Play events

| Event | Engine type | Attribution | Notes |
|---|---|---|---|
| **Point Start** | `point-start` | System (carries `lineA` + `lineB`) | Emitted when a line is confirmed; opens a new point. |
| **Pull** | `pull` | Puller (pulling team) | Standard pull — lands in playing field. |
| **Pull Bonus** | `pull-bonus` | Puller (pulling team) | Long pull beyond a configurable distance threshold (Parity: women's brick mark+, men's endzone). Configurable; considering rename to "Deep Pull". |
| **Brick** | `brick` | Puller (pulling team) | Pull lands out of bounds / fouls — receiving team starts at the brick mark. On by default; configurable per league. |
| **Possession** | `possession` | Tapped player | The canonical "this player now has the disc" event. Tapping a player records this directly. |
| **Throw Away** | `turnover-throw-away` | Previous disc holder (auto) | Rosette chip — no extra pick; attributed to prior holder. Possession flips. |
| **Stall** | `turnover-stall` | Previous disc holder (auto) | Rosette chip (when `recordingOptions.stall` enabled) — no extra pick; attributed to prior holder. Default off for Parity. |
| **Receiver Error** | `turnover-receiver-error` | Recorder picks the intended receiver | Rosette chip → enters **Receiver Error Pick** screen; thrower is ineligible. Tapping a possession-team player records the error; possession flips. |
| **Defensive Block** | `block` | Recorder picks the defender | Rosette chip → enters **Block Pick** screen; defending team shown. Tapping a defender records the block; possession flips. |
| **Intercept** | `intercept` | Recorder picks the defender | Rosette chip → enters **Intercept Pick** screen; defending team shown. Tapping a defender records the intercept; possession flips and the interceptor becomes disc holder immediately. |
| **Goal** | `goal` | Disc holder (auto) | Rosette chip — no extra pick; assist chain derived from the possession sequence. |

### Game-flow events

| Event | Engine type | Notes |
|---|---|---|
| **Injury Sub** | `injury-sub` | Carries `teamId` + full new `line` for that team. Diff against prior line is implicit (engine just adopts the new line). |
| **Half Time** | `half-time` | Currently auto-appended by the engine when total score reaches `halfTimeAt`. **Design direction:** app surfaces a confirmation prompt at threshold; recorder confirms. Manual trigger via AdminDrawer is also planned. |
| **End Game** | `end-game` | Currently auto-appended by the engine when either team reaches `scoreCapAt`. **Design direction:** confirmation prompt; recorder confirms. Manual trigger via AdminDrawer also planned. Marks the log as closed — no further play entries permitted. |

### Stoppage events (optional)

These are recorded when the relevant `recordingOptions` toggle is on. They do not change game state — they're metadata for downstream analysis.

| Event | Engine type | Config gate | Notes |
|---|---|---|---|
| **Timeout** | `timeout` | always available | A team-called timeout. No state change. |
| **Foul** | `foul` | `recordingOptions.foul` | A foul call during play. No state change. |
| **Pick** | `pick` | `recordingOptions.pick` | A pick violation (the foul). Distinct from "pick mode" (UI state). Naming collision flagged for future cleanup. |

### Structural / system events

These are part of the append-only model but don't appear in the visible event log. They are the mechanism for "editing" history without mutating the rawLog.

| Event | Engine type | Purpose |
|---|---|---|
| **System** | `system` | Annotations / provenance (e.g. "Pasted 4 events from #12–#15"). Appears in the visible log as a muted note. |
| **Undo** | `undo` | Display-time pop of the most recent non-structural visible entry. Engine state is recomputed from the resulting visible sequence. |
| **Amend** | `amend` | References a `targetEventId` and supplies a `replacement` event (or `null` to delete). Original target stays in the raw log; the visible log shows the replacement. |
| **Truncate** | `truncate` | Drops every visible entry with id > `truncateAfterId`. Used by the tap-to-truncate rewind to commit a "go back in time" cursor atomically with the next recording action. |
| **Splice-block** | `splice-block` | Structural insert / replace / delete over a contiguous id range, with inner events validated against the prefix state. The mechanism behind Copy/Paste and Edit-mode commits. |
| **Reorder-line** | (transient) | Per-device visual reorder of pills on the canvas. **Pending move out of `rawLog` into transient store state** — see [delta audit](../feedback/2026-05-24-design-code-delta.md) Q1. |

---

## Game phase machine

Phase names match the engine's `GamePhase` discriminator exactly.

```
pre-game ──(line confirmed → point-start)──▶ awaiting-pull
                                                  │
                          (pull / pull-bonus / brick)
                                                  ▼
                                              in-play ◀─┐
                                              │ │ │     │
                                  ┌───────────┘ │ │     │ (turnover / block / intercept)
                       (goal)     │   (possession)      │
                                  ▼             ▼       │
                              point-over    in-play ────┘
                                  │
                ┌─────────────────┤
                │                 │
        (half-time threshold,  (line confirmed → point-start)
         confirmation)            │
                ▼                 ▼
            half-time         awaiting-pull
                │
        (line confirmed → point-start)
                ▼
            awaiting-pull

(end-game from in-play or awaiting-pull → game-over; terminal)
```

---

## State transitions (canRecord)

The full guard table — anything not listed is disallowed in that phase.

| Phase | Allowed event types |
|---|---|
| **pre-game** | `point-start` |
| **awaiting-pull** | `pull`, `pull-bonus`, `brick`, `injury-sub`, `reorder-line`, `half-time`, `end-game`, `foul`, `pick`, `timeout`, `system`, `undo`, `amend`, `truncate` |
| **in-play** (disc holder = null) | `possession`, `block`, `intercept`, `injury-sub`, `reorder-line`, `half-time`, `end-game`, `foul`, `pick`, `timeout`, structural |
| **in-play** (disc holder set) | + `turnover-throw-away`, `turnover-receiver-error`, `turnover-stall`, `goal` |
| **point-over** | `point-start` (next line), structural |
| **half-time** | `point-start` (second-half line), structural |
| **game-over** | structural only |

Key derived rules:
- **Self-catch impossible.** A `possession` event for the player who is already disc holder is rejected by the UI (tapping the current holder is a no-op).
- **Turnovers/Goal require a disc holder.** They auto-attribute to whoever currently has the disc.
- **Pulls require a puller.** The UI's awaiting-pull phase selects the puller before exposing the Pull / Pull Bonus / Brick chips.

---

## First-possession gating

After any event that resets the disc-holder state (`pull`, `pull-bonus`, `brick`, any `turnover-*`, `block`), the next event on the receiving team must be a `possession` (someone picks up the disc). Until at least **one further possession** lands (i.e. a successful first pass), the following chips are disabled:

- **Goal** — can't score directly off a pickup; needs at least one completed pass first.
- **Receiver Error** — same logic; an error requires a prior thrower, which requires a prior pass.

This is enforced in the rosette UI by dimming and disabling those chips until the active team has 2+ consecutive `possession` events in the current run. (Reset on every fresh possession run for the team.)

---

## Pick-mode screens (transient UI states)

Three pick-mode screens, each driven by a transient `UiMode` value, not by a game-phase change:

| UiMode | Header label | Active team shown | On player tap | Cancel |
|---|---|---|---|---|
| `block-pick` | PICK BLOCKER FROM `<DEF>` | Defending team | Records `block` (defender id); possession flips. | Tap header strip "TAP TO CANCEL" or empty canvas |
| `intercept-pick` | PICK INTERCEPTOR FROM `<DEF>` | Defending team | Records `intercept` (defender id); possession flips and defender immediately becomes disc holder. | Same |
| `receiver-error-pick` | TAP PLAYER WHO HAD ERROR | Possession team (thrower ineligible) | Records `turnover-receiver-error` (intended receiver id); possession flips. | Same |

Pick modes are exited automatically on success or via cancel — game phase is unchanged during a pick mode (the engine state at the moment of entry is what's pickable from).

---

## Splice-block validation

A `splice-block` event encodes an insert / replace / delete on the resolved log. Validation is applied at write time; an invalid splice is rejected without touching the rawLog.

### Validity rules

A splice is valid iff:

1. **Anchor exists** — `afterEventId` matches a resolved entry in the current log.
2. **Each inner event canRecords** — walked sequentially against the prefix state at the anchor (using `canRecord` + `step`).
3. **Inner events are not structural** — no `undo` / `amend` / `truncate` / `splice-block` allowed inside a splice. (Structural-on-structural would corrupt resolution.)
4. **Identity coherence** on inner events:
   - `pull` / `pull-bonus` / `brick` — `teamId` matches the pulling team (= `otherTeam(possession)`).
   - `possession` — `teamId` matches current possession.
   - `turnover-*` / `goal` — current state must have a disc holder.
5. **Trailing edge canRecords** — when the splice replaces a removed range, the first resolved entry after the removed slice must itself be a legal continuation of the post-splice state, with the same identity-coherence checks applied to its event type.

A rejection surfaces as a banner ("Cannot paste — `<reason>`" or "Cannot commit edit — `<reason>`") and leaves the rawLog untouched.

### Why splice instead of in-place edit

The rawLog is **append-only and never mutated**. All "editing" operations (`undo`, `amend`, `truncate`, `splice-block`) are themselves new events appended in insertion order. The visible log is derived by walking the rawLog and applying these structural entries to a working list. Full audit trail is preserved by construction.

This replaces the older "amendment with target position" model — the implementation uses id-based references (`amend.targetEventId`, `splice-block.afterEventId`, `truncate.truncateAfterId`) rather than positional indices.

---

## Key integrity rules

1. **Active team only.** During play, only the team in possession is shown on the canvas. Pick modes flip the active team according to the pick-mode rules above.
2. **Throw Away / Stall / Goal** auto-attribute to the current disc holder — no pick screen.
3. **Receiver Error / Block / Intercept** each enter a dedicated pick screen (see Pick-mode screens). Receiver Error picks from the possession team; Block and Intercept pick from the defending team.
4. **Pull events at point start.** `pull`, `pull-bonus`, and `brick` are the only valid play events when phase is `awaiting-pull`. Pull Bonus and Brick are independently configurable per league; both default to on for Parity.
5. **No self-catch.** Tapping the current disc holder does not record a new `possession`.
6. **Possession-team-only visibility.** After a turnover / block / intercept, the canvas switches to the other team (now in possession); the previous team is hidden.
7. **Assist chain is derived.** Goal scorer, assist, and second assist are all derivable from the trailing `possession` events leading to the `goal` — no explicit entry needed.
8. **Append-only rawLog.** The raw log is never mutated. `undo`, `amend`, `truncate`, and `splice-block` are themselves events appended in insertion order; the visible log is compiled by walking the rawLog and applying them (see [Splice-block validation](#splice-block-validation)).
9. **First-possession gating** (Goal / Receiver Error disabled until at least one pass has been recorded in the current possession run — see [First-possession gating](#first-possession-gating)).
10. **Half Time / End Game** — surfaced as a **confirmation banner** on Line Selection when the score crosses the configured `halfTimeAt` or `scoreCapAt` threshold and the corresponding event is not already in the log. The recorder confirms (emits the event) or defers ("Not yet" — the banner re-fires after the next goal if conditions still apply). Manual triggers from the AdminDrawer are also available for time-based formats or to override the suggestion flow. At Half Time, possession goes to the team that did not start the game (opposite of the first pull).
11. **Half-time and score-cap thresholds** live on `GameConfig` per game today; the planned Competition layer will own defaults that cascade to games inside it (see `docs/feedback/2026-05-24-league-layer-scoping.md`).
12. **Pulling team derivation.** At game start, the recorder specifies which team pulls first — thereafter the pulling team is derived automatically from the event log.
13. **End Game closes the log.** No further play entries are permitted after `end-game` is recorded; only structural events (for editing history) are accepted.

---

## Substitutions

- **Between points:** Recorder updates the active line during line-selection; a new `point-start` event carries the agreed `lineA` / `lineB`.
- **Mid-point (injury only):** Recorder records an `injury-sub` event carrying the full new line for the affected team. The new player is eligible from that point forward.

---

## Open questions

- [x] ~~What is the exact bonus distance threshold for Pull Bonus?~~ Parity: gendered — women's brick mark+, men's endzone. Threshold is league-configurable.
- [x] ~~What is the name for Pull Bonus in league context?~~ Considering rename to "Deep Pull" (terminology only, no behavioural change).
- [x] ~~Do we track stall as a Throw Away subtype (description field) or silently?~~ **Configurable per league.** When Stall Out is enabled, it is a distinct event type attributed to the previous disc holder; when disabled, it is recorded silently as a thrower-throwaway. Parity default: **disabled** (stall-out recorded as Throw Away).
- [x] ~~Mixed division gender ratio — does the app enforce legal ratio on line selection?~~ **Guides but does not enforce.** When a ratio expectation is configured (league-level), the app surfaces an advisory warning if the selected line is off-ratio, but the recorder can always confirm and proceed — abnormal compositions (deliberate or otherwise) never break recording. Configurable per league; default for Parity is the standard mixed ratio with advisory on.
- [x] ~~How granular is the Receiver Error pick — does the recorder confirm possession flip explicitly?~~ Possession flips automatically on the pick — no separate confirm step.
- [x] ~~Is the half time score threshold always the same for all games in a league, or can it vary per game?~~ Per-game today (in `GameConfig`); Competition-layer policy decides cascade rules per the league scoping doc (`strict` / `default` / `none` per setting).
- [x] ~~How are mid-point injury substitutions recorded in the log format?~~ As an `injury-sub` event carrying the full new line for the affected team (engine reconstructs `activeLine` on derivation).
- [ ] Rename `pick` (the foul) to `pick-foul` or similar to avoid collision with "pick mode" UI state — defer until other event-type cleanups land.
