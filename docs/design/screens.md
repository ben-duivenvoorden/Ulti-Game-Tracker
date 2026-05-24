# Screens
## Ultimate Stat Tracker

**Version:** 0.4 (resync with implementation)
**Last Updated:** 2026-05-24
**Status:** 🟡 In Progress

---

## Device & orientation

- **Platform:** Web app today (React + Vite). Native app TBD.
- **Orientation:** **Portrait** is the primary design target (revised 2026-05-24, per [Myall #1](../feedback/2026-05-24-myall-responses.md)). Portrait suits one-handed sideline use and large fixed-position action buttons. The previous landscape-first design (with a left-to-right "field" metaphor) has been dropped.
- Landscape may return as a parallel mode for the bonus field-location feature ([Myall #18](../feedback/2026-05-24-myall-responses.md)) — not the default.

> ⚠️ **Portrait migration is pending.** The current implementation is still landscape-style. A snapshot git branch will be cut before the migration begins (per [delta audit Q7](../feedback/2026-05-24-design-code-delta.md)). The wireframe prompts at the bottom of this doc remain landscape-era and need regenerating once the portrait layout is settled.

---

## Screen list

| # | Screen | Purpose |
|---|---|---|
| 1 | **Game Setup** | Pick a scheduled game (or create a new one). Resume an in-progress game. Open Teams Manager or Game Settings. |
| 2 | **New Game form** | Inline form launched from "+ New Game" in Game Setup. |
| 3 | **Game Settings** | Recording options (per-recorder today; will move to Competition level). |
| 4 | **Teams Manager** | Team + player CRUD. |
| 5 | **Line Selection** | Pick active players per team for the upcoming point. Also handles mid-point injury subs. |
| 6 | **Live Event Entry** | The core scoring screen — canvas + drawers. |
| 7 | **Game Over** | Final score + edit log entry point. (Currently rendered within Live Event Entry as a banner overlay.) |

A future **Competitions Manager** + **Competition Detail** pair sits above Game Setup once the Competition layer lands ([league scoping L9](../feedback/2026-05-24-league-layer-scoping.md)).

---

## Screen 1 — Game Setup

Two-pane: left = scheduled-games list, right = detail / actions.

**Left pane (game list):**
- Header: "GAME SETUP / Select Game" + Recording Settings (⚙) + "Manage teams" link.
- First row: **+ New Game** — opens the New Game form inline in the right pane.
- One row per scheduled game with name, scheduled time, and a status chip: `LIVE` / `DONE` / `SCHED`.

**Right pane (detail):**
- For a scheduled game: name, teams, scheduled time, **Start** button (with pulling-team picker for fresh starts).
- For an in-progress game: live score + **Resume** button.
- For a finished game: final score + **Export** button.
- For a brand-new game: the inline New Game form (Screen 2).

---

## Screen 2 — New Game form

Inline form rendered in Game Setup's right pane.

Fields:
- Game name
- Scheduled time (defaults to "12:00")
- Team A picker (with **+ Create team** inline)
- Team B picker (with **+ Create team** inline)
- `halfTimeAt` stepper (default 8)
- `scoreCapAt` stepper (default 15)

Save returns to Game Setup with the new game selected.

---

## Screen 3 — Game Settings

Reached via the ⚙ icon in Game Setup. Two-column landscape grid:

**Game Mode & Line Composition:**
- Mode toggle: Mixed | Open
- Mixed: separate steppers for Male-matching and Female-matching counts (default 4M / 3F)
- Open: single stepper for total line size

**Events:**
- Pull Distance Bonus — toggle
- Brick — toggle (planned; per [delta audit Q3](../feedback/2026-05-24-design-code-delta.md))
- Foul — toggle
- Pick — toggle
- Stall — toggle

Settings are per-recorder today (localStorage). Planned to move to the Competition layer with `{ strict / default / none }` per-setting policy.

---

## Screen 4 — Teams Manager

Two-pane: left = team list, right = team detail with player CRUD.

**Left pane:**
- Header: "TEAMS MANAGER / Roster" + Done button.
- First row: **+ New Team**.
- One row per team (name, short code, colour swatch).

**Right pane:**
- Team header — name, short code, colour (all editable inline).
- **Players** list — each with name, gender (M/F toggle), jersey number, photo.
- Add / edit / remove player controls.
- Archive team button.

When the Competition layer lands, this screen becomes Competition-scoped (entered from a Competition Detail screen).

---

## Screen 5 — Line Selection

Two states: **between points** (full line pick) and **mid-point injury sub** (single-team line change).

**Common layout:**
- Header strip: back arrow + live score (matches Live Entry header).
- Title row: "LINE SELECTION" or "INJURY SUBSTITUTION — MID-POINT".
- **Manage teams** affordance (opens Teams Manager).
- **Confirm Line** button (top-right).

**Between points:**
- Two columns (one per team) showing the full roster.
- Recorder taps to toggle each player in/out.
- Line is seeded from the previous point's line, or from a default of first 4M + 3F at game start.
- If a line is off-ratio (mixed) or off-count (open), the Confirm Line button opens an "override?" prompt — recorder can always proceed.

**Mid-point injury sub:**
- Only the affected team is shown.
- Recorder swaps players in/out; new line takes effect from the next event.

Swap-sides toggle flips which side each team renders on (per-device).

---

## Screen 6 — Live Event Entry

The core scoring surface. Three-zone portrait layout (target) / three-zone landscape layout (current):

```
┌─────────────────────────────────────────┐
│ Header: back · score · pick strip       │
├──────┬───────────────────────────┬──────┤
│Admin │                           │ Log  │
│Drawer│         Canvas            │Drawer│
│      │   (pills + chips)         │      │
│      │                           │      │
└──────┴───────────────────────────┴──────┘
```

### Header

Top strip: back arrow · two team names · live score. A second strip below appears when a transient mode is active:

| Mode | Strip colour | Content |
|---|---|---|
| Pick mode | Warn (amber) | Pick context label + "TAP TO CANCEL" |
| Truncate-cursor preview | Warn | "VIEWING HISTORY · RECORD TO TRUNCATE FORWARD · TAP TO CANCEL" |
| Edit mode | Warn | "EDITING #N–#M" + DONE / CANCEL buttons |
| Notification banner | Success or warn | Copy/paste/edit-commit feedback |

The strips are mutually exclusive (entering pick mode clears the truncate cursor; edit mode supersedes both).

### Canvas (centre)

Physics-driven canvas hosting the active team's player pills.

- **Active team** = team in possession (in-play) / pulling team (awaiting-pull) / picked-from team (during pick mode).
- **Pills** — circular, identity via profile photo / jersey / short name.
- **Tap a pill** — records `possession` (or executes the pick-mode action). Tapping the current disc holder is a no-op.
- **Open a pill** — surfaces the chip rosette (see F2 in features.md). Chip set depends on phase.
- **Drag a pill** — reorders pills visually for that team (per-device).
- **Pass arrows** — curved arrows drawn behind pills showing the last N possessions in the current run (typically 2).
- **Disc holder** — visually distinct (thick border, filled background).
- **Ineligible pills** (e.g. the thrower during a Receiver Error Pick) — dimmed and untappable.

### AdminDrawer (left rail)

Collapses to a thin rail; expands on tap. See F11 in features.md.

Contents:
- Section header: "STOPPAGES"
- Injury Sub
- Timeout
- Foul (if `recordingOptions.foul`)
- Pick (if `recordingOptions.pick`)
- (Half Time / End Game — currently perma-disabled; planned to re-enable alongside the F7 confirmation prompt)
- Footer: pill-size cycle button (sm / md / lg)

### LogDrawer (right rail)

Collapses to a thin rail; expands on tap. See F11 in features.md.

Contents:
- Visual log entries, colour-coded by type.
- Undo button.
- Long-press → enter selection mode (multi-tap to add).
- Copy / Paste affordances when in selection mode.
- Truncate cursor visualisation (greyed entries past the cursor; ▶ on the cursor entry).
- Edit-range tinting when edit mode is active.

---

## Screen 7 — Game Over

Currently rendered as a banner overlay inside Live Entry once `gamePhase` is `game-over`.

Contents:
- "GAME OVER" label
- Final score (large, winner-team-coloured)
- "<winner> wins" sub-label
- **Back to games** button
- **Edit log** button (currently game-over-only; planned to also be available during live game)

---

## Wireframe prompts *(stale — landscape-era)*

> ⚠️ The prompts below were authored for the prior landscape design and a buttons-based player zone. They need regenerating against the canvas + chip rosette + drawer model and against portrait orientation. Retained here as historical reference only.

(Removed in this revision — see git history for the previous landscape wireframe prompts. New prompts will be added once the portrait layout is settled.)
