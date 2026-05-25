# Sankey + pill cohesive rounding (full-capsule bridge ends)

## Context

The active-player sankey encompass currently reads as three rectangular regions glued together:

- Player pill (`PlayerColumn.tsx:81`) is `rounded-lg` (8px) on all four corners.
- Sankey outline (`index.tsx` `SankeyBridge`, lines ~422–454) traces straight edges along the player tile and straight edges along the action region, with only the four *outer* corners arced at `RADIUS = 8`.
- Two cubic Béziers bridge between them.

Because the pill's bridge-side corners (top-right + bottom-right when player is on the left) curve *inward* at 8px while the sankey's bridge-side edge runs straight horizontally to `sourceX`, there is a visible 8px "tick" / notch where the rectangular sankey edge clips past the pill's rounded corner. The bridge Béziers also start exactly at the pill's outer corner, so the eye reads two distinct shapes rather than one smooth ribbon.

Goal: the player pill, the sankey outline, and the action-button cluster should read as **one cohesively rounded shape with no sharp transitions**. The user wants:

- Player pill's three outer sides unchanged (8px `rounded-lg`, matching the inactive look).
- Player pill's **bridge-facing side** becomes a **full capsule end** — the two corners on that side merge into a single semicircular curve from top to bottom.
- Same treatment on the action-button cluster's bridge-facing side (each action button's bridge-facing corners become capsule).
- Sankey outline follows the pill's new capsule end smoothly, with the bridge Béziers emerging tangent to that curve instead of from a square corner.

## Approach

Introduce one shared "bridge radius" concept driven by tile height. Apply it as asymmetric `borderRadius` on the two pill components and as matching arc geometry in the sankey path so the three shapes share an outline.

### 1. `SankeyBridge` (in `client/src/screens/LiveEntry/index.tsx`, ~lines 339–473)

- Add `BRIDGE_R = tileH / 2` derived from the existing `tileH` calculation (line 384). This is the natural "full capsule" radius for a tile.
- The bridge Béziers can't attach at a degenerate zero-width point, so reserve a small attachment band. Define `ATTACH_INSET` (e.g. `4` px) and use `BRIDGE_R = tileH / 2 - ATTACH_INSET` for the *sankey arc* — the pill still draws a true full-capsule (its corners clamp at exactly `tileH/2` via CSS), and the sankey's arc sits just inside the tip, leaving an `ATTACH_INSET * 2` band of pill edge for the bridge to spring from. This keeps the bridge visibly attached without an obvious flat segment.
- Player-tile side of the path: replace `L ${sourceX} ${activeTop}` and the matching bottom line with arcs that curve around the pill's capsule end:
  - Top: `L ${sourceX - BRIDGE_R} ${activeTop}` → `A ${BRIDGE_R} ${BRIDGE_R} 0 0 1 ${sourceX} ${activeTop + BRIDGE_R}` (player-on-left; sweep flag flips for player-on-right).
  - Bottom: mirror — arc from `${sourceX} ${activeBottom - BRIDGE_R}` to `${sourceX - BRIDGE_R} ${activeBottom}`.
  - The bridge Béziers then start/end at `(sourceX, activeTop + BRIDGE_R)` and `(sourceX, activeBottom - BRIDGE_R)`.
- Event-region side of the path: same treatment around `targetX`. Replace the straight runs `L ${targetX} ${evtTop}` / `L ${targetX} ${evtBottom}` with arcs of radius `min(BRIDGE_R, (evtBottom - evtTop) / 2 - ATTACH_INSET)` (event region is taller than one tile, so cap the radius so it doesn't exceed half the region height).
- Keep the four outer corners at the existing `RADIUS = 8` so the outer 3 sides match the pill's `rounded-lg`.

### 2. `PlayerColumn.tsx` (line 81)

- Add `playerLeft: boolean` to `PlayerColumnProps`, threaded from `LiveEntry/index.tsx` (it already knows the orientation — currently passed to `SankeyBridge`).
- Replace `rounded-lg` in the button's className with `rounded-l-lg` / `rounded-r-lg` for the outer side only, and apply inline `style` for the bridge-side corners with a very large radius so CSS clamps to a full capsule:
  - Player on left: `borderTopRightRadius: '9999px', borderBottomRightRadius: '9999px'`
  - Player on right: `borderTopLeftRadius: '9999px', borderBottomLeftRadius: '9999px'`
- Apply this in **both** active and inactive states (user said the three outer sides should look "same as when inactive" — the asymmetric shape is the new default look in both states, only the colour/transparency differs).

### 3. `EventColumn.tsx` (line 172, `EventBtn`)

- Add `bridgeSide: 'left' | 'right' | null` to `EventBtnDef`. `left`/`right` indicates which side faces the sankey; `null` means no capsule treatment.
- Action buttons (the `actionButtons` list — Receiver Error, Throw away, Block, Intercept, Stall, Goal in-play; Pull / Bonus / Brick on awaiting-pull) get `bridgeSide` set opposite to player position (when player is on left, actions are on right, so their **left** side faces the sankey → `bridgeSide: 'left'`).
- The "More" button stays outside the sankey — pass `bridgeSide: null` so it keeps its all-corners `rounded-lg` look.
- In `EventBtn`, swap the static `rounded-lg` for asymmetric: outer corners via Tailwind class, bridge corners via inline `borderRadius: '9999px'` on the appropriate side. When `bridgeSide === null`, keep the existing `rounded-lg` all-around.

### 4. Threading the orientation

`LiveEntry/index.tsx` already computes which team is on the left for `SankeyBridge`. Same value passes down to:

- `PlayerColumn` as a new `playerLeft` prop.
- `EventColumn` as a new `playerLeft` prop, which it uses internally to set each action button's `bridgeSide`.

## Files to modify

- `client/src/screens/LiveEntry/index.tsx` — `SankeyBridge` arc geometry; pass `playerLeft` to `PlayerColumn` and `EventColumn`.
- `client/src/screens/LiveEntry/PlayerColumn.tsx` — accept `playerLeft`; asymmetric `borderRadius` on the player button.
- `client/src/screens/LiveEntry/EventColumn.tsx` — accept `playerLeft`; pass `bridgeSide` to each `EventBtn`; asymmetric `borderRadius` on action buttons; `null` for the "More" button.

## Verification

- `npx tsc -b` from `client/` — clean.
- `npx vitest run` from `client/` — clean (no tests touch geometry, but the type changes need to compile through).
- Run `npm run dev` and visually confirm in the browser:
  - In-play, active player on left team: pill's right side is a smooth semicircle, sankey outline flows around it into the bridge with no visible kink, action cluster's left side mirrors the capsule.
  - In-play, active player on right team: mirrored.
  - Awaiting-pull state (different action button set — Pull / Bonus / Brick): same smooth profile.
  - "More" button retains all-corner `rounded-lg` (it's outside the encompass).
  - Inactive player pills (non-holder rows) keep three rounded-lg outer corners and a capsule bridge side — still look like a row of "tabs" pointing toward the action cluster.
