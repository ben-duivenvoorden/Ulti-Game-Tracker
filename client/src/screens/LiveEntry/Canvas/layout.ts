import { BOUNDS_MARGIN_X, BOUNDS_MARGIN_Y, HH } from './constants'
import {
  rectExitDist, chipRect, rectsIntersect, rectInsideBounds,
  type ChipSpec, type ChipAlign, type Rect,
} from './physics'

// Chip identifiers and their on-screen labels.
// The chips use the same defence-action names as the event log (with the
// word "Defence" elided to "…" so the wide pills don't dominate the
// rosette). core/format.ts keeps the long form for the event-log copy.
export const CHIP_LABELS = {
  pull:         'Pull',
  'pull-bonus': 'Pull Distance Bonus',
  brick:        'Brick',
  rec:          'Receiver Error',
  goal:         'Goal',
  tw:           'Throwaway',
  st:           'Stall',
  blk:          'Blocked by …',
  int:          'Intercepted by …',
} as const

export type ChipId = keyof typeof CHIP_LABELS

export interface BuildOpts {
  phase: 'in-play' | 'awaiting-pull'
  /** Show the Stall chip on in-play opens. Hidden by default
   *  (recordingOptions.stall === false). */
  stallShown?: boolean
  /** Show the Pull Distance Bonus chip on awaiting-pull opens
   *  (recordingOptions.pullBonus). */
  bonusShown?: boolean
  /** Show the Brick chip on awaiting-pull opens
   *  (recordingOptions.brick). */
  brickShown?: boolean
}

/** Per-pill placement context. When provided, `buildActions` orients the
 *  rosette toward the canvas interior (180° hemisphere centred on the
 *  pill's "open direction") and runs a repair pass that nudges any chip
 *  whose footprint clips the canvas bounds, overlaps another pill's slot
 *  rect, or overlaps a previously-placed chip in the same rosette. */
export interface Placement {
  /** Pill centre in canvas px. */
  pill:   { x: number; y: number }
  /** Logical canvas bounds (Stage's `bounds` prop). */
  bounds: { w: number; h: number }
  /** Other pills' rectangles in canvas px (excluding the open pill). */
  others: Rect[]
}

// Base visible gap (px) between the chip's nearest edge and the pill
// perimeter, measured along the ray from pill centre. Applied at axial
// directions (top / right / bottom / left).
const CHIP_GAP = 12
// Extra outward push applied to chips on diagonals (~45°) so their long
// labels (e.g. "Blocked by …") don't crash into the axial chips that
// flank them. Scales with how diagonal the angle is — zero at axes,
// maximum at 45°.
const CHIP_CORNER_BUMP = 28

// Anchor a chip on the pill's rectangular perimeter (extended by CHIP_GAP +
// corner bump) along the given ray. Picks the alignment that makes the chip
// body extend outward, away from the pill.
function rayAnchor(id: ChipId, angle: number, HW: number): ChipSpec {
  const cosA = Math.cos(angle)
  const sinA = Math.sin(angle)
  const cornerness = Math.min(1, Math.abs(cosA * sinA) * 4) // 0 axial, 1 at 45°
  const connectorLength = CHIP_GAP + cornerness * CHIP_CORNER_BUMP
  // Distance from pill centre to its rect edge along (cosA, sinA), plus the
  // visible gap. rectExitDist treats the pill as a HW×HH axis-aligned rect.
  const t = rectExitDist(cosA, sinA, HW, HH) + connectorLength
  const ax = cosA * t
  const ay = sinA * t
  // Strict `>` so 45° angles fall through to horizontal alignment, avoiding
  // a long chip (extending vertically with center-bottom) overlapping the
  // axial chip above.
  let align: ChipAlign
  if (Math.abs(sinA) > Math.abs(cosA)) {
    align = sinA < 0 ? 'center-bottom' : 'center-top'
  } else {
    align = cosA > 0 ? 'left-center' : 'right-center'
  }
  return { id, label: CHIP_LABELS[id], ax, ay, align, connectorLength }
}

// ─── Adaptive orientation ─────────────────────────────────────────────────
// "Open direction" — the cardinal direction (right / left / down / up) that
// points away from the pill's nearest canvas edge. Used as the centre of a
// 180° rosette so chips fan into the available canvas space rather than off
// the edge.
//
// Returns null for pills sitting roughly in the canvas centre — those keep
// the legacy 360° layout (Rec left, Goal bottom, arc top→right) so existing
// muscle memory stays intact for the most common in-play position.
const CENTRE_DEAD_ZONE = 0.15
// Horizontal bias: chips are wider than tall, so steering away from a
// horizontal canvas edge gains more clearance than steering away from a
// vertical one. The ×1.2 makes |fx| win narrow ties (e.g. fractional slots
// like 0.16,0.18 where |dx| ≈ |dy|).
const HORIZONTAL_BIAS = 1.2

function openDirection(p: Placement): number | null {
  const fx = p.pill.x / p.bounds.w - 0.5
  const fy = p.pill.y / p.bounds.h - 0.5
  if (Math.abs(fx) < CENTRE_DEAD_ZONE && Math.abs(fy) < CENTRE_DEAD_ZONE) return null
  if (Math.abs(fx) * HORIZONTAL_BIAS >= Math.abs(fy)) return fx < 0 ? 0 : Math.PI
  return fy < 0 ? Math.PI / 2 : -Math.PI / 2
}

// Ordering of chips along the 180° arc, from arc-start (θ₀ - π/2) to
// arc-end (θ₀ + π/2). Chosen to keep a "turnover types → score → defence"
// reading order: rec, tw, [st], goal, blk, int.
const ARC_ORDER_INPLAY_NO_STALL: ChipId[] = ['rec', 'tw', 'goal', 'blk', 'int']
const ARC_ORDER_INPLAY_STALL:    ChipId[] = ['rec', 'tw', 'st', 'goal', 'blk', 'int']

// Pulling arc is dynamic — brick and pull-bonus are independently configurable.
// Order, when present: brick (left) → pull (centre) → pull-bonus (right).
function pullArcOrder(brickShown: boolean, bonusShown: boolean): ChipId[] {
  const ids: ChipId[] = []
  if (brickShown) ids.push('brick')
  ids.push('pull')
  if (bonusShown) ids.push('pull-bonus')
  return ids
}

// Evenly spread `ids` across the 180° arc centred at θ₀.
function hemisphereProposals(ids: ChipId[], theta0: number): { id: ChipId; angle: number }[] {
  const N = ids.length
  return ids.map((id, i) => {
    const t = N === 1 ? 0.5 : i / (N - 1)
    return { id, angle: (theta0 - Math.PI / 2) + t * Math.PI }
  })
}

// Legacy 360° layout — preserved for centre-of-canvas pills so the rosette
// still reads top→right with Rec on the left and Goal at the bottom.
function legacyProposals(opts: BuildOpts): { id: ChipId; angle: number }[] {
  if (opts.phase === 'awaiting-pull') {
    const out: { id: ChipId; angle: number }[] = [
      { id: 'pull',  angle: -Math.PI / 2 },
    ]
    if (opts.brickShown) out.push({ id: 'brick',      angle: Math.PI })
    if (opts.bonusShown) out.push({ id: 'pull-bonus', angle: 0 })
    return out
  }
  const arc: ChipId[] = opts.stallShown ? ['tw', 'st', 'blk', 'int'] : ['tw', 'blk', 'int']
  const N = arc.length
  const arcProps = arc.map((id, i) => ({
    id, angle: -Math.PI / 2 + (i / (N - 1)) * (Math.PI / 2),
  }))
  return [
    { id: 'rec'  as ChipId, angle: Math.PI },
    { id: 'goal' as ChipId, angle: Math.PI / 2 },
    ...arcProps,
  ]
}

// Repair pass — sweep ±180° around `angle` in 10° steps looking for the
// best chip placement against four tiered constraints:
//
//   tier 0 (perfect): chip-chip clear, in bounds, no pill overlap
//   tier 1:           chip-chip clear, in bounds (may overlap a pill — the
//                                                  per-frame push-out in
//                                                  Stage.tsx evicts the pill)
//   tier 2:           chip-chip clear (may clip bounds — pick the least
//                                                  clipped placement)
//   tier 3 (degraded): chip-chip overlap allowed (true last resort)
//
// Bounds violations are promoted above pill overlap because a chip past the
// canvas edge is unfixable — there's nothing the push-out pass can do.
// Pill-vs-chip overlap is recoverable by displacing the pill, so it ranks
// below clipping in the search.
//
// 36 candidate angles (1 + 18 + 18) is dense enough that a chip-chip-clear
// placement almost always exists.
const REPAIR_STEP_DEG = 10
const REPAIR_MAX_DEG  = 180

function outsideAmount(r: Rect, bounds: { w: number; h: number }, mx: number, my: number): number {
  return Math.max(0, mx - r.l)
       + Math.max(0, r.r - (bounds.w - mx))
       + Math.max(0, my - r.t)
       + Math.max(0, r.b - (bounds.h - my))
}

function repairChip(
  id: ChipId, angle: number, HW: number, halfHeight: number,
  p: Placement, accepted: Rect[],
): ChipSpec {
  const candidates: number[] = [0]
  for (let s = REPAIR_STEP_DEG; s <= REPAIR_MAX_DEG; s += REPAIR_STEP_DEG) {
    candidates.push((s * Math.PI) / 180, -(s * Math.PI) / 180)
  }

  let bestT0: { spec: ChipSpec; absDa: number } | null = null
  let bestT1: { spec: ChipSpec; absDa: number; pillHits: number } | null = null
  let bestT2: { spec: ChipSpec; absDa: number; outsideAmt: number; pillHits: number } | null = null
  let bestT3: { spec: ChipSpec; absDa: number; chipHits: number; outsideAmt: number; pillHits: number } | null = null

  for (const da of candidates) {
    const candidate  = rayAnchor(id, angle + da, HW)
    const r          = chipRect(p.pill.x, p.pill.y, candidate)
    const inside     = rectInsideBounds(r, p.bounds, BOUNDS_MARGIN_X, BOUNDS_MARGIN_Y)
    const outsideAmt = inside ? 0 : outsideAmount(r, p.bounds, BOUNDS_MARGIN_X, BOUNDS_MARGIN_Y)
    const pillHits   = p.others.reduce((n, o)  => n + (rectsIntersect(o,  r) ? 1 : 0), 0)
    const chipHits   = accepted.reduce((n, a2) => n + (rectsIntersect(a2, r) ? 1 : 0), 0)
    const absDa      = Math.abs(da)

    if (chipHits === 0 && inside && pillHits === 0) {
      if (!bestT0 || absDa < bestT0.absDa) bestT0 = { spec: candidate, absDa }
    }
    if (chipHits === 0 && inside) {
      if (!bestT1
          || pillHits < bestT1.pillHits
          || (pillHits === bestT1.pillHits && absDa < bestT1.absDa)) {
        bestT1 = { spec: candidate, absDa, pillHits }
      }
    }
    if (chipHits === 0) {
      if (!bestT2
          || outsideAmt < bestT2.outsideAmt
          || (outsideAmt === bestT2.outsideAmt && pillHits < bestT2.pillHits)
          || (outsideAmt === bestT2.outsideAmt && pillHits === bestT2.pillHits && absDa < bestT2.absDa)) {
        bestT2 = { spec: candidate, absDa, outsideAmt, pillHits }
      }
    }
    if (!bestT3
        || chipHits   < bestT3.chipHits
        || (chipHits === bestT3.chipHits && outsideAmt < bestT3.outsideAmt)
        || (chipHits === bestT3.chipHits && outsideAmt === bestT3.outsideAmt && pillHits < bestT3.pillHits)
        || (chipHits === bestT3.chipHits && outsideAmt === bestT3.outsideAmt && pillHits === bestT3.pillHits && absDa < bestT3.absDa)) {
      bestT3 = { spec: candidate, absDa, chipHits, outsideAmt, pillHits }
    }
  }

  // halfHeight kept in the signature for future use (e.g. clamp-against-pill);
  // currently only `chipRect` width-pad matters. Reference here so the
  // parameter is non-vestigial when callers wire scaled pill height through.
  void halfHeight

  return bestT0?.spec ?? bestT1?.spec ?? bestT2?.spec ?? bestT3?.spec ?? rayAnchor(id, angle, HW)
}

// Layout for the chips that surround an opened pill.
//
// Two layout modes:
//   • Adaptive (when `placement` is given AND the pill is near a canvas
//     edge): chips are laid on a 180° arc oriented away from the nearest
//     edge, then any chip that still clips bounds or another pill is nudged
//     by the repair sweep.
//   • Legacy (centre-of-canvas pills, or callers that don't pass
//     `placement`): Rec left, Goal bottom, arc top→right — same layout the
//     rosette has had since the canvas was introduced.
export function buildActions(HW: number, opts: BuildOpts, placement?: Placement): ChipSpec[] {
  const theta0 = placement ? openDirection(placement) : null

  // Pick proposals: hemisphere-oriented when adaptive, legacy otherwise.
  let proposals: { id: ChipId; angle: number }[]
  if (theta0 !== null) {
    let ids: ChipId[]
    if (opts.phase === 'awaiting-pull') {
      ids = pullArcOrder(opts.brickShown ?? false, opts.bonusShown ?? false)
    } else {
      ids = opts.stallShown ? ARC_ORDER_INPLAY_STALL : ARC_ORDER_INPLAY_NO_STALL
    }
    proposals = hemisphereProposals(ids, theta0)
  } else {
    proposals = legacyProposals(opts)
  }

  // No placement context — emit raw proposals (used by tests / static callers).
  if (!placement) return proposals.map(({ id, angle }) => rayAnchor(id, angle, HW))

  // With placement context, run the repair pass on every chip so even the
  // legacy layout gets edge / overlap relief at narrow canvas widths.
  const accepted: Rect[] = []
  const out: ChipSpec[] = []
  for (const { id, angle } of proposals) {
    const repaired = repairChip(id, angle, HW, HH, placement, accepted)
    out.push(repaired)
    accepted.push(chipRect(placement.pill.x, placement.pill.y, repaired))
  }
  return out
}

// Map a ChipId to the engine action that should run when the chip is tapped.
export type ChipAction =
  | { kind: 'pull';        bonus: boolean }
  | { kind: 'brick' }
  | { kind: 'throwaway' }
  | { kind: 'goal' }
  | { kind: 'stall' }
  | { kind: 'def-block';   type: 'block' | 'intercept' }
  | { kind: 'receiver-error' }

export function chipAction(id: ChipId): ChipAction {
  switch (id) {
    case 'pull':        return { kind: 'pull',     bonus: false }
    case 'pull-bonus':  return { kind: 'pull',     bonus: true }
    case 'brick':       return { kind: 'brick' }
    case 'tw':          return { kind: 'throwaway' }
    case 'goal':        return { kind: 'goal' }
    case 'st':          return { kind: 'stall' }
    case 'blk':         return { kind: 'def-block', type: 'block' }
    case 'int':         return { kind: 'def-block', type: 'intercept' }
    case 'rec':         return { kind: 'receiver-error' }
  }
}
