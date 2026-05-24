import { describe, it, expect } from 'vitest'
import { buildActions, chipAction, CHIP_LABELS, type Placement } from '../Canvas/layout'
import {
  chipRect, pillRect, rectInsideBounds, rectsIntersect, slotPositions,
  pillHalfWidth,
} from '../Canvas/physics'
import { BOUNDS_MARGIN_X, BOUNDS_MARGIN_Y, HH, SLOT_POSITIONS } from '../Canvas/constants'

// Tests below cover both the legacy (no-placement) layout — preserved for
// callers that don't yet pass a Placement — and the adaptive 180° layout
// activated when a Placement is supplied.

describe('CHIP_LABELS — defence chips elide "Defence"', () => {
  it('replaces the word with an ellipsis to keep the chip narrow', () => {
    expect(CHIP_LABELS.blk).toBe('Blocked by …')
    expect(CHIP_LABELS.int).toBe('Intercepted by …')
  })
  it('does not contain the literal word "Defence" on chip-rosette labels', () => {
    for (const label of Object.values(CHIP_LABELS)) {
      expect(label).not.toMatch(/Defence/)
    }
  })
})

describe('buildActions — in-play legacy layout (no placement)', () => {
  const chips = buildActions(40, { phase: 'in-play', stallShown: false })

  it('returns 5 chips: rec + goal + (tw, blk, int)', () => {
    expect(chips.map(c => c.id).sort()).toEqual(['blk', 'goal', 'int', 'rec', 'tw'])
  })

  it('places Receiver Error to the left of the pill', () => {
    const rec = chips.find(c => c.id === 'rec')!
    expect(rec.ax).toBeLessThan(0)
    expect(rec.ay).toBeCloseTo(0)
    expect(rec.align).toBe('right-center')
  })

  it('places Goal directly below the pill', () => {
    const goal = chips.find(c => c.id === 'goal')!
    expect(goal.ax).toBeCloseTo(0)
    expect(goal.ay).toBeGreaterThan(0)
    expect(goal.align).toBe('center-top')
  })

  it('places Throwaway directly above the pill', () => {
    const tw = chips.find(c => c.id === 'tw')!
    expect(tw.ax).toBeCloseTo(0)
    expect(tw.ay).toBeLessThan(0)
    expect(tw.align).toBe('center-bottom')
  })

  it('places Block and Intercept on the right side of the pill', () => {
    const blk = chips.find(c => c.id === 'blk')!
    const int = chips.find(c => c.id === 'int')!
    expect(blk.ax).toBeGreaterThan(0)
    expect(int.ax).toBeGreaterThan(0)
    expect(int.ay).toBeGreaterThan(blk.ay) // Intercept is below Block (further down the arc)
    expect(blk.align).toBe('left-center')
    expect(int.align).toBe('left-center')
  })
})

describe('buildActions — in-play legacy layout (no placement, stall shown)', () => {
  const chips = buildActions(40, { phase: 'in-play', stallShown: true })

  it('inserts Stall between Throwaway and Block on the arc', () => {
    expect(chips.map(c => c.id).sort()).toEqual(['blk', 'goal', 'int', 'rec', 'st', 'tw'])
    const tw  = chips.find(c => c.id === 'tw')!
    const st  = chips.find(c => c.id === 'st')!
    const blk = chips.find(c => c.id === 'blk')!
    // Stall sits in the upper-right quadrant: to the right of the axial
    // Throwaway and above the more-horizontal Block.
    expect(st.ax).toBeGreaterThan(tw.ax) // right of Throwaway
    expect(st.ax).toBeLessThan(blk.ax)   // left of Block (closer to vertical)
    expect(st.ay).toBeLessThan(0)        // upper half of canvas
  })
})

describe('buildActions — awaiting-pull legacy layout (no placement)', () => {
  it('returns just Pull when brick + bonus are both hidden', () => {
    const chips = buildActions(40, { phase: 'awaiting-pull', brickShown: false, bonusShown: false })
    expect(chips.map(c => c.id)).toEqual(['pull'])
  })

  it('returns Pull + Brick when brick on, bonus hidden', () => {
    const chips = buildActions(40, { phase: 'awaiting-pull', brickShown: true, bonusShown: false })
    expect(chips.map(c => c.id).sort()).toEqual(['brick', 'pull'])
    expect(chips.find(c => c.id === 'pull')!.label).toBe(CHIP_LABELS.pull)
    expect(chips.find(c => c.id === 'brick')!.ax).toBeLessThan(0)  // brick on the left
  })

  it('returns Pull + Pull Distance Bonus when brick hidden, bonus on', () => {
    const chips = buildActions(40, { phase: 'awaiting-pull', brickShown: false, bonusShown: true })
    expect(chips.map(c => c.id).sort()).toEqual(['pull', 'pull-bonus'])
    expect(chips.find(c => c.id === 'pull-bonus')!.ax).toBeGreaterThan(0)
  })

  it('returns Pull + Brick + Pull Distance Bonus when both shown', () => {
    const chips = buildActions(40, { phase: 'awaiting-pull', brickShown: true, bonusShown: true })
    expect(chips.map(c => c.id).sort()).toEqual(['brick', 'pull', 'pull-bonus'])
    expect(chips.find(c => c.id === 'pull-bonus')!.ax).toBeGreaterThan(0)
    expect(chips.find(c => c.id === 'brick')!.ax).toBeLessThan(0)
  })
})

// ─── Adaptive placement (with `Placement`) ─────────────────────────────────

// Small helper — build a Placement for the given fractional slot index on a
// canvas of `bounds`, with the other 6 slots' pill rects as the "others"
// list. This mirrors the wiring in Stage.tsx (placementFor).
function placementForSlot(idx: number, bounds: { w: number; h: number }, hw = 50): Placement {
  const slots = slotPositions(bounds)
  const others = slots
    .map((s, j) => j === idx ? null : pillRect(s.x, s.y, hw, HH))
    .filter((r): r is NonNullable<typeof r> => r !== null)
  return { pill: { x: slots[idx].x, y: slots[idx].y }, bounds, others }
}

// A typical post-drawer canvas with a typical-length player name — the size
// the app actually renders at on a phone with both drawers collapsed. Tests
// below assert the rosette fits cleanly here, which is the case the user
// reports clipping in. Pathologically small viewports (sub-360 width) with
// pathologically long names may still see degraded placement — by design,
// the repair pass falls back to the proposed angle when no candidate fits.
const REALISTIC_BOUNDS = { w: 600, h: 900 }
const REALISTIC_HW     = pillHalfWidth('Marcus')

describe('buildActions — adaptive placement keeps chips inside bounds', () => {
  it.each(SLOT_POSITIONS.map((_, i) => i))(
    'in-play (no stall) — slot %i: every chip rect fits inside bounds',
    (idx) => {
      const placement = placementForSlot(idx, REALISTIC_BOUNDS, REALISTIC_HW)
      const chips = buildActions(REALISTIC_HW, { phase: 'in-play', stallShown: false }, placement)
      for (const chip of chips) {
        const r = chipRect(placement.pill.x, placement.pill.y, chip)
        expect(rectInsideBounds(r, REALISTIC_BOUNDS, BOUNDS_MARGIN_X, BOUNDS_MARGIN_Y)).toBe(true)
      }
    },
  )

  it.each(SLOT_POSITIONS.map((_, i) => i))(
    'in-play (stall) — slot %i: every chip rect fits inside bounds',
    (idx) => {
      const placement = placementForSlot(idx, REALISTIC_BOUNDS, REALISTIC_HW)
      const chips = buildActions(REALISTIC_HW, { phase: 'in-play', stallShown: true }, placement)
      for (const chip of chips) {
        const r = chipRect(placement.pill.x, placement.pill.y, chip)
        expect(rectInsideBounds(r, REALISTIC_BOUNDS, BOUNDS_MARGIN_X, BOUNDS_MARGIN_Y)).toBe(true)
      }
    },
  )

  it.each(SLOT_POSITIONS.map((_, i) => i))(
    'awaiting-pull (with brick + bonus) — slot %i: every chip rect fits inside bounds',
    (idx) => {
      const placement = placementForSlot(idx, REALISTIC_BOUNDS, REALISTIC_HW)
      const chips = buildActions(REALISTIC_HW, { phase: 'awaiting-pull', brickShown: true, bonusShown: true }, placement)
      for (const chip of chips) {
        const r = chipRect(placement.pill.x, placement.pill.y, chip)
        expect(rectInsideBounds(r, REALISTIC_BOUNDS, BOUNDS_MARGIN_X, BOUNDS_MARGIN_Y)).toBe(true)
      }
    },
  )
})

describe('buildActions — adaptive placement keeps chips clear of other pills', () => {
  it.each(SLOT_POSITIONS.map((_, i) => i))(
    'in-play — slot %i: no chip overlaps another pill\'s rect',
    (idx) => {
      const placement = placementForSlot(idx, REALISTIC_BOUNDS, REALISTIC_HW)
      const chips = buildActions(REALISTIC_HW, { phase: 'in-play', stallShown: true }, placement)
      for (const chip of chips) {
        const r = chipRect(placement.pill.x, placement.pill.y, chip)
        for (const other of placement.others) {
          expect(rectsIntersect(r, other)).toBe(false)
        }
      }
    },
  )
})

describe('buildActions — adaptive placement keeps chips clear of each other', () => {
  it.each(SLOT_POSITIONS.map((_, i) => i))(
    'in-play — slot %i: chip rosette has no internal overlaps',
    (idx) => {
      const placement = placementForSlot(idx, REALISTIC_BOUNDS, REALISTIC_HW)
      const chips = buildActions(REALISTIC_HW, { phase: 'in-play', stallShown: true }, placement)
      const rects = chips.map(c => chipRect(placement.pill.x, placement.pill.y, c))
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          expect(rectsIntersect(rects[i], rects[j])).toBe(false)
        }
      }
    },
  )
})

describe('buildActions — adaptive placement at the centre slot', () => {
  // Slot 2 sits roughly in the canvas centre (within the dead-zone) so the
  // adaptive path falls back to the legacy 360° layout — Rec on the left,
  // Goal at the bottom.
  it('preserves the legacy layout for centre-of-canvas pills', () => {
    const bounds = { w: 1200, h: 900 }
    const placement = placementForSlot(2, bounds)
    const chips = buildActions(50, { phase: 'in-play', stallShown: false }, placement)
    const rec  = chips.find(c => c.id === 'rec')!
    const goal = chips.find(c => c.id === 'goal')!
    expect(rec.ax).toBeLessThan(0)
    expect(goal.ay).toBeGreaterThan(0)
    expect(goal.ax).toBeCloseTo(0)
  })
})

describe('chipAction', () => {
  it('maps chip ids to engine action descriptors', () => {
    expect(chipAction('pull')).toEqual({ kind: 'pull', bonus: false })
    expect(chipAction('pull-bonus')).toEqual({ kind: 'pull', bonus: true })
    expect(chipAction('tw')).toEqual({ kind: 'throwaway' })
    expect(chipAction('goal')).toEqual({ kind: 'goal' })
    expect(chipAction('st')).toEqual({ kind: 'stall' })
    expect(chipAction('blk')).toEqual({ kind: 'def-block', type: 'block' })
    expect(chipAction('int')).toEqual({ kind: 'def-block', type: 'intercept' })
    expect(chipAction('rec')).toEqual({ kind: 'receiver-error' })
  })
})
