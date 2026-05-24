# Session Handoff — 2026-05-24

This doc snapshots where the Ultimate Stat Tracker app sits at the end of
the long 2026-05-24 session, so the next session can pick up cold.

## What this session delivered

The session covered a huge arc: Myall-feedback triage → design-code
delta audit → Competition layer scoping → docs resync → portrait
migration → Live Entry canvas-to-grid rewrite → strip select / copy /
paste / range-edit → pass-lane visual iteration → font + colour polish
→ configurable Passes recording option.

35+ commits since `f1fe6b0`. Full chronology in
[2026-05-24-build-log.md](2026-05-24-build-log.md) plus the per-commit
messages.

### Where Live Entry stands now

The Live Event Entry screen is a three-column grid:

```
┌──────────────────────────────┐
│  Header (back · score · …)   │
│  Mode strips (pick / etc)    │
│  LogPeek (last entry + UNDO) │
├─────────┬──┬─────────────────┤
│         │  │  Goal           │
│ Player  │P │  Throw Away     │
│         │a │  Blocked by …   │
│ buttons │s │  Intercepted by │
│         │s │  Receiver Error │
│ (7 rows)│  │  Stall          │
│         │La│  More           │
│         │ne│                 │
└─────────┴──┴─────────────────┘
```

- **PlayerColumn (left)** — one button per active-line player. Tap to
  record possession / pick in pick mode. Holder + puller get strong
  highlight (solid team colour + glow). Names render on two centred
  lines at the same font size, with `clamp()` auto-shrink.
- **PassLane (centre)** — thin 48 px lane. The configured number of
  recent passes (default 2; max 3) render as rounded right-angle paths
  in **white**, dashed/faded by age. Senders attach to the lower half
  of each row, receivers to the upper half, with per-arrow Y offsets
  `[16, 12, 8]` (oldest → newest) so revisits (A→B→A→B) never stack at
  the same Y. Arrowheads are swept-back feathered darts.
- **EventColumn (right)** — flat list of event buttons (no submenus),
  each in its event-specific colour (Goal green, Throw Away red,
  Blocked-by purple, Intercepted-by lighter purple, Receiver Error
  amber, Stall orange). Labels split on the first whitespace into two
  centred lines at matched font sizes. MORE at the bottom opens the
  sheet.
- **BottomSheet** — Log tab (vis log, tap to set/clear truncate cursor;
  no select / copy / paste / edit-range) and More tab (stoppages +
  manual half-time / end-game).

### Recording options surface

`RecordingOptions` (persisted per recorder, will move to Competition
layer when that lands):

| Field | Default | Notes |
|---|---|---|
| `passes` | `true` | Player-tap records possession. When off, taps are no-ops, no passes logged, lane shows 0 arrows. |
| `passArrowsShown` | `2` | Clamped 0–3. Nested under `passes` in Settings UI. |
| `pullBonus` | `true` | "Pull Distance Bonus" chip |
| `brick` | `true` | "Brick" chip |
| `stall` | `false` | "Stall" turnover button |
| `foul` | `false` | More-sheet button |
| `pick` | `false` | More-sheet button |
| `gameMode` | `'mixed'` | Mixed vs Open |
| `lineRatio` | `{ M: 4, F: 3 }` | Per-team target |

### Recording mechanics

- **Pass model** = a `possession` event in the log. A "pass" is two
  consecutive same-team possessions. Tap player = record possession.
- **Truncate-cursor rewind** = tap an event in the LogDrawer → cursor
  set → canvas state rewinds → recording a new event commits a
  `truncate` and writes from the rewound point. This is the only
  "go back in time" affordance; select/copy/paste/range-edit are gone.
- **Three pick modes**: `block-pick`, `intercept-pick`, `receiver-
  error-pick`. Entering one switches PlayerColumn to the appropriate
  team and dims ineligible players.
- **Auto-emit removed**: half-time / end-game now require recorder
  confirmation via a banner on Line Selection. Manual triggers also
  available from More.
- **Brick + Pull Bonus** are independently configurable per league
  (`recordingOptions.brick`, `recordingOptions.pullBonus`).

### Doc state

- Design docs (`requirements/*`, `design/*`) were resynced earlier in
  the session to match implementation reality, with later visual /
  layout changes intentionally NOT chased — the docs describe the
  shape, not the pixel-level CSS.
- `docs/requirements/competition.md` is the new first-cut Competition
  layer spec from the league-scoping pass. Not yet implemented.
- `docs/design/portrait-layout-proposal.md` flagged as implemented
  (current portrait app is built against it).

## What's outstanding / queued for the next session

The user has accumulated several requests that did NOT land in this
session and want pickup next time. From most recently queued:

1. **Inline single-event amend** — tap a single event in the log,
   change its player attribution, commit an `amend` event in place.
   Engine primitive already exists; UI does not.
2. **Engine cleanup of dead splice / clipboard code** — the
   `splice-block` event type, `validateSpliceBlock`, the entire
   `clipboard.ts` module, and the v12 migration's residue are no
   longer reachable from any UI path. Strip per the phase-cleanup
   policy:
   - `src/core/types.ts`: drop `SpliceBlockRawEvent` from `RawEvent`,
     drop `'splice-block'` from `RawEventType`.
   - `src/core/engine.ts`: drop `applySplice`, `validateSpliceBlock`,
     the `splice-block` case in `popLastVisible` / `applyAmend` / the
     splice handler in `resolveRawLog`.
   - Delete `src/core/clipboard.ts` and its tests entirely.
   - Bump `STORAGE_VERSION` → 13 with a migration that filters any
     `splice-block` events out of persisted rawLogs.
3. **Competition layer code** — entity, role system, settings cascade
   per `docs/requirements/competition.md`. Needs auth (A3) first.
4. **Game-roster mutation events on rawLog** — scorer-mutable per-game
   roster per `competition.md` L9c.
5. **`pre-portrait-snapshot` branch push** — local-only today; user
   can push when comfortable.
6. **wire-protocol.md** — could be patched further now that
   `splice-block` is officially deprecated.
7. **Re-enable AdminDrawer Half-Time / End-Game manual buttons** —
   confirmation flow has landed (banners on Line Selection), but the
   sheet's manual buttons may want a refresh.

## Tunnels / dev server

- Cloudflare quick tunnel was running at the time of this writing:
  `https://levy-impressed-tray-joint.trycloudflare.com` (background
  task `b9bah7cl9`). It will go away when the parent shell exits.
- Local dev: `http://localhost:5173/`.
- Vite dev server was started as background task `be0wzi50o`. Restart
  with `npm run dev` from `client/` next session.

## Build state

- `npx tsc -b` clean.
- `npx vitest run` — 86/86 passing.
- Storage version: v12 (post `reorder-line` strip; the `splice-block`
  strip wants a v13 bump when the engine cleanup happens).
- Latest commit: `58ea798` (Passes toggle).
- Pre-portrait snapshot branch: `pre-portrait-snapshot` (local only),
  sitting at `c065e1d` (the last landscape commit before the rewrite).

## Conventions established this session

- **Phase-cleanup policy** (locked into `CLAUDE.md`): at every phase
  boundary, ruthlessly strip legacy code / types / doc refs that the
  new phase makes redundant. No "kept for compat" cruft. Worked
  examples in commits `050a20b`, `654ae6b`, `98ad3bb`.
- **Long / short team-name display**: prefer the full name; when
  either team's name exceeds a threshold, both swap to the short
  form. Helper at `core/teams/shortName.ts` (`pickDisplayNames`).
- **Header standard**: every screen header is `h-16` (64 px), with
  primary action buttons at `size="md"` (44 px tall). Two-line title
  blocks on Game Setup / Teams Manager / Game Settings; single-line
  on screens with score (Line Selection / Live Entry).
- **Big icon buttons (44 px)**: `IconBtn` in `components/ui/Icons.tsx`
  with `TeamsIcon` and `SettingsIcon` exports. Used on Game Setup and
  Line Selection.
- **Memory of the cleanup policy**: stored as
  `feedback_phase_cleanup.md` in `MEMORY.md` index, persists across
  sessions.
