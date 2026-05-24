# Product Requirements Document
## Ultimate Stat Tracker

**Version:** 0.5 (resync with implementation)
**Last Updated:** 2026-05-24
**Status:** 🟡 In Progress

---

## 1. Product overview

Ultimate Stat Tracker is a sideline stat-recording app for Ultimate Frisbee games. Designed to be fast, simple, and usable by anyone — regardless of age or technical ability. The app enforces validated, sequential stat entry to guarantee data integrity for downstream analysis.

The primary use case is **Parity League** — a format where per-player stats are recorded each game so that General Managers (team captains) trade players between teams under a salary cap, fantasy-league style. Stat integrity is critical: clean per-player data directly drives league decisions. The app is also designed to work for other ultimate communities (the Competition layer is generic; per [Myall feedback](../feedback/2026-05-24-myall-responses.md) the app is being shaped for reuse beyond Parity).

---

## 2. Problem statement

Existing Ultimate Frisbee stat apps are either too complex for casual sideline use, require too much manual input, or do not enforce valid event sequences — leading to dirty data. There is no app that combines simplicity, roster integration, and validated input in a single product built for a league-management context.

---

## 3. Goals

- Enable anyone on the sideline to record stats quickly and accurately.
- Enforce sequential validation — only offer the user actions that are legal given the current game state.
- Support roster management (today: in-app via Teams Manager; long-term: scoped under a Competition layer).
- Export clean, analysis-ready per-player data.
- Real-time multi-user stat recording via WebSockets — *target architecture; not yet implemented*.

---

## 4. Non-goals

- Enforcing score caps (the app records score, it does not stop the game).
- **In-app analytics or visualisation (export only)** — see *Bonus features* below for narrow carve-outs.
- Tournament / season **analytics** (per-game stats only; cross-game aggregation belongs in downstream tools).
- Spirit score *(noted for future consideration — deferred)*.
- Social sharing.

### Bonus features (non-core, opt-in)

These are explicitly *not* core scope but may be built if they materially aid the recorder. They do not change the app's primary purpose (clean log collection for downstream analysis).

- **Line-management stats** — e.g. points-played per player surfaced on Line Selection so the recorder can balance time on field ([Myall #15](../feedback/2026-05-24-myall-responses.md))
- **End-of-point reconciliation view** — a per-point stats glance aimed at catching scorer errors before more events are recorded (#15)
- **Point duration** — Pull-to-Goal time, derived from event timestamps; surfaced alongside the above (#16)
- **Field-location capture** — optional landscape mode for high-level teams that want spatial data (#18)
- **ABBA gender-point tracking** — advisory next-point ratio suggestion when configured (per A2)

---

## 5. Users

| User | Description |
|---|---|
| **Sideline Recorder / Scorer** | Records stats live during a game. Any age or skill level. Must not be a player currently on the field. Needs a fast, guided, low-error interface. |
| **Admin** | Owns a Competition. Manages teams, rosters, recording-options policy, and scorer/viewer roles. Single-device today (no auth); planned to be a real role once the Competition layer + auth lands. |
| **Viewer** *(planned)* | Has read-only access to a Competition via QR code. Default state for someone who scans without being elevated. See [league scoping L9b](../feedback/2026-05-24-league-layer-scoping.md). |

---

## 6. Confirmed decisions

### Platform & orientation
- **Platform:** Web app today (React + Vite). Native app TBD.
- **Orientation:** **Portrait-first** (revised 2026-05-24 per [Myall #1](../feedback/2026-05-24-myall-responses.md)). Portrait suits one-handed sideline use and large fixed-position action buttons. Landscape may return as a parallel mode for the bonus field-location capture (#18); it is not the default.
- **Portrait migration is pending** a snapshot git branch and a deliberate rework — current implementation is still landscape-style.

### Event model
- **Canonical event:** `possession` — tapping a player records it. A "pass" is the implicit transition between two consecutive same-team possessions; not a separate event type. (See validation-rules.md.)
- **Action rosette:** Opens around a pill on expand; surfaces only valid options for the current phase. Three pick-mode screens (Block, Intercept, Receiver Error).
- **First-possession gating:** Goal and Receiver Error chips disabled until at least one pass in the current possession run.
- **Stats tracked:** point-start, pull / pull-bonus / brick, possession (passes derived), turnover-throw-away / turnover-receiver-error / turnover-stall, block, intercept, goal, injury-sub, half-time, end-game. Optional: foul, pick, timeout.

### Game flow
- **Game time:** Records actual game start time (wall clock) — not a countdown or enforced timer.
- **Pulling team:** Derived from the event log after the first point. At game start, the recorder specifies which team pulls first — the only manual input for pulling team.
- **Half-time / score cap:** Per-game settings on `GameConfig` today (set in the New Game form). Planned to move to Competition with per-setting `{ strict / default / none }` policy. **Half-time and end-game are currently auto-emitted at threshold; design direction is a confirmation prompt before emit.**
- **End Game:** Marks the log as closed — no further play entries permitted.

### Roster model
- **Team roster (durable, admin-managed)** — set up via Teams Manager. Owned by admins (planned role enforcement); editable by them.
- **Game roster (per-game, scorer-mutable)** *(planned)* — seeded from team roster at game creation; scorer can add/remove/edit players for the specific game without touching the durable roster.
- **Both teams recorded:** Phase 1 records stats for both teams — confirmed decision, not configurable.

### Gender / line composition
- Players colour-coded by gender as a visual indicator only.
- **Ratio enforcement is advisory** — when configured, an off-ratio line shows a warning but can be confirmed. Configurable per Competition (long-term).

### Live session sharing *(target)*
- One persistent game session per game.
- One active editor at a time; others join as live viewers.
- Editor role can be handed off mid-session.
- Editor can leave and rejoin at any time — full state restored on reconnect.

### Persistence & sync
- Currently client-only with `localStorage` persistence. Offline-first by virtue of having no server.
- Target: WebSocket sync with offline queue (per [architecture.md](architecture.md)).

### Player profile photos
- Each player displayed as a circular profile photo (MS Teams style).
- Fallback hierarchy: jersey number in circle → short name without circle (nickname preferred; otherwise first name + surname initial).
- Pre-game photo capture supported in-app.

### Settings (Recording Options)
Per-recorder localStorage today; planned to move to Competition.
- `pullBonus` (default on for Parity)
- `brick` (planned — default on; per [delta audit Q3](../feedback/2026-05-24-design-code-delta.md))
- `foul`, `pick`, `stall` (default off)
- `gameMode`: `'mixed'` | `'open'` (default mixed)
- `lineRatio`: `{ M: number, F: number }` (default 4M / 3F)

---

## 7. Open Questions

- [ ] What specific per-player stats are needed for Parity League GM decisions?
- [x] ~~Do we track both teams' stats or just one?~~ Both teams — confirmed Phase 1.
- [ ] What is the exact export format required?
- [ ] What is the roster size range (min/max players per team)?
- [x] ~~How is multi-user conflict handled if two recorders submit simultaneously?~~ See [architecture.md](architecture.md) — deferred until multi-scorer exists; principles locked.
- [x] ~~Is there a league admin role above team admins for seeding rosters/teams?~~ Yes — see [league scoping L6 / L9b](../feedback/2026-05-24-league-layer-scoping.md). Competition Admin owns Competition settings and roster management; scorers and viewers are subordinate roles.
- [ ] Score-cap and half-time per-setting cascade policy at Competition level (strict / default / none) — to be set per Competition once the layer lands.

---

## 8. Related documents

| Document | Description |
|---|---|
| [architecture.md](architecture.md) | Current and target architecture — three logs today; WebSocket sync target |
| [sport-context.md](sport-context.md) | Ultimate Frisbee rules relevant to stat keeping |
| [features.md](features.md) | Core feature definitions |
| [validation-rules.md](validation-rules.md) | Sequence validation rules, pick-mode screens, splice validation |
| [user-stories.md](user-stories.md) | User stories by role |
| [screens.md](../design/screens.md) | Screen list & layouts |
| [screen-states.md](../design/screen-states.md) | Per-screen state breakdown |
| [wire-protocol.md](../design/wire-protocol.md) | Wire-format contract for client/server sync |
| [feedback/2026-05-24-myall-responses.md](../feedback/2026-05-24-myall-responses.md) | External feedback + decisions log |
| [feedback/2026-05-24-design-code-delta.md](../feedback/2026-05-24-design-code-delta.md) | Design ↔ code audit & triage |
| [feedback/2026-05-24-league-layer-scoping.md](../feedback/2026-05-24-league-layer-scoping.md) | Competition layer scoping |
