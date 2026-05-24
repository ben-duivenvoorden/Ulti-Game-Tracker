// Pill geometry — base dimensions for the 'md' (default) size. The actual
// rendered size is base × pillScale (see PILL_SCALE_FACTORS).
export const PILL_H = 48
export const HH = PILL_H / 2
export const PILL_FONT_SIZE = 17
export const PILL_PADDING_X = 20

// Pill-size presets. The user cycles through these from the admin drawer.
export type PillSize = 'sm' | 'md' | 'lg'
export const PILL_SCALE_FACTORS: Record<PillSize, number> = {
  sm: 0.85,
  md: 1.0,
  lg: 1.18,
}
export const PILL_SIZE_CYCLE: Record<PillSize, PillSize> = {
  sm: 'md',
  md: 'lg',
  lg: 'sm',
}
export const GAP = 6
export const CHIP_H = 22

// Tap vs drag distinction (px). Bumped from 5 to forgive thumb shake.
export const TAP_THRESH = 6

// Soft bounds inset — distance kept clear between the pill (or chip
// footprint) and the canvas edge. Horizontal margin is tighter than
// vertical so pills can hug the left/right edges where there's nothing
// else competing for space (drawers handle their own width via flex).
export const BOUNDS_MARGIN_X = 5
export const BOUNDS_MARGIN_Y = 15
// Kept for API compatibility with anything still importing the original
// uniform constant.
export const BOUNDS_MARGIN = BOUNDS_MARGIN_Y

// ─── Slot layout ──────────────────────────────────────────────────────────────
// Seven home positions for the active line. Distribution-only (not tactical):
// 4 corners (inset enough that a corner pill's chip rosette doesn't overflow
// the canvas), 1 centred, 2 lower-middle. Coordinates are fractional 0..1 of
// canvas bounds — see slotPositions() in physics.ts.
//
// Index order maps to the active line: players[i] sits at SLOT_POSITIONS[i].
// Pill display order is per-device transient state (store.lineOrderOverride);
// the slot positions themselves never move.
export interface SlotFrac { readonly x: number; readonly y: number }
export const SLOT_POSITIONS: ReadonlyArray<SlotFrac> = [
  { x: 0.16, y: 0.18 }, // 0: top-left corner
  { x: 0.84, y: 0.18 }, // 1: top-right corner
  { x: 0.50, y: 0.45 }, // 2: centre
  { x: 0.34, y: 0.68 }, // 3: lower-mid left
  { x: 0.66, y: 0.68 }, // 4: lower-mid right
  { x: 0.16, y: 0.86 }, // 5: bottom-left corner
  { x: 0.84, y: 0.86 }, // 6: bottom-right corner
]

// Extra px around each pill's slot rect when hit-testing a drag release. A
// release within this padding of another pill's slot counts as a swap.
export const SLOT_HIT_PADDING = 8
