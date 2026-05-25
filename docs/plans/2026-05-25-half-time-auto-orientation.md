# Plan: Auto-orientation at half-time + per-point + shared with LineSelection

## Context

`endsSwapped` (currently session-only React state in `LiveEntry/index.tsx:61`) flips the score chip order in the Header and the player/event column order in the grid. Today it has three gaps:

1. **No per-point swap.** In Ultimate, teams switch ends after every goal — the engine already tracks this internally via `attackLeft` (engine.ts:208), but the UI presentation does not follow.
2. **No half-time auto-flip.** Rule of play: each team's second half is on the opposite end from where they started the game. The scorer currently has to flip the toggle manually.
3. **LineSelection tab order is hard-coded.** `LineSelection/index.tsx:170–188` always renders Team A's tab first, regardless of the scorer's perspective set in LiveEntry. And because `endsSwapped` is local React state in LiveEntry, it would be lost across LineSelection anyway.

This plan unifies orientation into a single derived value driven by a transient store baseline + the existing `visLog`, then shares it with both Header and LineSelection.

## Approach

Treat the on-screen orientation as **derived state**, computed from a manual baseline + the event log:

```
displayEndsSwapped(baseline, visLog) =
  baseline
  XOR (one flip per `goal` event)
  XOR (one flip per `half-time` event, but only if the goal count BEFORE that half-time event is even)
```

The half-time rule comes from the user's stated formula: at half-time, the second-half orientation should be the opposite of the game-start orientation. After N goals, current = start XOR N%2, so to land on NOT(start) we flip when N is even, keep when N is odd. Since each goal already contributes its own flip via the per-point rule, the half-time event adds at most one additional flip.

This derivation gives us **undo for free** — when the user undoes a goal, the visLog shrinks, the derived value recomputes correctly, no manual rollback needed.

The user chose **transient store state** (not persisted) for the baseline — so a full page reload resets to default, but navigation between LiveEntry/LineSelection preserves it.

## Critical files & changes

### 1. Store: add baseline + action — `client/src/core/store.ts`

- Add field `endsSwappedBaseline: boolean` (default `false`) to the store state — NOT included in `partialize` (so it doesn't persist across reloads, matching the user's choice).
- Add action `toggleEndsSwapped()` that flips the baseline.
- Export via the existing selectors pattern (alongside e.g. `useUiState`).

### 2. New selector: derived value — `client/src/core/selectors.ts`

- Add `useDisplayEndsSwapped()` that reads `endsSwappedBaseline` + `visLog` and returns the derived boolean per the formula above.
- Helper `deriveEndsSwapped(baseline, visLog)` colocated so it can be unit-tested.

### 3. LiveEntry: drop local state, consume derived value — `client/src/screens/LiveEntry/index.tsx`

- Remove `useState(endsSwapped)` at line 61 and replace its read sites (lines 129, 203, ~206) with `useDisplayEndsSwapped()`.
- Replace `setEndsSwapped(s => !s)` (line 130, passed as `onToggleEnds`) with the new `toggleEndsSwapped()` action.
- No other behavior change — Header & grid wiring stays identical, just pulls from the new source.

### 4. Header: no logic change needed — `client/src/screens/LiveEntry/Header.tsx`

- Still receives `endsSwapped` as a prop from LiveEntry (lines 11, 26–29). The value just now comes from the derived selector instead of local state.

### 5. LineSelection: respect the same orientation — `client/src/screens/LineSelection/index.tsx`

- Read `useDisplayEndsSwapped()`.
- Around lines 170–188, render the two `TeamTab`s conditionally: `endsSwapped ? [B, A] : [A, B]`. The simplest implementation: build a `const order: TeamId[] = endsSwapped ? ['B', 'A'] : ['A', 'B']` and `order.map(...)`.
- If `activeTab` defaults are derived from order, make sure the default tab is `order[0]` (or whatever the existing convention dictates — keep behavior consistent with today's "first tab is the active team's").

### 6. Tests — `client/src/core/`

- New unit test for `deriveEndsSwapped(baseline, visLog)` covering:
  - Empty log → baseline returned unchanged
  - 1 goal → baseline flipped
  - 2 goals → baseline returned
  - Half-time after N=0 goals → baseline flipped (N even)
  - Half-time after N=1 goal → 1 goal flip + 0 HT flip (N odd) → baseline flipped (just from the goal)
  - Half-time after N=2 goals → 2 goal flips + 1 HT flip → baseline flipped
  - Manual toggle baseline=true with various logs

## Verification

1. `npx tsc -b` and `npx vitest run` from `client/` — both clean.
2. Manual smoke in browser (Vite dev):
   - Start a game with Team A pulling, observe A on left in Header.
   - Score one goal for either team → orientation flips (B on left).
   - Score another → flips back (A on left).
   - Tap swap button manually → baseline flips, current display reverses.
   - Trigger half-time at even score (e.g. 2–2 → 4 goals): orientation flips at HT trigger.
   - Trigger half-time at odd score (e.g. 3–2 → 5 goals): orientation does NOT additionally flip at HT (the most recent goal flip already landed it correctly).
   - Visit LineSelection: tab order matches Header order.
   - Undo a goal: orientation reverts.
3. Plan archival per global feedback memory: copy this plan to `docs/plans/2026-05-25-half-time-auto-orientation.md` as step 0 of implementation.

## Out of scope

- Persisting `endsSwappedBaseline` across reloads (user explicitly chose transient).
- Changing the engine's internal `attackLeft` logic — that's already correct for its purpose and isn't user-facing.
- Confirming/undoing the half-time auto-flip with a UI prompt — silent flip per implicit user expectation.
