# Live Entry — interactivity fix + possession-aware orientation + active-player inversion

## Critical bug — must fix first

Commit `58ea798` (Passes toggle) broke player taps in `in-play`. Root
cause:

- `store.ts:tapPlayer` was updated to early-return when
  `recordingOptions.passes === undefined-or-false`:
  ```ts
  if (!get().recordingOptions.passes) return
  ```
- `STORAGE_VERSION` was NOT bumped, so the migrate hook never runs for
  existing users — meaning the persisted `recordingOptions` (which
  predates the `passes` field) is restored via `merge` as-is. The
  `merge` callback does `{ ...c, ...p }` and `p.recordingOptions`
  fully overwrites the default-seeded current state, so the field
  ends up `undefined` for every existing user.
- `!undefined === true` → every in-play player tap bails out. No
  possession events fire. The PassLane stays empty because no new
  passes are recorded.

**Fix (small, targeted, no migration needed)**: change the guard in
`store.ts:tapPlayer` from a falsy check to an explicit strict-false
check, so `undefined` (legacy state) is treated the same as the
default of `true`:

```ts
if (get().recordingOptions.passes === false) return
```

A defence-in-depth follow-up — keep the `partialize`/`merge` path
robust against future RecordingOptions additions — is to add a
shallow-merge for `recordingOptions` in the `merge` callback:

```ts
recordingOptions: { ...DEFAULT_RECORDING_OPTIONS, ...(p.recordingOptions ?? {}) },
```

…and the matching guard in any other place that reads optional
RecordingOptions fields directly off the store. Keep the strict-false
fix in `tapPlayer` regardless — it documents the intent ("explicitly
disabled") more clearly than the falsy check.

Verify with a load-existing-localStorage scenario before the new visual
work lands.

## Context

The Live Entry screen currently fixes `PlayerColumn` on the left and
`EventColumn` on the right regardless of which team has the disc. That's
fine when only one team's players are ever shown (which is true today —
PlayerColumn already swaps to the active team's roster), but it breaks
the spatial link between the score header (Team A left · score · Team B
right) and the player tiles below.

The user wants the layout to *track possession*: when Team A has the
disc, their players sit on the left under their name in the header;
when Team B has the disc, their players sit on the right under theirs.
The action buttons take whichever side the players don't.

Alongside this, the user wants:

- a **session-only end-swap** affordance (a small icon beneath the
  score) so the recorder can flip the whole orientation to match the
  way they're sitting on the sideline. Resets to default on every
  reload — no persistence in the store.
- a **subtle wash of team colour** spreading from the active player
  across the pass lane and the action column, so the eye is led from
  "who has the disc" to "what can I record next"
- **inverted active/inactive player styling** — the holder/puller, who
  isn't tap-able as the next action, should look *dull*; the other
  players (your possible next taps) should look *bright*
- **event-button font size** matched to the player-button font size

Source of truth for the new behaviour: 2026-05-24 session handoff
(`docs/feedback/2026-05-24-session-handoff.md`) → "Where Live Entry
stands now" describes the 3-column grid this plan modifies.

## Files to change

All edits live in `client/src/screens/LiveEntry/` plus a small per-device
preference in the store.

- **`client/src/screens/LiveEntry/index.tsx`**
  - Add `const [endsSwapped, setEndsSwapped] = useState(false)` — local
    React state, resets per mount.
  - Compute `playerSide: 'left' | 'right'` from `activeTeam` and
    `endsSwapped`:
    - If `endsSwapped === false`: `activeTeam === 'A' → 'left'`, else `'right'`.
    - If `endsSwapped === true`: invert.
  - Order the three grid children based on `playerSide`. Keep the
    `1fr auto 1fr` grid template; just swap which child mounts first.
  - Pass `activeTeamColor` and `playerSide` down to the `PassLane` and
    `EventColumn` so the wash spans both. (PassLane already renders the
    centre column; it just gets a `style.background` tint.)
  - Pass `endsSwapped` + `onToggleEnds={() => setEndsSwapped(s => !s)}`
    to `Header`.
- **`client/src/screens/LiveEntry/Header.tsx`**
  - Accept new props `endsSwapped: boolean` and `onToggleEnds: () => void`.
  - When `endsSwapped`, render Team B chip + score on the left and
    Team A on the right. Simplest implementation: build an array
    `[teams.A, teams.B]`, reverse it when swapped, and render in
    order — same layout otherwise.
  - Add a small swap-ends icon button centred *below* the score row,
    inside the same bordered container. `~16 px` SVG of two
    horizontally-opposed arrows (↔), stroke `var(--color-muted)`,
    hover `var(--color-content)`, transparent background. Render as
    a `<button aria-label="Swap ends">` so it's tappable.
  - Header height grows from `h-16` to `h-20` (64 → 80 px) to fit the
    16 px icon strip beneath the score row. Keep the bottom border on
    the outer container.
- **`client/src/screens/LiveEntry/PlayerColumn.tsx`** — **inverted styling**
  - Compute `isActive = isHolder || isPuller` as today, but flip the
    visual treatment using a *team-tinted dim* for the active tile so
    it stays visibly different from the gray ineligible state:
    - **Active (holder/puller)**: faint team wash — `background:
      ${teamColor}1f` (≈12 % alpha), `color: var(--color-dim)`,
      `borderColor: ${teamColor}55`, `borderWidth: 1.5`,
      `fontWeight: 600`, no glow. The button stays enabled
      (engine no-ops on tapping the current holder) but visually
      reads as "already locked in".
    - **Other (eligible)**: bright — `background: teamColor` solid,
      `color: inkOn(teamColor)`, `borderColor: teamColor`,
      `borderWidth: 2`, `fontWeight: 700`, optional subtle
      `boxShadow: 0 0 14px ${teamColor}33`. These are the players
      you'd tap next.
    - **Ineligible** (receiver-error-pick excluding the thrower):
      keep the current gray style (`var(--color-surf-2)` /
      `var(--color-dim)` / `opacity: 0.45`). Ineligible wins over the
      "bright" treatment, and is clearly different from the
      team-tinted active dim.
  - Names use the existing two-line `splitName` + `clamp()` font.
- **`client/src/screens/LiveEntry/EventColumn.tsx`**
  - Bump the per-button font from `clamp(14px, 4.5vw, 19px)` to
    `clamp(15px, 5vw, 22px)` to match PlayerColumn.
  - Accept a new `teamColor: string` prop. Add a flat background tint
    on the column root (no gradient): `background: ${teamColor}1f`
    (≈12 % alpha). No absolutely-positioned overlay needed — the
    column root just gets the tint as its background. Buttons sit on
    top with their solid event colours and read fine over the tint.
- **`client/src/screens/LiveEntry/PassLane.tsx`**
  - Accept a new `teamColor: string` prop. Apply the *same*
    `${teamColor}1f` flat tint to the lane's root `<div>` so the
    wash reads as a continuous band joining PlayerColumn (or the
    space beside it) → PassLane → EventColumn.

## Visual: the active-player wash

A flat, full-band team-coloured tint behind PassLane + EventColumn —
no gradient, no fade, no radial. The active player tile already wears
a faint team wash (from the inverted-styling rule), and the bright
solid-coloured "other" player tiles flank the tint, so the eye reads
the active team's coloured strip running from the player column,
through the arrows, and into the action buttons.

Alpha: `1f` ≈ 12 %. Subtle enough that the solid event-button colours
(Goal green, Throw Away red, etc.) still read at full contrast.

Single source of truth: pass `activeTeamColor` from
`LiveEntry/index.tsx` to both `PassLane` and `EventColumn`. Both
apply the tint as a flat `background` on their root.

No state. No JS. Re-renders only when `activeTeam` flips (which is
already what flips the column ordering).

## Visual: the swap-ends icon

A 24-px stroked SVG of two horizontally-opposed arrows centered below
the score row. Stroke: `var(--color-muted)`. On hover/focus:
`var(--color-content)`. Sits in a `~32 px` tall strip beneath the
existing `h-16` header row but inside the same bordered container, so
the visible header bottom-border still sits below the icon.

The icon should NOT be a `<button>`-with-background (would compete
with the team chips). Render as a bare button with a transparent
background and only the SVG inside, with `aria-label="Swap ends"`.

## Verification

After implementing:

1. From `client/`: `npx tsc -b` and `npx vitest run` clean.
2. Start `npm run dev`; load Live Entry with a live game.
3. **Possession-tracking layout**:
   - Confirm the player buttons sit on the same side as the active
     team's chip in the header.
   - Trigger a turnover (Throw Away or Block); confirm both the
     player column and the wash flip to the other side.
   - Toggle the swap-ends icon; confirm both the header chip order
     AND the player column flip together.
   - Reload the page; confirm the swap-ends preference resets
     (session-only).
   - **Regression check for the interactivity bug**: confirm a fresh
     load against existing localStorage records a possession on
     in-play player tap (the fix-first item at the top of this plan).
4. **Active player inversion**:
   - On `awaiting-pull`: confirm the *selected puller* looks dull and
     the rest of the line looks bright/solid.
   - On `in-play` with a holder: confirm the holder looks dull and
     teammates look bright. Tap a teammate — the new holder becomes
     dull, the previous one brightens.
   - Enter Receiver Error Pick: confirm the (ineligible) thrower
     keeps its existing dimmed style — *not* the new bright style.
5. **Wash**:
   - Confirm the tint is visible but subtle (doesn't drown the button
     colours).
   - Confirm it tracks both possession changes and the swap-ends
     toggle.
6. **Font parity**:
   - Confirm event-button labels render at the same size as
     player-button labels at the relevant breakpoints.

## Out of scope (defer)

- Animating the side swap (cross-fade or slide). Ship the snap
  version first; revisit if it feels jarring.
- Persisting `endsSwapped` (user chose session-only for now).
- Re-styling LogPeek or BottomSheet to track possession side.
