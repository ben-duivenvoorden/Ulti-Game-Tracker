import { describe, it, expect } from 'vitest'
import { isAPoint, ratioForPoint } from '../engine'

// WFDF Ratio Rule A: point 1 plays ratio A, then the prescription alternates
// every two points — A B B A A B B A A … — with no reset at half-time.

describe('isAPoint', () => {
  it('follows A B B A A B B A A for points 0–8', () => {
    const seq = Array.from({ length: 9 }, (_, i) => (isAPoint(i) ? 'A' : 'B'))
    expect(seq).toEqual(['A', 'B', 'B', 'A', 'A', 'B', 'B', 'A', 'A'])
  })

  it('keeps alternating in pairs deep into a game (no half-time reset)', () => {
    // After point 0, points pair up as (1,2) (3,4) (5,6) … — each pair shares
    // a ratio and adjacent pairs alternate, indefinitely.
    for (let k = 1; k <= 20; k++) {
      expect(isAPoint(2 * k - 1)).toBe(isAPoint(2 * k))       // pair agrees
      expect(isAPoint(2 * k + 1)).toBe(!isAPoint(2 * k - 1))  // next pair flips
    }
    // Spot-check points 9–16: B B A A B B A A.
    const seq = Array.from({ length: 8 }, (_, i) => (isAPoint(9 + i) ? 'A' : 'B'))
    expect(seq).toEqual(['B', 'B', 'A', 'A', 'B', 'B', 'A', 'A'])
  })
})

describe('ratioForPoint', () => {
  const RATIO = { M: 4, F: 3 }

  it('M-majority seed: 4/3 on A points, 3/4 on B points', () => {
    expect(ratioForPoint(0, 'M', RATIO)).toEqual({ M: 4, F: 3 }) // A
    expect(ratioForPoint(1, 'M', RATIO)).toEqual({ M: 3, F: 4 }) // B
    expect(ratioForPoint(2, 'M', RATIO)).toEqual({ M: 3, F: 4 }) // B
    expect(ratioForPoint(3, 'M', RATIO)).toEqual({ M: 4, F: 3 }) // A
    expect(ratioForPoint(4, 'M', RATIO)).toEqual({ M: 4, F: 3 }) // A
    expect(ratioForPoint(5, 'M', RATIO)).toEqual({ M: 3, F: 4 }) // B
  })

  it('F-majority seed: 3/4 on A points, 4/3 on B points', () => {
    expect(ratioForPoint(0, 'F', RATIO)).toEqual({ M: 3, F: 4 }) // A
    expect(ratioForPoint(1, 'F', RATIO)).toEqual({ M: 4, F: 3 }) // B
    expect(ratioForPoint(2, 'F', RATIO)).toEqual({ M: 4, F: 3 }) // B
    expect(ratioForPoint(3, 'F', RATIO)).toEqual({ M: 3, F: 4 }) // A
  })

  it('uses the configured magnitudes regardless of which division they sit on', () => {
    // A competition configured as {M: 3, F: 4} carries the same hi/lo pair —
    // the majority seed alone decides which division gets the 4.
    expect(ratioForPoint(0, 'M', { M: 3, F: 4 })).toEqual({ M: 4, F: 3 })
    expect(ratioForPoint(1, 'M', { M: 3, F: 4 })).toEqual({ M: 3, F: 4 })
  })

  it('degenerate even split is stable across the whole pattern', () => {
    for (let p = 0; p < 8; p++) {
      expect(ratioForPoint(p, 'M', { M: 3, F: 3 })).toEqual({ M: 3, F: 3 })
    }
  })
})
