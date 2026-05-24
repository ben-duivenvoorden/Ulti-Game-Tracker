# Design ↔ Code Delta Audit

**Date:** 2026-05-24
**Scope:** Reconcile design docs (`docs/requirements/*`, `docs/design/*`) against the current implementation in `client/src/core/*` + `client/src/screens/*`.
**Trigger:** Implementation has iterated significantly while design docs lagged. User confirmed full re-sync exercise.

Per-item triage:
- **🟢 Update design** — code is correct; bring docs in line
- **🟡 Decide** — material new feature or model shift; user picks "update design" or "this was a bug"
- **🔴 Implementation gap** — code missing something the design genuinely requires
- **⏸ Defer** — known not-yet-built (server, league layer, etc.)

`game-states.md` is largely current and only needs minor tweaks — most drift sits in `features.md`, `validation-rules.md`, `screens.md`, `screen-states.md`, `architecture.md`, and `product-requirements.md`.

---

## A. Event types — design has ~9, code has 23

The code's `RawEventType` union is the canonical list. Design only describes the player-facing subset and misses both new game events and the entire structural/system layer.

### A1. Event types missing or wrongly described in design

| # | Code event | Design coverage | Triage |
|---|---|---|---|
| 1 | `point-start` | Implicit via "Line confirmed → PULLING". Not described as an event carrying `lineA` / `lineB`. | 🟢 Update — point-start IS an event in the log, carrying the agreed line-up. |
| 2 | `possession` | Design calls this "Pass". Same concept but the code's term is more general (also covers post-pull pickup, intercept-then-receive, post-turnover pickup). | 🟢 Update — rename "Pass" → "Possession" in event-type docs (or call out as alias). The user-facing concept is still "tap a player". |
| 3 | `brick` | Just added today | 🟢 Done |
| 4 | `turnover-stall` | Was an open question; resolved as configurable today. Not yet in event-type tables. | 🟢 Update event tables to include Stall. |
| 5 | `intercept` | Treated as a sub-mode of Defensive Block in design. Code has it as a distinct event type with its own pick screen. | 🟢 Update — Intercept is a separate event with its own pick mode (handled earlier today). |
| 6 | `timeout` | Listed in "Stoppages menu" in `game-states.md` but absent from the formal Event Types table in `validation-rules.md` and `features.md`. | 🟢 Update — add to event-type tables. |
| 7 | `foul` | Optional event (config-gated). Only mentioned as an aspirational TBD in design. | 🟢 Update — document as configurable event. |
| 8 | `pick` (the foul, not the screen pick) | Optional event (config-gated). Not in design. Naming collision with "pick mode" is real and worth flagging in any rename. | 🟢 Update — document as configurable event. Consider renaming in docs to "Pick Foul" to disambiguate from "pick mode". |
| 9 | `injury-sub` | Described as a "substitution event replacing one player". Code is broader — replaces the entire active line for a team. | 🟢 Update — clarify that an injury-sub carries the full new line (the engine diffs against prior line). |
| 10 | `reorder-line` | Not in design at all. | 🟡 Decide — purely visual reorder of pills (no roster change). Built but undocumented. Worth keeping? If yes → add to design. |
| 11 | `system` | Not in design. Used for provenance notes (e.g. "Pasted 4 events from #12–#15"). | 🟢 Update — document as system-generated annotation events. |
| 12 | `undo` | Design has Undo as a UI action; code makes it a first-class log entry. | 🟢 Update — Undo IS a log entry (append-only model). |
| 13 | `amend` | Described in F4 with "target position". Code's `amend` is `{ targetEventId, replacement }` — replaces a single event in-place by id, not by position. | 🟢 Update — `amend` is id-targeted, not position-targeted. |
| 14 | `truncate` | Not in design. Used by the tap-to-truncate rewind to drop everything after a cursor. | 🟢 Update — major feature, see Section C4 below. |
| 15 | `splice-block` | Not in design. The mechanism for copy/paste and edit-mode commits. | 🟢 Update — major feature, see Section C5 below. |

### A2. "Pass" vocabulary mismatch (worth a careful call)

Design says "tap a player = pass." Code emits a `possession` event. These describe the same gesture, but the rename matters because:

- A `possession` is recorded after a pull (the puller doesn't pass it — the receiver picks it up), after a turnover (pickup), after an interception (interceptor possesses it). None of those are "passes" colloquially.
- A *pass* in the formatted log shows as a `→` arrow between two `possession` events on the same team.

> **🟡 Decide:** Keep "Pass" as the user-facing label everywhere (and only the engine internals say "possession"), or align the design with the code's terminology? Cleaner long-term to align, but "pass" reads better in user-facing docs.

---

## B. UI screens — design has 3, code has 6 (plus a form)

| Screen (code) | Design coverage | Triage |
|---|---|---|
| `game-setup` | Covered (1a, 1b) | 🟢 Refresh — now includes a left-rail game list with status chips, a "+ New Game" entry, and a "Manage teams" link. Detail pane shows resume / continue / export. |
| `game-settings` | **Not in design.** Recording-options panel: gameMode (mixed/open), lineRatio (M/F counts), pullBonus toggle, foul toggle, pick toggle, stall toggle. | 🟢 Add — new screen. |
| `line-selection` | Covered (2a, 2b) | 🟢 Refresh — adds inline "Manage teams" affordance, gameMode-aware validation (mixed = ratio; open = total count), per-team ratio warning with confirm-anyway override, swap-sides toggle. |
| `live-entry` | Covered (3a–3h) but heavily out of date | 🟢 Full rewrite — see Section C below. |
| `teams-manager` | **Not in design.** Full team + player CRUD (add/edit/archive teams, add/edit/remove players). Reached from Game Setup or Line Selection. | 🟢 Add — new screen with its own state model. |
| New Game form | Not in design (overlaps Game Setup) | 🟢 Add — inline form launched from "+ New Game" row; sets name, scheduled time, teams A/B (with inline create-team), halfTimeAt, scoreCapAt. |

---

## C. Live Entry — major surface-area drift

The current `live-entry` screen is the largest source of design drift. Eight distinct concepts in code aren't in the design doc.

### C1. Canvas / Stage (replaces the "player zone" of the design)

- Players render as **physics-driven pills** on a canvas, not a list of buttons.
- Pills have slot positions but can be **dragged to reorder** within a team (commits as `reorder-line`).
- Tapping an opened pill **explodes** an **action rosette** of chips around it (180° hemisphere oriented away from canvas edges; legacy 360° fallback for centre pills).
- A **PassArrowLayer** draws curved arrows for the active possession run (last N possessions) on top of the pills.
- Only one team's pills shown at a time (the active team — possession team / pulling team / pick-screen target team).
- Pill size is user-cyclable (sm / md / lg).
- 🟢 Update screens.md "Player Zone" section to reflect canvas + chip rosette model.

### C2. Chip rosette (replaces the "explosion" of the design)

Chips available depend on phase:

| Phase | Chips |
|---|---|
| awaiting-pull | `pull`, `brick`, `pull-bonus` (if `recordingOptions.pullBonus`) |
| in-play | `tw` (throwaway), `rec` (receiver error), `goal`, `blk` (block), `int` (intercept), `st` (stall, if `recordingOptions.stall`) |

- 🟢 Update validation-rules + features F2 explosion tables to match exactly.
- 🟡 Decide: **Brick is currently always on** (no `recordingOptions.brick`). Earlier today we documented it as "on by default; configurable per league". Either add a config flag or update docs to say it's not configurable.

### C3. Pick modes — three distinct screens, not one

| Pick mode | Active team shown | Records | Cancel? |
|---|---|---|---|
| `block-pick` | Defending team | `block` (defender id) | Yes — header strip "TAP TO CANCEL" or background tap |
| `intercept-pick` | Defending team | `intercept` (defender id) | Yes |
| `receiver-error-pick` | Possession team | `turnover-receiver-error` (intended receiver id). **Thrower is ineligible** (shown dimmed; tap blocked) | Yes |

- 🟢 Already partially done in validation-rules. Need matching updates in screens.md / screen-states.md (a new 3-state pick layer replacing the single 3e). Add Cancel affordance to docs.

### C4. Truncate cursor (rewind & re-record)

This **is** how amending works in practice, despite F4 describing target-position-based amendments.

- The recorder long-presses an event in the log → cursor is set to that event id.
- The canvas + state derivation rewinds to the post-cursor state (greyed entries past the cursor in the log).
- Any new recording action **prepends a `truncate` event** (committing the rewind atomically) and the new event lands at the rewound point.
- Cancel the preview to return to live without touching the log.
- 🟢 Update F4 substantially. The "amendment with target position" model in F4 doesn't reflect implementation. Replace with the truncate-cursor + splice-block model.

### C5. Copy / paste / edit mode (splice-block)

Three closely-related flows, all built on `splice-block` events that wrap inner events and (optionally) a removal range.

| Flow | Trigger | Effect |
|---|---|---|
| **Copy slice** | Long-press an event → enter selection mode → multi-select → "Copy" | Writes a UST envelope (game id, event range, slice of events) to the system clipboard |
| **Paste** | Paste button (lands at truncate cursor or end of log) | Reads UST envelope → validates as `splice-block` (canRecord + identity coherence on each pasted event + trailing-edge check) → commits if valid, banner-rejects if not. Adds a `system` provenance entry. |
| **Edit mode** | "Edit log" button on the GameOverBanner (game-over only) | Snapshot baseline → operate on a draft (via `activeSession`) → select range to replace → record new events into draft → "Done" commits as a `splice-block` against baseline. Discard cancels. |

- 🟢 Add an entire new section to features.md (or replace F4) covering Copy / Paste / Edit.
- 🟡 Decide: Edit mode is currently **only available after game-over**. Design F4 implied any-time editing. Is post-game-only the locked design, or should it be available earlier? (Reasonable case for post-game-only: the live recorder shouldn't rewrite history mid-game; truncate-cursor handles "I just made a mistake".)

### C6. Drawers — AdminDrawer (left) + LogDrawer (right)

Both collapse to a thin rail; only one expanded at a time.

**AdminDrawer** — "Stoppages" rail:
- Injury Sub
- Timeout
- Foul (if `recordingOptions.foul`)
- Pick (if `recordingOptions.pick`)
- Half Time / End Game (perma-disabled — code TODO notes the post-goal flow auto-navigates to LineSelection so these can never be reached; engine still auto-emits half-time at threshold)
- Pill-size cycle button at the bottom

**LogDrawer** — event log rail:
- Vis log entries with color coding
- Long-press → enter selection mode (multi-tap to add)
- Copy / Paste affordances
- Undo button
- Cursor + edit-range visual states

🟢 Add a "Drawers" section to screens.md replacing the singular "Event button" concept from the design.

### C7. Auto half-time / auto end-game

- Engine auto-appends `half-time` when total score reaches `halfTimeAt`.
- Engine auto-appends `end-game` when either team reaches `scoreCapAt`.
- The manual buttons in AdminDrawer are **perma-disabled** because the post-goal auto-navigation to LineSelection makes them unreachable.

🟡 Decide:
- Design says "the app suggests Half Time and End Game to the recorder when the score is reached; the recorder confirms." → code is more aggressive (auto-emits, no confirmation prompt).
- Either: update design to match code (auto, no confirm) or implementation needs a confirmation step. User's earlier framing implied this was a deliberate decision — likely 🟢 update design.

### C8. First-possession gating

Goal and Receiver Error chips are disabled until the team has at least 2 consecutive `possession` events in the current run. Meaning: you cannot record a goal or receiver-error directly off a pull-pickup, a turnover-pickup, or a fresh intercept-then-receive — there must be at least one pass first.

🟢 Add to validation-rules as a Key Integrity Rule. This is genuine logic the docs don't describe.

### C9. swapSides / pillSize / preview-history strip

Per-device UI prefs — not on the wire, not persisted across devices.

- `swapSides`: flips which physical side of the screen each team renders on. Used when teams swap ends or scorer walks around.
- `pillSize`: sm / md / lg cycle.
- A header strip appears for pick mode, truncate preview, or edit mode (all warn-tinted, mutually exclusive, with cancel affordance).

🟢 Add to screens.md as "Per-device display preferences".

---

## D. Validation rules — code is richer than docs

Beyond what's already noted above:

| Rule (code) | Docs | Triage |
|---|---|---|
| `timeout` / `foul` / `pick` allowed in `in-play` or `awaiting-pull` | Not in validation table | 🟢 Add |
| `injury-sub` allowed in `in-play` or `awaiting-pull` | Implicit | 🟢 Add |
| `reorder-line` allowed except in `pre-game` / `game-over` | Not in docs | 🟢 Add (along with the event itself, A1 #10) |
| `half-time` / `end-game` allowed only in `in-play` / `awaiting-pull` | Implicit | 🟢 Add |
| **Splice validation:** each pasted event must canRecord through the prefix state; team-id coherence on pull/possession/turnover-with-holder events; trailing entry must canRecord against post-splice state | Not in docs | 🟢 Add as a sub-section "Splice validation" in validation-rules. |
| **First-possession gating** (C8) | Not in docs | 🟢 Add |

---

## E. RecordingOptions — undocumented config surface

```ts
RecordingOptions = {
  pullBonus: boolean        // default: true
  foul:      boolean        // default: false
  pick:      boolean        // default: false
  stall:     boolean        // default: false
  gameMode:  'mixed' | 'open'  // default: 'mixed'
  lineRatio: { M: number; F: number }  // default: { M: 4, F: 3 }
}
```

- Stored per-recorder (not per-game-config) — persisted via zustand.
- Configured via the Game Settings screen.
- 🟢 Add a "Recording options" section to product-requirements.md or features.md.
- 🟡 Decide: should `brick` be added as a configurable too? (See C2.) Currently always on.
- 🟡 Decide: long-term these belong at the tournament/league layer (per A1 discussion + earlier resolutions). Current per-recorder persistence is interim. Worth documenting as such.

---

## F. GameConfig — per-game settings (interim model)

GameConfig stores `halfTimeAt` (default 8) and `scoreCapAt` (default 15) as **per-game** numbers, set in the New Game form.

- Design previously asserted these are "league/tournament-level settings on the server". Code stores them per game with no league concept yet.
- 🟢 Update design — these are per-game today (configurable in the New Game form). League/tournament layer will eventually own the defaults but doesn't exist yet.

---

## G. Teams + scheduled games architecture

Two **additional** append-only event logs alongside `rawLog`:

- **`teamsLog`** — TeamEvents (`team-add`, `team-edit`, `team-archive`, `player-add`, `player-edit`, `player-remove`). Driven by `core/teams/*`. Replaces the design's "rosters are pre-configured on the server" assumption — rosters are managed in-app.
- **`scheduledGamesLog`** — ScheduledGameEvents (`game-add`, `game-edit`, `game-cancel`). Driven by `core/games/*`. The design's "select a pre-configured game" assumption now extends to "create a game inline from the New Game form too".

Both logs follow the same append-only pattern as `rawLog` with derived state via `deriveTeamsState` / `deriveScheduledGamesState`.

- 🟢 Major architecture update — document the three-log model. `architecture.md` currently describes a single rawLog over WebSockets to a server; reality is three client-side append-only logs persisted to localStorage.

---

## H. Server / client — current reality

Implementation is **entirely client-side**. No server exists. State is persisted via zustand's `persist` middleware to localStorage with a versioned migration chain (currently at v10, dropping pre-v5 sessions).

- `architecture.md` is aspirational, not descriptive. It describes a WebSocket protocol with a server that doesn't exist.
- 🟢 Reframe `architecture.md` as **target architecture** with a separate **current state** section: client-only, localStorage persistence, designed so a server can be added later (the WebSocket protocol slots in naturally because the rawLog model is already shaped for it).

Related:
- **Offline-first** (resolved earlier today) is currently *the only* mode — it's not "offline-first with online sync", it's offline-only with no sync target.
- **UST envelope format** — copy/paste serialises events as a JSON envelope `{ gameId, fromEventId, toEventId, events }`. Not documented in docs/design/wire-protocol.md.
- 🟢 Document the UST envelope format (it's the de facto sync unit even without a server).

---

## I. Field-orientation logic — mental-model gap

`screens.md` describes the field as left-to-right with the attacking team always on the left, ends flipping after each point. The implementation has **no field rendering** — pills sit in a physics-driven canvas with no field backdrop. The `attackLeft` derived state field exists but isn't used by the rendering layer.

🟡 Decide:
- (a) **Field-orientation logic is aspirational** and should be marked as such until/unless a field backdrop is added.
- (b) **Drop it from design** as no-longer-the-direction (the abstract canvas may be the better long-term call).
- (c) **Implementation gap** — add a field backdrop.

---

## J. Wire-protocol doc

I haven't read `docs/design/wire-protocol.md` yet — flagging as a known unknown. It may already cover the UST envelope and `splice-block` payload, or it may be as stale as architecture.md.

🟡 Decide: I'll read it as part of executing the design updates, but if you know it's already aligned/stale, save us a step.

---

## Recommended execution order

Once you've reviewed and triaged the items above, the cheapest order to apply updates is:

1. **Event types canonical list** (Section A) — most other docs reference these, so settle the vocabulary first. Includes "Pass" vs "Possession" decision (A2).
2. **Validation rules** (Section D + state transitions, Section A pick-mode rules) — these depend on the event-type list.
3. **Live Entry rewrite** (Section C) — biggest single change. Replaces most of `screens.md` Screen 3 and `screen-states.md` 3a–3h.
4. **New screens** (Section B) — Game Settings, Teams Manager, New Game.
5. **Architecture rewrite** (Section G + H) — three-log model, client-only current state, server-as-target.
6. **Product requirements** + **features** (Section E + F + tidy-ups) — fold in RecordingOptions, GameConfig per-game model.
7. **wire-protocol.md** review (Section J).

Estimated effort: a substantial editing pass. Realistic to split across several sessions — option 1 is to triage now, I draft each doc, you review per doc.

---

## Open triage questions for you

Quick yes/no/defer per item before I touch design files:

1. **A1 #10 reorder-line** — Keep as a documented event, or hide as an internal-only detail?
   > **Ben:** Device-only visual, no logging or syncing. Not of great importance. **This is an implementation change** — code currently writes `reorder-line` events into the rawLog (which is the sync unit), so this needs to be moved to transient per-device UI state instead. Once moved, drop from design docs entirely. Action: code change first, then design omission.
2. **A2 Pass vs Possession** — Align design with code's "possession", or keep "pass" as the user-facing label?
   > **Ben:** **Use "possession" globally** as the canonical event/model term. Conceptual principle: the *action* of passing is assumed implicit in each successful possession transfer — we don't model "pass" as a separate event. A pass is just the visual rendering (→ arrow) between two consecutive same-team possession events. Note this principle prominently in the event-type docs so the rationale is preserved. Caveat: "pass" language *can* still appear in user-facing UI surfaces where it reads naturally (e.g. heading the pass-arrow overlay "PASSES", tooltips) — the model is `possession`, the human-friendly label can be `pass`. Action: docs-only change (code already says `possession`); update F2 explosion language, validation-rules event table, and screen narrative.
3. **C2 Brick configurability** — Add `recordingOptions.brick`, or update docs to say always-on?
   > **Ben:** **Add the toggle** — both code and docs. New `recordingOptions.brick: boolean` (default `true`), surfaced in the Game Settings panel alongside Pull Distance Bonus / Foul / Pick / Stall, and threaded through the canvas chip builder as `brickShown` (mirroring `bonusShown` / `stallShown`). Earlier doc resolution stays correct ("on by default; configurable per league").
4. **C5 Edit mode** — Game-over-only is locked, or should it be available earlier too?
   > **Ben:** **Both edit mechanisms available anytime in game.** Truncate-cursor rewind is already anytime — no change. Edit-range (splice-block) mode is currently gated to the GameOverBanner; needs a code change to expose the "Edit log" entry point during a live game too (probably as an affordance on the LogDrawer or AdminDrawer). Design F4 documents both as anytime-available.
5. **C7 Auto half-time / end-game** — Auto-emit (current code) is the design, or should there be a confirmation prompt (current design)?
   > **Ben:** **Design wins** — app prompts at threshold, scorer confirms. Implementation change needed: `recordGoal` should no longer auto-append `half-time` / `end-game`; instead, when a goal lands the threshold, surface a confirmation prompt (banner / overlay) and let the recorder confirm or dismiss. As a follow-on, the AdminDrawer's currently-perma-disabled Half Time / End Game buttons should be re-enabled (they exist for manual triggering / time-based formats / overriding auto-trigger).
6. **E RecordingOptions persistence** — Per-recorder localStorage is the interim model until league layer; ok to document as such?
   > **Ben:** **Yes — document as interim.** Tournament / league layer hasn't been spec'd yet. A separate Q&A pass at the end of this triage will scope the league layer (tournament/league entity, what config it owns, how it cascades down to games, how recorders pick up defaults, etc.).
7. **I Field orientation** — Aspirational / drop / implementation gap?
   > **Ben:** **Drop for now** — the field-orientation logic in `screens.md` goes away. Larger context: we're committing to a portrait-first layout across the entire app (per Myall feedback #1), which is a substantial rework. **Pre-condition: snapshot the current landscape build to a dedicated git branch before starting the portrait migration**, so we have a clean rollback point if portrait turns out worse than expected. `attackLeft` derived state can stay for now (cheap to keep, may inform the portrait layout's "which team is at the top of the screen" decision); the elaborate left-to-right field metaphor in design just gets removed.
8. **J wire-protocol.md** — Want me to read it now or assume stale?
   > **Ben:** Confirmed read — partly stale but localised. Three concrete patches needed: (1) add `truncate` + `splice-block` to the structural-events enumeration; (2) remove `reorder-line` from "what goes on the wire" per Q1; (3) document the UST clipboard envelope format (currently only lives in `core/clipboard.ts`). Two-layer model, identifier scheme, append-only invariant, and server-authoritative conflict-resolution direction are all still accurate — no rewrite needed.
