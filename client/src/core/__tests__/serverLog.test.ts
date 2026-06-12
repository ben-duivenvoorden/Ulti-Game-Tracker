import { describe, it, expect } from 'vitest'
import { parseEventsCsv, rowsToSegments, summariseGame, decideResume, type GameSummary } from '../serverLog'
import { MOCK_GAMES } from './fixtures'
import type { TeamId, Score, GameSession, RawEvent } from '../types'

// Mirrors api/src/shared/csv.ts `eventToCsvRow` exactly — building rows this way
// keeps the parser test honest against the real wire format.
const HEADER = 'event_id,game_id,segment_id,scorer_id,device_id,timestamp_ms,point_index,type,payload'
function row(
  eventId: number, gameId: number, segmentId: string, deviceId: string,
  ts: number, pointIndex: number, type: string, payload: Record<string, unknown>,
): string {
  const pj = JSON.stringify(payload).replaceAll('"', '""')
  return [eventId, gameId, segmentId, 'scorer_x', deviceId, ts, pointIndex, type, `"${pj}"`].join(',')
}
function csv(rows: string[]): string {
  return [HEADER, ...rows, ''].join('\n')
}
function goal(eventId: number, segmentId: string, deviceId: string, pi: number, teamId: TeamId): string {
  return row(eventId, MOCK_GAMES[0].id, segmentId, deviceId, 1000 + eventId, pi, 'goal', { playerId: 1, teamId })
}
const GID = MOCK_GAMES[0].id

describe('parseEventsCsv', () => {
  it('parses leading columns and a payload containing commas', () => {
    const text = csv([
      row(1, GID, 'seg_a', 'dev_a', 1717, 0, 'point-start', { lineA: [1, 2, 3], lineB: [8, 9, 10] }),
      goal(2, 'seg_a', 'dev_a', 1, 'A'),
    ])
    const rows = parseEventsCsv(text)
    expect(rows).toHaveLength(2)

    expect(rows[0]).toMatchObject({
      event_id: 1, game_id: GID, segment_id: 'seg_a', scorer_id: 'scorer_x',
      device_id: 'dev_a', point_index: 0, type: 'point-start', rowIndex: 0,
    })
    // The quoted-JSON payload (with internal commas) round-trips intact.
    expect(rows[0].payload).toEqual({ lineA: [1, 2, 3], lineB: [8, 9, 10] })
    expect(rows[1]).toMatchObject({ event_id: 2, type: 'goal', rowIndex: 1 })
    expect(rows[1].payload).toEqual({ playerId: 1, teamId: 'A' })
  })

  it('skips the header and blank lines', () => {
    expect(parseEventsCsv(HEADER + '\n')).toEqual([])
    expect(parseEventsCsv('')).toEqual([])
  })
})

describe('rowsToSegments', () => {
  it('lifts the segment-anchor row out of the event stream', () => {
    const rows = parseEventsCsv(csv([
      row(0, GID, 'seg_anch', 'dev_b', 500, 14, 'segment-anchor', { scoreA: 8, scoreB: 6, offence: 'A' }),
      goal(1, 'seg_anch', 'dev_b', 15, 'A'),
    ]))
    const segs = rowsToSegments(rows, GID)
    expect(segs).toHaveLength(1)
    expect(segs[0].anchor).toEqual({ scoreA: 8, scoreB: 6, offence: 'A' })
    // The anchor (event_id 0) is NOT a real event.
    expect(segs[0].events.map(e => e.id)).toEqual([1])
  })

  it('filters by gameId and orders events ascending by id', () => {
    const other = GID + 999   // a different game's rows must be ignored
    const rows = parseEventsCsv(csv([
      goal(2, 'seg_a', 'dev_a', 2, 'A'),
      goal(1, 'seg_a', 'dev_a', 1, 'B'),
      row(1, other, 'seg_other', 'dev_z', 1, 1, 'goal', { playerId: 1, teamId: 'A' }),
    ]))
    const segs = rowsToSegments(rows, GID)
    expect(segs).toHaveLength(1)
    expect(segs[0].events.map(e => e.id)).toEqual([1, 2])
  })
})

describe('summariseGame — high-water reduction', () => {
  const config = MOCK_GAMES[0]

  it('returns null when there are no segments for the game', () => {
    expect(summariseGame(GID, [], config)).toBeNull()
  })

  it('takes the furthest-progressed segment across the union', () => {
    // S1 from-start reaches 2–1 (pointIndex 3); S2 anchored at 8–6 (pointIndex 14).
    const rows = parseEventsCsv(csv([
      goal(1, 'seg_1', 'dev_1', 1, 'A'),
      goal(2, 'seg_1', 'dev_1', 2, 'B'),
      goal(3, 'seg_1', 'dev_1', 3, 'A'),
      row(0, GID, 'seg_2', 'dev_2', 500, 14, 'segment-anchor', { scoreA: 8, scoreB: 6, offence: 'A' }),
    ]))
    const summary = summariseGame(GID, rows, config)!
    expect(summary.segmentCount).toBe(2)
    expect(summary.pointIndex).toBe(14)
    expect(summary.score).toEqual({ A: 8, B: 6 })
    expect(summary.possession).toBe('A')            // anchored segment: offence receives
    expect(summary.canonicalSegmentId).toBe('seg_2')
  })

  it('does NOT regress when a segment edits the past (max ignores the lower one)', () => {
    // S1 is at 3–0 (pointIndex 3); S2 only reached 1–0 (a rewound/correcting peer).
    const rows = parseEventsCsv(csv([
      goal(1, 'seg_hi', 'dev_1', 1, 'A'),
      goal(2, 'seg_hi', 'dev_1', 2, 'A'),
      goal(3, 'seg_hi', 'dev_1', 3, 'A'),
      goal(1, 'seg_lo', 'dev_2', 1, 'A'),
    ]))
    const summary = summariseGame(GID, rows, config)!
    expect(summary.pointIndex).toBe(3)
    expect(summary.canonicalSegmentId).toBe('seg_hi')
  })

  it('breaks ties by append order (later row in the blob wins)', () => {
    // Both segments reach pointIndex 2; seg_late appears later in the CSV.
    const rows = parseEventsCsv(csv([
      goal(1, 'seg_early', 'dev_1', 1, 'A'),
      goal(2, 'seg_early', 'dev_1', 2, 'A'),
      goal(1, 'seg_late', 'dev_2', 1, 'A'),
      goal(2, 'seg_late', 'dev_2', 2, 'A'),
    ]))
    const summary = summariseGame(GID, rows, config)!
    expect(summary.pointIndex).toBe(2)
    expect(summary.canonicalSegmentId).toBe('seg_late')
  })
})

describe('decideResume — continue vs fork', () => {
  function localSession(deviceId: string, goals: TeamId[]): GameSession {
    return {
      gameConfig:           MOCK_GAMES[0],
      gameStartPullingTeam: 'A',
      segment: { segmentId: 'seg_local', scorerId: 'scorer_local', deviceId, createdAt: 0 },
      rawLog: goals.map((teamId, i) => ({ id: i + 1, timestamp: 1000 + i, pointIndex: i + 1, type: 'goal', playerId: 1, teamId }) as RawEvent),
    }
  }
  function summaryAt(pointIndex: number, score: Score, possession: TeamId = 'A'): GameSummary {
    return {
      gameId: GID, score, pointIndex, possession,
      canonicalSegmentId: 'seg_remote', scorerId: 'scorer_r', deviceId: 'dev_remote',
      segmentCount: 1, segments: [],
    }
  }

  it('continues when same device is at the high-water tail', () => {
    const local = localSession('dev_me', ['A', 'B', 'A'])   // pointIndex 3
    expect(decideResume(local, summaryAt(3, { A: 2, B: 1 }), 'dev_me')).toEqual({ kind: 'continue' })
  })

  it('continues when same device is ahead of the high-water (unsynced tail)', () => {
    const local = localSession('dev_me', ['A', 'A', 'A', 'A'])  // pointIndex 4
    expect(decideResume(local, summaryAt(3, { A: 2, B: 1 }), 'dev_me')).toEqual({ kind: 'continue' })
  })

  it('forks from the high-water when another device has passed me', () => {
    const local = localSession('dev_me', ['A'])             // pointIndex 1, behind
    expect(decideResume(local, summaryAt(5, { A: 3, B: 2 }, 'B'), 'dev_me'))
      .toEqual({ kind: 'fork', scoreA: 3, scoreB: 2, offence: 'B' })
  })

  it('forks when the local segment belongs to a different device', () => {
    const local = localSession('dev_other', ['A', 'A', 'A'])  // same pointIndex, wrong device
    expect(decideResume(local, summaryAt(3, { A: 2, B: 1 }, 'A'), 'dev_me'))
      .toEqual({ kind: 'fork', scoreA: 2, scoreB: 1, offence: 'A' })
  })

  it('forks when there is no local segment at all', () => {
    expect(decideResume(null, summaryAt(7, { A: 4, B: 3 }, 'A'), 'dev_me'))
      .toEqual({ kind: 'fork', scoreA: 4, scoreB: 3, offence: 'A' })
  })
})
