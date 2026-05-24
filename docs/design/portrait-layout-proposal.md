# Portrait Layout Proposal
## Ultimate Stat Tracker

**Version:** 0.1 (initial draft)
**Last Updated:** 2026-05-24
**Status:** 🟡 Draft for review — not yet implemented
**Source:** [Myall #1](../feedback/2026-05-24-myall-responses.md), [delta audit Q1 + Q7](../feedback/2026-05-24-design-code-delta.md)
**Replaces:** the landscape-era wireframe prompts removed from [screens.md](screens.md)

---

## Goals & constraints

- **Phone-first, portrait-locked.** Tablet works as a side-effect of responsive scaling, but the primary target is a phone held one-handed on the sideline.
- **Eyes-off recording.** The recorder watches the field, not the screen. Critical action buttons sit in fixed positions at the bottom edge where the thumb finds them by feel.
- **Pass is the default tap.** Tapping a player pill records a `possession`. Non-default actions (turnover, block, goal, etc.) live in the fixed action zone — not behind an explosion menu.
- **Drop the field-orientation metaphor.** The screen no longer represents a left-to-right field. `attackLeft` derived state stays in the engine but the UI doesn't try to render direction.
- **Drawers become bottom sheets.** The landscape side-rails (AdminDrawer, LogDrawer) are gone. Their content moves into a bottom-anchored sheet with two tabs: **Log** and **More**.
- **State-aware action zone.** The fixed buttons change set based on phase (awaiting-pull / in-play) and mode (pick / preview / edit), but the *position* and *shape* of each slot is consistent so the thumb hits the right button.

### Form-factor assumptions

| Spec | Value |
|---|---|
| Reference width | 390pt (iPhone-ish); must work at 360pt |
| Reference height | 844pt; must work at 700pt |
| Minimum tap target | 44×44pt |
| Top safe area | ~50pt (notch / status bar) |
| Bottom safe area | ~34pt (home indicator) |

---

## Common patterns

### Header strip (all screens)

Fixed-height (~48pt) bar at top:

```
┌─────────────────────────────┐
│  ←   Screen Title    [CTA]  │
└─────────────────────────────┘
```

- Left: back arrow (or close × for modals).
- Centre: title or live score (Live Entry / Line Selection).
- Right: primary CTA when one fits — Save / Done / Confirm / settings ⚙.

### Suggestion / mode strip

When a transient banner is active (pick mode header, truncate-cursor preview, edit-mode header, half-time / end-game suggestion, notification feedback), a second strip stacks below the header. Mutually exclusive — only one strip at a time. Warn-tint (amber bg) is the default colour.

### Bottom sheet (Live Entry only)

A thin strip at the bottom of the canvas region — above the fixed action zone — showing the last log entry in muted text. Tap to expand into a half-height sheet with tabs:

- **Log** — full visual log, with Undo / Copy / Paste / Edit-range affordances.
- **More** — stoppages (Injury Sub, Timeout, Foul, Pick) + Half Time / End Game manual triggers + pill size cycle.

Tap outside to dismiss. Swipe up / down to resize. The sheet overlays the canvas; it does not push the canvas up.

### Modal navigation

For full-screen secondary surfaces (New Game form, Game Settings, Teams Manager, Edit Player), use a push-style transition with a clear back arrow in the header. No tabs except where genuinely needed.

---

## Screen-by-screen mockups

### Screen 1 — Game Setup

Top-level entry. Scrollable list of scheduled games with status chips. Floating action button (FAB) at bottom-right for "+ New Game".

```
┌─────────────────────────────┐
│  ⚙                  Games   │  Header (settings ⚙ on left)
├─────────────────────────────┤
│  Manage teams →             │  Secondary nav row
├─────────────────────────────┤
│  Empire vs Breeze    SCHED  │  Card
│  Sat 12:00                  │
│  [           Start        ] │  Inline CTA
├─────────────────────────────┤
│  Lizards vs Goose    LIVE   │  Card (in-progress)
│  Sat 14:00 · 5–4            │
│  [          Resume        ] │
├─────────────────────────────┤
│  Eagles vs Hawks     DONE   │  Card (completed)
│  Fri 18:00 · 15–11          │
│  [          Export        ] │
│                             │
│        scroll …             │
│                       ┌───┐ │
│                       │ + │ │  FAB: New Game
└───────────────────────└───┘─┘
```

**State variants:** Empty (no scheduled games) shows a centred "+ New Game" prompt instead of the FAB.

### Screen 2 — New Game form

Push from "+ New Game". Vertical stack of inputs. Save / Cancel in the header.

```
┌─────────────────────────────┐
│  ←     New Game     [Save]  │  Header
├─────────────────────────────┤
│  Game name                  │
│  ┌─────────────────────────┐│
│  │ Round 5 — Empire v ...  ││
│  └─────────────────────────┘│
│                             │
│  Scheduled time             │
│  ┌─────────────────────────┐│
│  │ 12:00                ▾  ││
│  └─────────────────────────┘│
│                             │
│  Team A                     │
│  ┌─────────────────────────┐│
│  │ Pick team or + new   ▾  ││
│  └─────────────────────────┘│
│                             │
│  Team B                     │
│  ┌─────────────────────────┐│
│  │ Pick team or + new   ▾  ││
│  └─────────────────────────┘│
│                             │
│  Half-time at               │
│  [ − ]    8    [ + ]        │
│                             │
│  Score cap                  │
│  [ − ]   15    [ + ]        │
└─────────────────────────────┘
```

### Screen 3 — Game Settings

Compact single-column layout. Each section a card.

```
┌─────────────────────────────┐
│  ←   Recording      [Done]  │
├─────────────────────────────┤
│  ─ GAME MODE                │
│  [ Mixed ] [ Open ]         │
│                             │
│  Male-matching              │
│  [ − ]    4    [ + ]        │
│                             │
│  Female-matching            │
│  [ − ]    3    [ + ]        │
├─────────────────────────────┤
│  ─ EVENTS                   │
│  ● Pull Distance Bonus      │  toggle on
│  ● Brick                    │
│  ○ Foul                     │  toggle off
│  ○ Pick                     │
│  ○ Stall                    │
└─────────────────────────────┘
```

> Long-term, when the Competition layer lands, this screen becomes mostly read-only with override-where-policy-allows controls.

### Screen 4 — Teams Manager

Two stacked views with push navigation.

**4a — Team list:**

```
┌─────────────────────────────┐
│  ←     Teams         [ + ]  │  + for new team
├─────────────────────────────┤
│  ● Lizards            (8)   │  colour swatch · count
│  ● Goose              (7)   │
│  ● Empire            (12)   │
│  ● Breeze            (10)   │
│  ...                        │
└─────────────────────────────┘
```

**4b — Team detail (pushed):**

```
┌─────────────────────────────┐
│  ←   Lizards     [Archive]  │
├─────────────────────────────┤
│  Name   [ Lizards         ] │
│  Short  [ LIZ ]    ● color  │
├─────────────────────────────┤
│  PLAYERS (8)        [+ Add] │
│                             │
│  📷 Marcus      M  #7    ✏️ │
│  📷 Daisy       F  #12   ✏️ │
│  📷 Joe         M  #3    ✏️ │
│   …                         │
└─────────────────────────────┘
```

**4c — Player edit (pushed from row tap):**

```
┌─────────────────────────────┐
│  ←   Edit Player    [Save]  │
├─────────────────────────────┤
│  Name    [ Marcus           ]│
│  Gender  [ M ]  [ F ]        │
│  Jersey  [ 7 ]               │
│  Photo   📷 [ Change ]       │
│                             │
│  [          Remove        ] │  destructive
└─────────────────────────────┘
```

### Screen 5 — Line Selection

The landscape side-by-side two-team layout doesn't translate. Switching to a **per-team tab** approach.

```
┌─────────────────────────────┐
│  ←  Empire 5–4 Breeze       │  Header (score)
├─────────────────────────────┤
│  LINE SELECTION    [Confirm]│  Title row
├─────────────────────────────┤
│  [ Empire ✓ ] [ Breeze  ]   │  Team tabs
│  4M / 3F ✓                  │  Ratio status
├─────────────────────────────┤
│  Selected — on the field    │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐         │
│  │📷│ │📷│ │📷│ │📷│         │  selected pills
│  Marc Daisy Joe  Sam        │
│  ┌──┐ ┌──┐ ┌──┐             │
│  │📷│ │📷│ │📷│             │
│  Lisa Tom  Kelly            │
├─────────────────────────────┤
│  Bench — tap to swap        │
│  ○ Adam   ○ Beth   ○ Carl    │
│  ○ Don    ○ Eve    ○ Frank   │
│  …                          │
└─────────────────────────────┘
```

**State variants:**
- **Injury sub** — only the affected team's tab is shown; title reads "INJURY SUB — MID-POINT".
- **Off-ratio override** — tapping Confirm with an off-ratio line opens a confirm-anyway prompt (no change from landscape behaviour).
- **Half-time / end-game suggestion** — banner above the title row (already-built warn strip pattern).

### Screen 6 — Live Event Entry (the big one)

Three vertical zones:

```
┌─────────────────────────────┐
│  ←  Empire 5–4 Breeze   ⚙  │  Header (~48pt)
├─────────────────────────────┤
│  EVENT LOG ▾                │  Log peek (~32pt, taps open sheet)
├─────────────────────────────┤
│                             │
│     ┌──┐         ┌──┐       │
│     │M │         │D │       │  CANVAS
│     └──┘         └──┘       │  (active team's pills)
│                             │  
│        ┌──┐                 │  Pills tap = possession
│        │J │ ← holder        │  Holder visually distinct
│        └──┘                 │  Pass arrows behind pills
│                             │
│  ┌──┐         ┌──┐          │  
│  │S │         │L │          │
│  └──┘         └──┘          │
│        ┌──┐                 │
│        │T │                 │
│        └──┘                 │
│  ┌──┐                       │
│  │K │                       │
│  └──┘                       │
│                             │
├─────────────────────────────┤
│  ╔══════════╦══════════╗    │
│  ║   GOAL   ║ TURNOVER ║    │  ACTION ZONE
│  ╠══════════╬══════════╣    │  (~25% screen height)
│  ║  BLOCK   ║   MORE   ║    │  Fixed positions
│  ╚══════════╩══════════╝    │
└─────────────────────────────┘
```

**Zones (top-to-bottom):**
1. **Header** — back arrow · live score · settings ⚙. ~48pt.
2. **Log peek strip** — shows the last vis-log entry in muted text. Tap to expand the bottom sheet. ~32pt.
3. **Canvas** — active team's pills, freely placed (physics-driven). Fills the remaining vertical space.
4. **Action zone** — 2×2 grid of large fixed buttons at the bottom. ~25% of screen height (~210pt). Thumb-reachable.

**Action zone — In-play (with disc holder):**

| Slot | Button | Action |
|---|---|---|
| Top-left | **GOAL** | Records goal for the current holder. Closes the point. |
| Top-right | **TURNOVER** | Opens a transient sub-bar to pick: Throwaway / Receiver Error / Stall (if enabled). |
| Bottom-left | **BLOCK** | Enters block-pick mode (Intercept is a sibling — see below). |
| Bottom-right | **MORE** | Opens the More sheet (stoppages, edit, half-time / end-game, pill size). |

**Action zone — In-play (no holder, e.g. just after pull/turnover):**

GOAL and TURNOVER dim out (first-possession gating). BLOCK and MORE stay active. Recorder taps a pill to pick up the disc → next state.

**Action zone — Awaiting-pull:**

| Slot | Button |
|---|---|
| Top-left | **PULL** |
| Top-right | **BONUS** (if `recordingOptions.pullBonus`) — otherwise blank |
| Bottom-left | **BRICK** (if `recordingOptions.brick`) — otherwise blank |
| Bottom-right | **MORE** |

Recorder picks the puller from the canvas first; pill highlights. Then taps PULL / BONUS / BRICK.

**Action zone — Pick mode (block / intercept / receiver-error):**

The action zone is **replaced** with a single bar: "PICK BLOCKER · TAP TO CANCEL". The canvas shows the relevant team (defending for block/intercept, possession-with-thrower-dimmed for receiver-error). Tap a pill to record.

**TURNOVER sub-bar (opens above the action zone on tap):**

```
┌─────────────────────────────┐
│  Throwaway   Rec Error  ✕   │  (Stall if enabled)
└─────────────────────────────┘
```

Either tap commits the turnover (Throwaway / Stall use current holder; Receiver Error enters its pick mode). ✕ closes without recording.

**BLOCK button — block vs intercept:**

Two paths. Either:
- (a) Single BLOCK button → opens a sub-bar with Block / Intercept (consistent with TURNOVER).
- (b) Long-press BLOCK for Intercept (single-tap = Block, long-press = Intercept).

Lean **(a)** for consistency. Intercept is uncommon enough not to need a dedicated slot.

**Bottom sheet — Log tab:**

Half-height overlay over the canvas. Contents:
- Visual log entries, scrollable, colour-coded.
- Header buttons: ↩ Undo · 🗒 Select (enters multi-select for Copy) · ✏ Edit (enters Edit mode) · 📋 Paste.
- Selection mode replaces the header with: ✕ count "Copy" "Cancel".

**Bottom sheet — More tab:**

Half-height overlay over the canvas. Contents:
- Stoppages: Injury Sub · Timeout · Foul (if enabled) · Pick (if enabled).
- Manual triggers: Half Time · End Game (subject to canRecord).
- Display prefs: pill size cycle · swap sides.

### Screen 7 — Game Over

Full-screen overlay replacing the canvas + action zone after the end-game event lands.

```
┌─────────────────────────────┐
│  ←   Empire 15–12 Breeze    │  Header (still shows score)
├─────────────────────────────┤
│                             │
│                             │
│         GAME OVER           │
│                             │
│          15 – 12            │
│                             │
│       Empire wins           │
│                             │
│  [    Back to games     ]   │
│  [       Edit log       ]   │
│  [        Export        ]   │
│                             │
└─────────────────────────────┘
```

The LogDrawer / More sheet are still reachable via the peek strip (kept at the top of the overlay) so the recorder can inspect / copy events post-game.

---

## State variants — cross-screen patterns

### Pick mode (Block / Intercept / Receiver Error)

- Header: unchanged.
- Mode strip below header: warn-tinted, "PICK BLOCKER FROM BREEZE · TAP TO CANCEL". (Or "PICK INTERCEPTOR" / "TAP PLAYER WHO HAD ERROR".)
- Canvas: shows the pickable team (defending for block/intercept; possession with thrower dimmed for receiver-error).
- Action zone: replaced with the cancel bar.
- Tap a pill → records the event → exits pick mode → returns to in-play.

### Truncate cursor preview

- Long-press an event in the Log sheet → cursor set; canvas + log rewind to that point.
- Mode strip: "VIEWING HISTORY · RECORD TO TRUNCATE FORWARD · TAP TO CANCEL".
- Action zone behaviour: any record action commits the truncate and writes from the rewind point.

### Edit mode

- Entered from the Log sheet's ✏ Edit affordance.
- Mode strip: "EDIT MODE — select range to replace" / "EDITING #N–#M · [DONE] [CANCEL]".
- Recorder operates as normal — events land in the draft session.
- DONE commits as a splice-block; CANCEL discards.

### Half-time / end-game suggestion banner

- Fires on Line Selection (already built in landscape; portrait inherits).
- Banner stacks above the title row, warn-tinted: "HALF-TIME SCORE REACHED — CALL HALF TIME?" + [ CALL HALF ] [ NOT YET ].
- Or "SCORE CAP REACHED — END THE GAME?" + [ END GAME ] [ NOT YET ].

### Notification banner (copy/paste/edit feedback)

Short-lived strip stacked above the title row on whichever screen the user is on. Success (green) or warn (amber). Auto-dismisses after a few seconds; tap to dismiss early.

---

## Layout rules

### Vertical space budget — Live Entry (390×844)

| Zone | Height | Notes |
|---|---|---|
| Status bar / safe area | 50pt | OS |
| Header | 48pt | Back · score · ⚙ |
| (Mode strip, when active) | 32pt | Mutually exclusive |
| Log peek | 32pt | Tap to expand |
| Canvas | 460pt | Remainder; pills fly here |
| Action zone | 210pt | 2×2 grid, fixed |
| Home indicator | 34pt | OS |

Canvas-to-action ratio is ~2.2:1. Adequate for 7 pills with chip-free physics.

### Button sizing — action zone

- Each quadrant: ~180×95pt at 390pt width.
- Label: bold, 18pt-ish; secondary glyph optional.
- High contrast colour-coded by action: GOAL = success green; TURNOVER = warn amber; BLOCK = block blue; MORE = neutral.
- Disabled state: 40% opacity, no tap response.

### Pill sizing — canvas

- Small: 56pt diameter; Medium (default): 72pt; Large: 88pt.
- Drag-to-reorder still works (per-device transient `lineOrderOverride`).
- Holder: 3pt border + slight glow.
- Ineligible (pick mode): 30% opacity, untappable.

---

## What gets dropped on the portrait migration

Per the [phase-cleanup policy](../../CLAUDE.md#phase-change-cleanup-policy), the migration removes the landscape-specific code rather than keeping it side-by-side. Concretely:

- `screens.md` landscape wireframe prompts → already removed; this doc supersedes them.
- Field-orientation logic (`attackLeft` rendering, "team attacking left → right is shown on the left"). The `attackLeft` derived state field stays in the engine (cheap, may inform future visuals) but the UI stops consuming it.
- `LogDrawer` + `AdminDrawer` as side rails → replaced by the bottom-sheet pattern. The `Drawer.tsx` wrapper component, the rail widths, the `expandedDrawer: 'log' | 'admin' | null` state all get torn out.
- Canvas geometry tuned for a landscape aspect ratio → re-tuned for portrait (slot positions, BOUNDS_MARGIN, chip-rosette fallback paths). The chip-rosette `legacyProposals` 360° fallback may go entirely if all pills are clearly in a hemisphere.
- The `swapSides` toggle — its purpose was "the recorder walked around to the other touchline" in a landscape mental model where team A was always on the left. In portrait there are no left/right team positions; both teams use the same canvas region (active team only). The toggle is dead weight and gets removed.

The landscape build remains accessible at the `pre-portrait-snapshot` branch for reference / rollback.

---

## Open questions

1. **Action zone height: fixed pt or fraction of screen?** Leaning fixed (~210pt) so small-phone users still have a reasonable canvas. Tablet users get a relatively larger canvas, which is fine.
2. **TURNOVER sub-bar vs replacing action zone?** A sub-bar above the action zone keeps the canvas visible (rationale: recorder may still need to glance at pills). Alternative: temporarily replace the four buttons with the turnover-type buttons. Sub-bar is the safer first call.
3. **Where does the puller-select state live?** When in awaiting-pull, the recorder taps a pill to select the puller. Today the puller pill glows. Same pattern works in portrait; the action zone's PULL / BONUS / BRICK buttons stay disabled until a puller is selected.
4. **Log peek strip — show one line or two?** One is cleaner; two gives more context. Lean one; expand the sheet for more.
5. **Bottom sheet — overlay or push?** Overlay (semi-transparent backdrop, canvas dims). Push would shrink the canvas which feels worse for live recording.
6. **GOAL location — top-left or bottom-right?** Top-left because it's the most consequential button and historically near the top of the rosette. But thumb reach favours bottom-right. **Decide before implementation.**
7. **Long-press to commit dangerous actions (end-game)?** Optional safety. Probably yes for END GAME, no for everything else.
8. **Field-location capture bonus feature** — when this lands, it likely demands landscape. Will exist as a parallel mode reached from an explicit toggle, not the default.

---

## Implementation plan stub (not part of this design pass)

Not for this doc — but for reference, the migration sequence will be:

1. **Confirm this proposal**, adjust per review feedback.
2. **Push the `pre-portrait-snapshot` branch** to origin so the landscape build is recoverable.
3. **Strip landscape code per the phase-cleanup policy** (side rails, swapSides, field-orientation rendering, landscape canvas geometry).
4. **Rebuild Live Entry** from the bottom up: new header strip, log peek, canvas with adjusted slot positions, fixed action zone.
5. **Rebuild Line Selection** with tab switcher.
6. **Rebuild Game Setup / Teams Manager / Game Settings / New Game** with vertical-stack layouts.
7. **Regenerate screen-states.md** wireframe prompts against this proposal.
8. **Manual run-through** with the dev server + tunnel — verify on actual phone before merging.

---

## What this doc is *not*

- Not a final visual design — there's no colour spec, font spec, or animation spec.
- Not a code change — zero code touched in producing this proposal.
- Not a commitment — feedback is expected; iteration before any code lands.
- Not a full re-architecture — the engine, store shape, and rawLog stay exactly as they are. This is a presentation-layer rework.
