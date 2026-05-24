import { describe, it, expect } from 'vitest'
import {
  rectExitDist,
  computeArrowPath,
  sampleBezier,
  pillHalfWidth,
  pillLabel,
} from '../Canvas/physics'

describe('rectExitDist', () => {
  it('returns hw / |ux| on horizontal direction', () => {
    expect(rectExitDist(1, 0, 50, 20)).toBeCloseTo(50)
  })
  it('returns hh / |uy| on vertical direction', () => {
    expect(rectExitDist(0, 1, 50, 20)).toBeCloseTo(20)
  })
  it('takes the smaller exit on diagonal — vertical wins for short rects', () => {
    // (1,1) normalised → (0.707, 0.707). hw/|ux| = 70.7, hh/|uy| = 28.3 → 28.3 wins.
    const d = rectExitDist(1, 1, 50, 20)
    expect(d).toBeCloseTo(20)
  })
  it('treats zero component as Infinity (no exit on that axis)', () => {
    expect(rectExitDist(0, 0, 50, 20)).toBe(Infinity)
  })
})

describe('computeArrowPath', () => {
  it('places start and end outside both pill rects (with the visible gap)', () => {
    const a = { hw: 30, hh: 19 }
    const b = { hw: 30, hh: 19 }
    const geom = computeArrowPath(0, 0, 200, 0, a, b)
    // GAP_AB = 8, so start sits at hw + 8 from origin along +x.
    expect(geom.start.x).toBeCloseTo(30 + 8)
    expect(geom.end.x).toBeCloseTo(200 - (30 + 8))
  })

  it('produces an SVG path string and arrowhead points string', () => {
    const geom = computeArrowPath(0, 0, 100, 100, { hw: 20, hh: 19 }, { hw: 20, hh: 19 })
    expect(geom.d).toMatch(/^M [\d.-]+ [\d.-]+ Q [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+$/)
    expect(geom.head.split(' ')).toHaveLength(3)
  })
})

describe('sampleBezier', () => {
  it('returns n - 1 interior samples (excludes endpoints)', () => {
    const pts = sampleBezier(0, 0, 50, 100, 100, 0, 10)
    expect(pts).toHaveLength(9)
  })
  it('samples are monotonic in t for a straight bezier', () => {
    const pts = sampleBezier(0, 0, 50, 0, 100, 0, 8)
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].x).toBeGreaterThan(pts[i - 1].x)
    }
  })
})

describe('pillLabel', () => {
  it('keeps short names unchanged (≤ 12 chars)', () => {
    expect(pillLabel('Wen')).toBe('Wen')
    expect(pillLabel('Ben D')).toBe('Ben D')
    expect(pillLabel('Marcus')).toBe('Marcus')
    expect(pillLabel('Marcus Salt')).toBe('Marcus Salt')  // exactly 11
  })

  it('keeps long single-token names unchanged (no last-name initial to use)', () => {
    expect(pillLabel('Stephanopoulos')).toBe('Stephanopoulos')
  })

  it('collapses long multi-token names to "First L"', () => {
    expect(pillLabel('Wiebe van den Brink')).toBe('Wiebe B')
    expect(pillLabel('Solomon Rueschemeyer-Bailey')).toBe('Solomon R')
  })
})

describe('pillHalfWidth', () => {
  it('grows with the rendered label length (longer label → wider pill)', () => {
    const short = pillHalfWidth('Wen')
    const long  = pillHalfWidth('Stephanopoulos')
    expect(long).toBeGreaterThan(short)
  })
})
