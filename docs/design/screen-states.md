# Screen States
## Ultimate Stat Tracker

**Version:** 0.3 (resync with implementation)
**Last Updated:** 2026-05-24
**Status:** 🟡 In Progress

State labels here use the engine's `GamePhase` discriminator where they map cleanly. Pick-mode states reflect the `UiMode` registry in `core/pickModes.ts`.

---

## Overview

| State | Screen | Phase / UiMode | Trigger |
|---|---|---|---|
| 1a | Game Setup — No Selection | — | App opened |
| 1b | Game Setup — Game Selected (scheduled / in-progress / finished) | — | Game row tapped |
| 1c | Game Setup — New Game form | — | "+ New Game" tapped |
| **3** | Game Settings | — | ⚙ tapped in Game Setup |
| **4** | Teams Manager | — | "Manage teams" tapped |
| 5a | Line Selection — Between Points | `pre-game` / `point-over` / `half-time` | Game start / point scored / half time |
| 5b | Line Selection — Injury Sub | `in-play` / `awaiting-pull` | Injury Sub tapped in AdminDrawer |
| 6a | Live Entry — Awaiting Puller | `awaiting-pull` (no puller selected) | Line confirmed → `point-start` recorded |
| 6b | Live Entry — Puller Selected | `awaiting-pull` (puller selected) | Puller pill tapped |
| 6c | Live Entry — In Play | `in-play` | Pull / Pull Bonus / Brick recorded |
| 6d | Live Entry — Block Pick | `in-play` + `UiMode = block-pick` | Block chip tapped |
| 6e | Live Entry — Intercept Pick | `in-play` + `UiMode = intercept-pick` | Intercept chip tapped |
| 6f | Live Entry — Receiver Error Pick | `in-play` + `UiMode = receiver-error-pick` | Receiver Error chip tapped |
| 6g | Live Entry — Truncate Preview | any (cursor set) | Long-press an event in the log |
| 6h | Live Entry — Edit Mode | any (editMode active) | "Edit log" button (currently game-over only) |
| 6i | Live Entry — Point Over | `point-over` | Goal scored — auto-advances to 5a (Line Selection) |
| 6j | Live Entry — Half Time | `half-time` | Threshold reached (confirmation prompt planned, F7) — auto-advances to 5a |
| 7 | Game Over | `game-over` | End-game event |

---

## Screen 1 — Game Setup

### 1a — No Game Selected
- **Left pane:** Game list (with status chips) + "+ New Game" + "Manage teams" link.
- **Right pane:** Empty / placeholder.

### 1b — Game Selected
Right pane shows the selected game with state-dependent CTA:
- `SCHED` → pulling-team picker + **Start** button → 5a Line Selection.
- `LIVE` → live score + **Resume** button → 6 Live Entry.
- `DONE` → final score + **Export** button.

### 1c — New Game Form
Right pane swapped for the inline New Game form. Save → 1b on the new game.

---

## Screen 3 — Game Settings

Single-screen panel with two sections (Game Mode & Line Composition / Events). Done button returns to Game Setup.

---

## Screen 4 — Teams Manager

Two-pane CRUD:
- Left: team list (with "+ New Team").
- Right: selected team's detail — name/short/colour fields, player roster with add/edit/remove, archive button.

Reached from Game Setup, Line Selection, or (future) a Competition Detail screen.

---

## Screen 5 — Line Selection

### 5a — Between Points
- Two-column roster (one per team); recorder toggles per player.
- Confirm Line button — opens override prompt if off-ratio/off-count.
- Swap-sides toggle.
- Manage teams affordance.

### 5b — Injury Sub
- Only the affected team's column shown.
- Title clarifies "INJURY SUBSTITUTION — MID-POINT".
- Confirm emits an `injury-sub` event with the new line.

---

## Screen 6 — Live Event Entry

All 6-prefix states share the same skeleton: header · AdminDrawer · canvas · LogDrawer. The state-specific differences are in the header strip and the canvas mode.

### 6a — Awaiting Puller
- **Canvas:** Pulling team's pills. No pill open. No chip rosette.
- **Holder:** None. **Puller:** None.
- **Drawers:** Both railed (collapsed). AdminDrawer's Half-Time / End-Game disabled (current implementation).
- **Transition:** Tap a pill → 6b.

### 6b — Puller Selected
- **Canvas:** Same pills, one shown as selected puller (glowing border).
- **Chip rosette** opens around the puller pill: **Pull**, **Pull Bonus** (if enabled), **Brick** (if enabled).
- **Transition:** Tap a rosette chip → record pull → 6c. Tap puller pill again to deselect.

### 6c — In Play (Pass Chain)
- **Canvas:** Possession team's pills.
- **Holder:** Whoever currently has the disc (thick border, filled bg). Null between events.
- **Tap a pill:** record `possession` (becomes new holder).
- **Open a pill:** rosette opens with **Throwaway**, **Receiver Error**, **Defensive Block**, **Intercept**, **Goal** (+ **Stall** if enabled). Some chips dim under [first-possession gating](../requirements/validation-rules.md#first-possession-gating).
- **Transitions:** Throwaway → 6c (other team). Block chip → 6d. Intercept chip → 6e. Receiver Error chip → 6f. Goal chip → 6i.

### 6d — Block Pick
- **Canvas:** Defending team's pills. Visually distinct background tint (block colour).
- **Header strip:** "PICK BLOCKER FROM `<DEF>` · TAP TO CANCEL".
- **Tap any pill:** record `block` (blocker id), possession flips → 6c.
- **Cancel:** tap header strip or empty canvas → 6c (unchanged).
- **Chip rosette:** disabled — direct pill tap is the action.

### 6e — Intercept Pick
- Identical pattern to 6d, with intercept colouring and "PICK INTERCEPTOR" label.
- **Tap any pill:** record `intercept` (interceptor id); possession flips and interceptor becomes disc holder → 6c.

### 6f — Receiver Error Pick
- **Canvas:** Possession team's pills (still the throwing team — possession hasn't flipped yet). Receiver Error background tint.
- **Header strip:** "TAP PLAYER WHO HAD ERROR · TAP TO CANCEL".
- **Thrower pill** is dimmed and untappable (`ineligibleIds`).
- **Tap any other pill:** record `turnover-receiver-error` (intended receiver id); possession flips → 6c.

### 6g — Truncate Preview
- Cursor set on an event in the log. The canvas reflects state *at that cursor* (greyed entries past it in the log; ▶ marker on the cursor entry).
- **Header strip:** "VIEWING HISTORY · RECORD TO TRUNCATE FORWARD · TAP TO CANCEL".
- **Recording any new event** prepends a `truncate` and commits the rewind atomically.
- **Cancel** returns to live.

### 6h — Edit Mode
- Snapshot baseline + draft session. Recording controls operate on the draft.
- **Header strip:** "EDIT MODE — select range to replace" / "EDITING #N–#M" + DONE / CANCEL.
- Long-press an event to set the range; recording continues from that point in the draft.
- **DONE** → validate and commit as `splice-block`.

### 6i — Point Over
- Phase = `point-over`. Auto-advances to 5a Line Selection (no manual confirmation needed). The point-over phase itself is brief — not really a stable user-visible state.

### 6j — Half Time
- Phase = `half-time`. Currently auto-emitted on threshold; will gain a confirmation prompt (F7).
- Auto-advances to 5a Line Selection for the second half.

---

## Screen 7 — Game Over

Banner overlay inside Live Entry once phase = `game-over`:
- "GAME OVER" + final score + winner.
- **Back to games** button → 1a.
- **Edit log** button → 6h.

The LogDrawer remains accessible for inspecting / copying events.

---

## Open Questions

- [ ] Should 6g (Truncate Preview) and 6h (Edit Mode) be combinable, or strictly mutually exclusive? (Today they're mutually exclusive — entering edit mode clears the cursor.)
- [ ] Layout of pick-strip vs notification banner when both want to be present at once.
- [ ] Mobile portrait re-layout: drawers stay as side rails, or become bottom-sheet style?
