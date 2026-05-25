# Pass Lane → Circle-and-Line Notation

## Context

The current pass-arrow rendering — curved right-angle lines with swept-back feathered arrowheads, three-deep emphasis stack inside a dedicated 48 px lane — is heavier than the information it conveys. We want a quieter motif that reads at a glance during live entry: small circles directly on the player pills (solid for the current holder, empty for prior passers), joined by lightly-curved lines, no arrowheads.

The dedicated `PassLane` column goes away entirely; the notation overlays the `PlayerColumn` instead. The centre gap stays but shrinks by ~1/3 (48 px → ~32 px) so the layout still breathes between the players and the event buttons.

Decisions already locked in:

- **Always show exactly 2 prior passes.** The `passArrowsShown` stepper is removed end-to-end.
- **Keep the `Passes` on/off toggle** — it still gates recording and rendering.
- **Active player → solid circle, prior passers → empty circles.**
- **Same-row repeat** (e.g. A → B → A): only the most-recent visit shows a circle. Earlier empty circle on A is dropped, but the line still terminates at A's row.
- **Curve alternation**: the newest line picks the opposite curve direction from the previously-newest line; lines already on screen keep their curve as new passes are added.
- **Circle position**: fully on the pill, hugging the centre-facing edge.

## Approach

1. **Replace `PassLane.tsx`** (rewrite + rename → `PassNotation.tsx`). Drop all current arrow geometry. Keep `derivePassArrows`, the `ResizeObserver` height-measurement pattern, `rowCenter()`, and the `playersOn` direction handling.
2. **Drop the dedicated lane column** from the live-entry grid. Replace it with a fixed spacer ~32 px wide. Render `PassNotation` as an absolutely-positioned overlay inside the same grid cell as `PlayerColumn`.
3. **Strip `passArrowsShown`** from the type, the default, the persisted state (with an explicit migrate step), and the settings UI. Hardcode `VISIBLE_PASSES = 2` inside the notation component.
4. **Curve direction is derived from chain index** — `chainIdx % 2` picks the sign of the Bezier control offset. Because each arrow's chain index never changes once the event lands in `rawLog`, prior arrows keep their curve direction; only the freshly-added (highest-index) arrow can introduce a new direction, and it's always opposite its predecessor.

## Files to modify

- `client/src/screens/LiveEntry/PassLane.tsx` → rename to `PassNotation.tsx`
- `client/src/screens/LiveEntry/index.tsx` — drop dedicated lane column, add spacer, overlay PassNotation
- `client/src/core/types.ts` — remove `passArrowsShown`
- `client/src/core/store.ts` — bump `STORAGE_VERSION` + `BUILD_MARKER`; strip legacy `passArrowsShown` in migrate
- `client/src/screens/GameSettings/index.tsx` — delete the `Pass arrows on screen` stepper

## Verification

1. `cd client && npx tsc -b && npx vitest run` — both clean.
2. Live happy path: 3+ passes → 2 empty circles + 1 solid; alternating curves; prior curves stable across new passes.
3. Same-player repeat (A→B→A) → only one circle on A's row; line still terminates at A.
4. Passes toggle off → notation disappears; player taps don't record.
5. "Pass arrows on screen" stepper is gone.
6. Block/intercept → chain restarts from defender.
7. Centre gap visibly narrower (~32 px) but layout breathes.
8. Team-side swap mirrors notation correctly.
9. Persisted state migrates cleanly (no console errors, hydrates).
