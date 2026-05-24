# Core Features
## Ultimate Stat Tracker

**Version:** 0.5 (resync with implementation)
**Last Updated:** 2026-05-24
**Status:** 🟡 In Progress

---

## F1 — Roster & Line Selection

### Roster sources

- **Team roster (durable, admin-managed)** — set up before a Competition / season via the **Teams Manager** screen. Owned by admins (per [league scoping](../feedback/2026-05-24-league-layer-scoping.md) L9b); scorers cannot edit it.
- **Game roster (per-game, scorer-mutable)** — seeded from the team roster at game creation. Scorers can add, remove, or edit players for *this game only* (handles game-day subs, unregistered fill-ins, name corrections). Game-roster changes do not flow back to the durable team roster.

> ⚠️ **Implementation status:** Team rosters exist today (`teamsLog`). Game roster mutation is a planned feature — see [league scoping L9c](../feedback/2026-05-24-league-layer-scoping.md).

### Line selection

- Before each point, the recorder selects which players are on the field for each team (up to the line size).
- Default line size: 7 (4 male-matching + 3 female-matching for mixed; configurable per Competition).
- Both teams always have equal player counts.
- Player names are colour-coded by gender as a visual indicator only.
- At game start, the recorder specifies which team pulls first. Thereafter the pulling team is derived automatically from the event log.
- If the selected line is off-ratio (mixed mode) or off-count (open mode), an advisory warning is shown — **the recorder can always confirm and proceed**. Ratios guide but never block.

### Unknown opposition player

Planned: a "?" placeholder roster slot for cases where the recorder is scoring an opposing team they don't know (per [Myall feedback #5](../feedback/2026-05-24-myall-responses.md)). The "?" lives in the line like any other player; events attach to it normally. Configurable per Competition.

---

## F2 — Event Entry

The recorder records events on a **canvas-based player surface**: pills (one per active player) sit in a physics-driven layout. Tap a pill to record a possession transfer; hold or expand a pill to open the **action rosette** of non-possession options.

### Core principle

> **Tap = possession. Open = action rosette.**
> The default action on a player tap is to record a `possession` event (that player now has the disc). The action rosette appears when a pill is opened and surfaces only the chips that are valid in the current game phase. Invalid actions are structurally absent.

### Canvas / player zone

- Shows only the team currently in possession (or, during a pick mode, the team being picked from — see F2c).
- Each player rendered as a circular pill; identity via profile photo (F10) with jersey-number / short-name fallbacks.
- Pills can be **dragged** to reorder positions on the canvas (a per-device visual preference, not persisted across devices).
- Active disc holder is visually distinct (thick border, filled background).

### Action rosette

The chip rosette opens around a pill when expanded. Chip set depends on phase:

**Awaiting pull (after the puller is selected):**

| Chip | Engine event | Behaviour |
|---|---|---|
| **Pull** | `pull` | Standard pull. Possession flips to the receiving team. |
| **Pull Bonus** | `pull-bonus` | Long pull beyond the configured threshold (Parity: gendered). Configurable; default on for Parity. |
| **Brick** | `brick` | Pull lands OB / fouls. Receiving team starts at the brick mark. Configurable; default on. |

No possession option here — pulls are the only valid play events at point start.

**In play:**

| Chip | Engine event | Behaviour |
|---|---|---|
| **Throwaway** | `turnover-throw-away` | Attributed to the current disc holder (no extra pick). Possession flips. |
| **Receiver Error** | `turnover-receiver-error` | Enters **Receiver Error Pick** screen — recorder taps the intended receiver from the possession team (thrower is ineligible). Possession flips on tap. |
| **Defensive Block** | `block` | Enters **Block Pick** screen — recorder taps the defender. Possession flips. |
| **Intercept** | `intercept` | Enters **Intercept Pick** screen — recorder taps the defender. Possession flips and the interceptor immediately becomes the disc holder. |
| **Goal** | `goal` | Attributed to the current disc holder. Closes the point. Assist chain derived from the trailing possession sequence. |
| **Stall** | `turnover-stall` | (Configurable — shown when `recordingOptions.stall` is on. Default off for Parity.) Attributed to the current disc holder. Possession flips. |

### F2c — Pick-mode screens

Three transient pick screens, each driven by a `UiMode` value. The header strip shows a context label and a "TAP TO CANCEL" affordance.

| Pick mode | Header label | Active team | On tap |
|---|---|---|---|
| `block-pick` | PICK BLOCKER FROM `<DEF>` | Defending team | Records `block`. Possession flips. |
| `intercept-pick` | PICK INTERCEPTOR FROM `<DEF>` | Defending team | Records `intercept`. Possession flips; defender becomes disc holder. |
| `receiver-error-pick` | TAP PLAYER WHO HAD ERROR | Possession team (thrower dimmed/ineligible) | Records `turnover-receiver-error`. Possession flips. |

### First-possession gating

Goal and Receiver Error chips are **disabled** until the active team has recorded at least one completed pass in the current possession run (i.e. at least 2 consecutive `possession` events for that team). This prevents recording a goal or receiver-error directly off a pull pickup, post-turnover pickup, or intercept-then-receive — there must be at least one pass first.

The gate resets every time the team gains a fresh possession run.

### Special-events affordances

Surfaced via the **AdminDrawer** (F12), not the rosette:

- Injury Sub — enters mid-point Line Selection for the affected team.
- Timeout — records a `timeout` event (no state change).
- Foul / Pick — records `foul` / `pick` events (configurable; off by default).
- Half Time / End Game — currently auto-emitted at thresholds; planned to surface as confirmation prompts (see F7).

---

## F3 — Live Event Log

Two representations of the log:

- **Raw log** — append-only, never mutated. Every event (including `undo` / `amend` / `truncate` / `splice-block`) is stored in insertion order. Single source of truth.
- **Visual log** — derived from the raw log by walking it and applying structural entries (see F4). This is what the recorder sees.

The visual log lives in the **LogDrawer** (F12) — a right-side rail that collapses to a thin strip and expands on tap.

Each visible entry is colour-coded by event type. Muted entries (`possession`, `system`, `point-start`) are dimmed since they're context rather than the main signal.

---

## F4 — Amend / Undo / Edit history

The rawLog is **append-only** — there are no in-place edits. Four structural event types provide the editing surface:

| Event | Purpose |
|---|---|
| `undo` | Display-time pop of the most recent non-structural entry. State is recomputed. |
| `amend` | Replace (or delete) a single visible entry by `targetEventId`. Original target stays in the rawLog. |
| `truncate` | Drop every visible entry with id > `truncateAfterId`. Used by the **truncate-cursor rewind**. |
| `splice-block` | Insert / replace / delete a contiguous id range, with inner events validated against the prefix state. Used by **Copy/Paste** and **Edit mode**. |

### F4a — Undo

Permanent **Undo** button (in the LogDrawer). Tapping appends an `undo` event; the visible log updates immediately by popping the most recent non-structural entry.

### F4b — Truncate-cursor rewind ("go back in time")

The natural way to fix a mistake without rewriting subsequent events:

1. **Long-press an event** in the LogDrawer → cursor is set to that event id.
2. The canvas + state derivation rewind to that point; entries past the cursor are greyed out.
3. **Record a new event** → a `truncate` event prepends to commit the rewind atomically, then the new event lands at the rewound point. Entries past the cursor are dropped from the visible log.
4. Or **cancel the preview** to return to live without changes.

This replaces the old "amendment with target position" model — references are id-based throughout.

### F4c — Copy / Paste

Slice events out of one game's log and paste into another (same game id only — copying across games is rejected).

1. **Selection mode** — long-press an event in the LogDrawer to enter; tap to toggle selection. Multi-select allowed (non-contiguous).
2. **Copy** — writes a UST envelope `{ gameId, fromEventId, toEventId, events }` to the system clipboard.
3. **Paste** — reads the envelope, validates as a `splice-block` against the current state (see [Splice-block validation](validation-rules.md#splice-block-validation)). On success, commits a wrapper + a `system` provenance entry ("Pasted N events from #X–#Y"). On failure, banner-rejects with the reason; the rawLog is untouched.

Paste lands at the truncate cursor if one is set, otherwise after the most recent event.

### F4d — Edit mode

Range-replace mechanism for larger corrections. Currently accessible from the GameOverBanner; planned to be accessible during a live game too (per [delta audit Q4](../feedback/2026-05-24-design-code-delta.md)).

1. **Begin edit** — snapshot the live session as baseline; clone for the draft. Recording controls operate on the draft via the activeSession router.
2. **Select range** — long-press an event to set the start; tap another to set the end. The draft session truncates to the start of the range.
3. **Re-record** — use normal recording controls (canvas, rosette, drawers) — events land in the draft.
4. **Done** — the fresh draft tail is built into a `splice-block`, validated against baseline, and committed if valid (with a `system` provenance entry). Cancel discards the draft.

---

## F5 — Substitutions

- **Between points:** Recorder updates the active line during line-selection; a new `point-start` event carries the agreed `lineA` / `lineB`.
- **Mid-point (injury only):** Recorder records an `injury-sub` event carrying the full new line for the affected team. The new player is eligible from that point forward.

---

## F6 — Live Session Sharing *(aspirational)*

> ⚠️ **Implementation status:** Currently client-only with localStorage persistence. No server, no real-time sync. This section describes the target architecture.

Target model:
- One active editor per session — only they can submit events.
- Others can join as live viewers — they see the event log update in real time.
- Editor role can be handed off mid-session (switch scorer).
- Editor can leave and rejoin at any time — full state is restored on reconnect.
- If the editor disconnects, viewer screens stay visible but stagnant until reconnect or handoff.

See [architecture.md](architecture.md) and [wire-protocol.md](../design/wire-protocol.md) for the planned session model and message format.

---

## F7 — Half Time & End Game suggestions

- When total score reaches `halfTimeAt` (or either team reaches `scoreCapAt`), the app surfaces a **confirmation banner** on Line Selection — "HALF-TIME SCORE REACHED — CALL HALF TIME?" or "SCORE CAP REACHED — END THE GAME?".
- Recorder choices:
  - **CALL HALF / END GAME** → emits the `half-time` / `end-game` event. For half-time, possession for the second half flips to the team that did not start the game.
  - **NOT YET** → defers. The banner re-fires after the next goal if the threshold still applies (so dismissal is just for this trip through Line Selection).
- **Manual triggers** in the AdminDrawer (Half Time, End Game) are also available — useful for time-based formats or to override the suggestion flow. `canRecord` permits these from `in-play` / `awaiting-pull` / `point-over` (and end-game also from `half-time`).
- Thresholds live on `GameConfig` per game today; the planned Competition layer will own defaults.

---

## F8 — Game Time

- The app records the actual wall-clock start time of the game (via event timestamps).
- No countdown timer, no enforced duration.
- Per-point duration is derivable from Pull → Goal timestamps (bonus feature; see [Myall responses #16](../feedback/2026-05-24-myall-responses.md)).

---

## F9 — Export

- Per-player and per-game stats are exportable in-app.
- Stats are clean and analysis-ready by design — invalid sequences are structurally impossible.
- **Current implementation:** Local export only (client-side from the rawLog). Server-authoritative copy is part of the F6 aspirational architecture.
- Export format: TBD.

---

## F10 — Player Profile Photos

Profile photos are critical for usability when the recorder does not know the players — particularly when scoring for both teams (Phase 1 default; see below).

### Display
- Each player is shown as a **circular profile photo**.
- Photos are displayed wherever players are listed: Line Selection, canvas pills, and the pick screens.

### Fallback hierarchy
If a photo is unavailable or fails to load, the display degrades gracefully in order:

1. **Jersey number** — displayed inside the circle in place of the photo.
2. **Short name** — circle removed; displays the player's configured unique short name. Short name preference order: nickname → first name + surname initial (e.g. "Ben D").

### Pre-game photo capture
- The recorder can take photos of players before the game starts.
- Especially important when scoring both teams, where the recorder may not know either roster.

### Scoring both teams
- Phase 1 records stats for **both teams** — a confirmed decision, not configurable.

### Photo management
- Photos are associated with player records (currently in `teamsLog`).
- Pre-game capture uploads to the server (when F6 lands) and is immediately available to all session participants.
- Photo association (which player a captured photo belongs to) is confirmed by the recorder at capture time.

---

## F11 — Drawers (AdminDrawer + LogDrawer)

The Live Entry screen is bracketed by two collapsible rails. Only one expanded at a time.

### AdminDrawer (left)

"Stoppages" rail with these controls:

- **Injury Sub** — enters mid-point Line Selection.
- **Timeout** — records `timeout`.
- **Foul** *(visible when `recordingOptions.foul` is on)* — records `foul`.
- **Pick** *(visible when `recordingOptions.pick` is on)* — records `pick`.
- **Half Time / End Game** — manual triggers (currently perma-disabled; planned to re-enable alongside the F7 confirmation prompt).
- **Pill size cycle** — per-device display preference (sm / md / lg) at the bottom.

### LogDrawer (right)

Event log rail:
- Vis log entries with color coding (per event type) and muted styling for context entries.
- **Undo** button.
- **Selection mode** — long-press to enter; tap to multi-select; Copy / Paste actions.
- **Cursor visualisation** — when the truncate cursor is set, entries past the cursor are greyed; the cursor entry itself is marked with ▶.

---

## F12 — Per-device display preferences

Local UI prefs — not synced across devices, not in the rawLog.

- **Swap sides** — flips which physical side of the screen each team renders on. Used when teams swap ends or the scorer walks around.
- **Pill size** — sm / md / lg cycle for thumb / screen comfort.
- **Pill reorder** — drag a pill on the canvas to a new slot for that team. (Currently logged as `reorder-line`; planned move to transient — see [delta audit Q1](../feedback/2026-05-24-design-code-delta.md).)
- **Drawer expansion state** — which drawer (if any) is open.

---

## Deferred Features

| Feature | Notes |
|---|---|
| Player stats view | Player filters their own stats from the log — Phase 2+ |
| Jersey numbers | Optional display enhancement — Phase 1 fallback within photo circle (see F10) |
| ABBA gender point tracking | Advisory: app suggests next point's gender ratio (e.g. 4M/3W vs 3M/4W) following the ABBA pattern. Requires starting-gender confirmation at game start. Advisory only, never enforced. Configurable per Competition. Phase 2+. |
| "?" unknown player slot | Roster slot for scoring opposing teams the recorder doesn't know. Per [Myall #5](../feedback/2026-05-24-myall-responses.md). Configurable per Competition. |
| Game roster (scorer-mutable) | Per-game player CRUD distinct from the durable team roster. Per [league scoping L9c](../feedback/2026-05-24-league-layer-scoping.md). |
| In-app stats (bonus, narrow scope) | Line-management stats (points-played per player) at Line Selection; end-of-point reconciliation glance. Per [Myall #15](../feedback/2026-05-24-myall-responses.md). |
| Field-location capture | Optional landscape mode for high-level teams that want spatial data per pass. Per [Myall #18](../feedback/2026-05-24-myall-responses.md). |
| Competition layer | Full settings cascade, role system (admin / scorer / viewer), Teams Manager scoped to Competition, etc. Per [league scoping](../feedback/2026-05-24-league-layer-scoping.md). |
