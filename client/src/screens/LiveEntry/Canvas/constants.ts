// Pill geometry — base dimensions for the 'md' (default) size. The actual
// rendered size is base × pillScale (see PILL_SCALE_FACTORS).
//
// Tuned for portrait. Pills are deliberately large — names are the
// dominant element on the canvas and should be readable at a glance from
// arm's length without looking down.
export const PILL_H = 72
export const HH = PILL_H / 2
export const PILL_FONT_SIZE = 22
export const PILL_PADDING_X = 24

// Pill-size presets. The user cycles through these from the More sheet.
export type PillSize = 'sm' | 'md' | 'lg'
export const PILL_SCALE_FACTORS: Record<PillSize, number> = {
  sm: 0.85,
  md: 1.0,
  lg: 1.20,
}
export const PILL_SIZE_CYCLE: Record<PillSize, PillSize> = {
  sm: 'md',
  md: 'lg',
  lg: 'sm',
}
export const GAP = 6

// Tap vs drag distinction (px). Bumped from 5 to forgive thumb shake.
export const TAP_THRESH = 6

// Soft bounds inset — distance kept clear between the pill and the canvas
// edge. Horizontal margin matters more in portrait where the canvas is
// narrow; vertical can be tighter.
export const BOUNDS_MARGIN_X = 10
export const BOUNDS_MARGIN_Y = 12

// ─── Slot layout ──────────────────────────────────────────────────────────────
// Seven home positions for the active line in a portrait canvas. Hexagonal
// 2-3-2: two pills along the top, three across the middle (the widest row),
// two along the bottom. Big pills with big names, spread across the full
// canvas so the team's roster dominates the screen.
//
// Coordinates are fractional 0..1 of canvas bounds — see slotPositions() in
// physics.ts. Index order maps to the active line: players[i] sits at
// SLOT_POSITIONS[i]. Display order is per-device transient state
// (store.lineOrderOverride); the slot positions themselves never move.
export interface SlotFrac { readonly x: number; readonly y: number }
export const SLOT_POSITIONS: ReadonlyArray<SlotFrac> = [
  { x: 0.28, y: 0.12 }, // 0: top-left
  { x: 0.72, y: 0.12 }, // 1: top-right
  { x: 0.18, y: 0.50 }, // 2: mid-left
  { x: 0.50, y: 0.50 }, // 3: centre
  { x: 0.82, y: 0.50 }, // 4: mid-right
  { x: 0.28, y: 0.88 }, // 5: bottom-left
  { x: 0.72, y: 0.88 }, // 6: bottom-right
]

// Extra px around each pill's slot rect when hit-testing a drag release. A
// release within this padding of another pill's slot counts as a swap.
export const SLOT_HIT_PADDING = 8
