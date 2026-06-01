import { describe, it, expect } from 'vitest'
import { computeVisLog, deriveGameState, canRecord, appendEvents, validateSpliceBlock } from '../engine'
import type { GameSession, RawEvent, SpliceBlockRawEvent } from '../types'
import { MOCK_GAMES } from '../data'

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeSession(pullingTeam: 'A' | 'B' = 'A'): GameSession {
  const config = MOCK_GAMES[0]
  return {
    gameConfig:           config,
    gameStartPullingTeam: pullingTeam,
    rawLog:               [],
  }
}

// Common short-hand for tests: a point-start with two seven-player lines pulled
// from the first MOCK_GAMES roster.
const ROSTER_A = MOCK_GAMES[0].rosters.A
const ROSTER_B = MOCK_GAMES[0].rosters.B
const LINE_A_IDS = ROSTER_A.slice(0, 7).map(p => p.id)
const LINE_B_IDS = ROSTER_B.slice(0, 7).map(p => p.id)
const startPoint = (pointIndex = 0) =>
  ({ pointIndex, type: 'point-start', lineA: LINE_A_IDS, lineB: LINE_B_IDS } as const)

let counter = 0
function id() { return ++counter }

function ev(partial: Omit<RawEvent, 'id' | 'timestamp'> & { pointIndex?: number }): RawEvent {
  return { id: id(), timestamp: 0, pointIndex: 0, ...partial } as RawEvent
}

// ─── computeVisLog ────────────────────────────────────────────────────────────

describe('computeVisLog', () => {
  it('returns empty for empty raw log', () => {
    expect(computeVisLog([])).toEqual([])
  })

  it('passes through normal events', () => {
    const events: RawEvent[] = [
      ev({ type: 'point-start', lineA: LINE_A_IDS, lineB: LINE_B_IDS }),
      ev({ type: 'pull', playerId: 1, teamId: 'A' }),
    ]
    expect(computeVisLog(events)).toHaveLength(2)
  })

  it('undo removes the most recent visible non-system event', () => {
    const events: RawEvent[] = [
      ev({ type: 'point-start', lineA: LINE_A_IDS, lineB: LINE_B_IDS }),
      ev({ type: 'pull', playerId: 1, teamId: 'A' }),
      ev({ type: 'possession', playerId: 14, teamId: 'B' }),
      ev({ type: 'undo' }),
    ]
    const vis = computeVisLog(events)
    expect(vis).toHaveLength(2)
    expect(vis[1].type).toBe('pull')
  })

  it('undo skips structural entries (point-start, half-time, end-game)', () => {
    const events: RawEvent[] = [
      ev({ type: 'point-start', lineA: LINE_A_IDS, lineB: LINE_B_IDS }),
      ev({ type: 'undo' }),
    ]
    // point-start is structural, undo finds nothing else, leaves it alone
    expect(computeVisLog(events)).toHaveLength(1)
    expect(computeVisLog(events)[0].type).toBe('point-start')
  })

  it('multiple undos pop sequentially', () => {
    const events: RawEvent[] = [
      ev({ type: 'point-start', lineA: LINE_A_IDS, lineB: LINE_B_IDS }),
      ev({ type: 'pull', playerId: 1, teamId: 'A' }),
      ev({ type: 'possession', playerId: 14, teamId: 'B' }),
      ev({ type: 'possession', playerId: 15, teamId: 'B' }),
      ev({ type: 'undo' }),
      ev({ type: 'undo' }),
    ]
    const vis = computeVisLog(events)
    expect(vis.map(e => e.type)).toEqual(['point-start', 'pull'])
  })
})

// ─── deriveGameState ──────────────────────────────────────────────────────────

describe('deriveGameState', () => {
  it('initial: pre-game with receiving team in possession', () => {
    const session = makeSession('A')  // A pulls, B receives
    const state = deriveGameState(session)
    expect(state.gamePhase).toBe('pre-game')
    expect(state.possession).toBe('B')
    expect(state.attackLeft).toBe('B')
    expect(state.score).toEqual({ A: 0, B: 0 })
    expect(state.discHolder).toBeNull()
  })

  it('after point-start: awaiting-pull', () => {
    let session = makeSession('A')
    session = appendEvents(session, [startPoint(0)])
    expect(deriveGameState(session).gamePhase).toBe('awaiting-pull')
  })

  it('after pull: in-play', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },
    ])
    expect(deriveGameState(session).gamePhase).toBe('in-play')
  })

  it('possession event sets discHolder', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },
      { pointIndex: 0, type: 'possession', playerId: 14, teamId: 'B' },
    ])
    const state = deriveGameState(session)
    expect(state.discHolder).toBe(14)
    expect(state.possession).toBe('B')
  })

  it('turnover flips possession and clears discHolder', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },
      { pointIndex: 0, type: 'possession', playerId: 14, teamId: 'B' },
      { pointIndex: 0, type: 'turnover-throw-away', playerId: 14, teamId: 'B' },
    ])
    const state = deriveGameState(session)
    expect(state.possession).toBe('A')
    expect(state.discHolder).toBeNull()
  })

  it('block sets possession to defending team', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },
      { pointIndex: 0, type: 'possession', playerId: 14, teamId: 'B' },
      { pointIndex: 0, type: 'block', playerId: 3, teamId: 'A' },
    ])
    const state = deriveGameState(session)
    expect(state.possession).toBe('A')
    expect(state.discHolder).toBeNull()
  })

  it('goal increments score, transitions to point-over, sets up next point', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },
      { pointIndex: 0, type: 'possession', playerId: 14, teamId: 'B' },
      { pointIndex: 0, type: 'goal', playerId: 14, teamId: 'B' },
    ])
    const state = deriveGameState(session)
    expect(state.score).toEqual({ A: 0, B: 1 })
    expect(state.gamePhase).toBe('point-over')
    expect(state.possession).toBe('A')      // A receives next (B scored, B pulls)
    expect(state.attackLeft).toBe('A')      // A attacks left now
    expect(state.discHolder).toBeNull()
    expect(state.pointIndex).toBe(1)
  })

  it('half-time sets possession to game-start pulling team', () => {
    let session = makeSession('A')
    // Simulate 8 goals (assume halfTimeAt is 8 from MOCK_GAMES)
    session = appendEvents(session, [
      startPoint(0),
      { pointIndex: 0, type: 'goal', playerId: 14, teamId: 'B' },
      { pointIndex: 1, type: 'half-time' },
    ])
    const state = deriveGameState(session)
    expect(state.gamePhase).toBe('half-time')
    expect(state.possession).toBe('A')   // A pulled first → A receives in 2nd half
    expect(state.attackLeft).toBe('A')
  })

  it('end-game makes phase game-over', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),
      { pointIndex: 0, type: 'goal', playerId: 14, teamId: 'B' },
      { pointIndex: 1, type: 'end-game' },
    ])
    const state = deriveGameState(session)
    expect(state.gamePhase).toBe('game-over')
  })

  it('undo reverses a goal correctly', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },
      { pointIndex: 0, type: 'possession', playerId: 14, teamId: 'B' },
      { pointIndex: 0, type: 'goal', playerId: 14, teamId: 'B' },
      { pointIndex: 0, type: 'undo' },
    ])
    const state = deriveGameState(session)
    expect(state.score).toEqual({ A: 0, B: 0 })
    expect(state.gamePhase).toBe('in-play')
    expect(state.possession).toBe('B')
    expect(state.discHolder).toBe(14)
  })

  it('event ids are monotonic and assigned by appendEvents', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },
    ])
    expect(session.rawLog[0].id).toBe(1)
    expect(session.rawLog[1].id).toBe(2)
    session = appendEvents(session, [{ pointIndex: 0, type: 'undo' }])
    expect(session.rawLog[2].id).toBe(3)
  })
})

// ─── canRecord ────────────────────────────────────────────────────────────────

describe('canRecord', () => {
  it('blocks pull when not in awaiting-pull phase', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },
    ])
    const state = deriveGameState(session)
    expect(canRecord(state, 'pull')).toBe(false)
  })

  it('allows pull in awaiting-pull phase', () => {
    let session = makeSession('A')
    session = appendEvents(session, [startPoint(0)])
    const state = deriveGameState(session)
    expect(canRecord(state, 'pull')).toBe(true)
  })

  it('blocks goal when no disc holder', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },
    ])
    const state = deriveGameState(session)
    expect(canRecord(state, 'goal')).toBe(false)
  })

  it('allows goal when disc holder is set in-play', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },
      { pointIndex: 0, type: 'possession', playerId: 14, teamId: 'B' },
    ])
    const state = deriveGameState(session)
    expect(canRecord(state, 'goal')).toBe(true)
  })

  it('blocks new events after end-game', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),
      { pointIndex: 0, type: 'goal', playerId: 14, teamId: 'B' },
      { pointIndex: 1, type: 'end-game' },
    ])
    const state = deriveGameState(session)
    expect(canRecord(state, 'pull')).toBe(false)
    expect(canRecord(state, 'goal')).toBe(false)
    expect(canRecord(state, 'half-time')).toBe(false)
  })

  it('truncate is always recordable', () => {
    let session = makeSession('A')
    expect(canRecord(deriveGameState(session), 'truncate')).toBe(true)
    session = appendEvents(session, [
      startPoint(0),
      { pointIndex: 0, type: 'goal', playerId: 14, teamId: 'B' },
      { pointIndex: 1, type: 'end-game' },
    ])
    expect(canRecord(deriveGameState(session), 'truncate')).toBe(true)
  })
})

// ─── truncate ─────────────────────────────────────────────────────────────────

describe('truncate', () => {
  it('drops every entry whose id > truncateAfterId in computeVisLog', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),                                                   // id 1
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },       // id 2
      { pointIndex: 0, type: 'possession', playerId: 14, teamId: 'B' },// id 3
      { pointIndex: 0, type: 'possession', playerId: 15, teamId: 'B' },// id 4
    ])
    session = appendEvents(session, [{ pointIndex: 0, type: 'truncate', truncateAfterId: 2 }])
    const vis = computeVisLog(session.rawLog)
    expect(vis.map(e => e.id)).toEqual([1, 2])
  })

  it('events appended after the truncate remain visible', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),                                                   // id 1
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },       // id 2
      { pointIndex: 0, type: 'possession', playerId: 14, teamId: 'B' },// id 3
    ])
    session = appendEvents(session, [
      { pointIndex: 0, type: 'truncate', truncateAfterId: 2 },         // id 4
      { pointIndex: 0, type: 'possession', playerId: 15, teamId: 'B' },// id 5
    ])
    const vis = computeVisLog(session.rawLog)
    expect(vis.map(e => e.id)).toEqual([1, 2, 5])
  })

  it('truncate itself never appears in the visible log', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },
      { pointIndex: 0, type: 'truncate', truncateAfterId: 2 },
    ])
    const vis = computeVisLog(session.rawLog)
    expect(vis.some(e => (e as { type: string }).type === 'truncate')).toBe(false)
  })

  it('deriveGameState over [E1, E2, E3, truncate(2), E5] equals direct derivation of [E1, E2, E5]', () => {
    // Build a session up to a goal, truncate back to the pull, then record a
    // different subsequent possession + goal — the resulting state should
    // match what we'd get by recording just the kept events from the start.
    let withTruncate = makeSession('A')
    withTruncate = appendEvents(withTruncate, [
      startPoint(0),                                                    // 1
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },        // 2
      { pointIndex: 0, type: 'possession', playerId: 14, teamId: 'B' }, // 3 ← gets dropped
      { pointIndex: 0, type: 'goal',       playerId: 14, teamId: 'B' }, // 4 ← gets dropped
    ])
    withTruncate = appendEvents(withTruncate, [
      { pointIndex: 0, type: 'truncate', truncateAfterId: 2 },          // 5
      { pointIndex: 0, type: 'possession', playerId: 15, teamId: 'B' }, // 6
    ])

    let direct = makeSession('A')
    direct = appendEvents(direct, [
      startPoint(0),
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },
      { pointIndex: 0, type: 'possession', playerId: 15, teamId: 'B' },
    ])

    const a = deriveGameState(withTruncate)
    const b = deriveGameState(direct)
    expect(a.gamePhase).toBe(b.gamePhase)
    expect(a.score).toEqual(b.score)
    expect(a.possession).toBe(b.possession)
    expect(a.discHolder).toBe(b.discHolder)
    expect(a.pointIndex).toBe(b.pointIndex)
  })

  it('truncate is a no-op when no entries are past the cursor', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },
      { pointIndex: 0, type: 'truncate', truncateAfterId: 999 },
    ])
    const vis = computeVisLog(session.rawLog)
    expect(vis.map(e => e.type)).toEqual(['point-start', 'pull'])
  })
})

// ─── splice-block ─────────────────────────────────────────────────────────────

function buildSplice(args: {
  id: number
  afterEventId: number
  removeFromId?: number | null
  removeToId?:   number | null
  events: RawEvent[]
}): SpliceBlockRawEvent {
  return {
    id: args.id,
    timestamp: 0,
    pointIndex: 0,
    type: 'splice-block',
    afterEventId: args.afterEventId,
    removeFromId: args.removeFromId ?? null,
    removeToId:   args.removeToId   ?? null,
    events: args.events,
  }
}

describe('splice-block resolution', () => {
  it('pure insert (paste): events appear after anchor in the resolved log', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),                                                    // 1
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },        // 2
      { pointIndex: 0, type: 'possession', playerId: 14, teamId: 'B' }, // 3
    ])
    // Splice in a possession after id 3 (extra pass to id 15).
    const inner: RawEvent = {
      id: 100, timestamp: 0, pointIndex: 0,
      type: 'possession', playerId: 15, teamId: 'B',
    }
    const splice = buildSplice({ id: 200, afterEventId: 3, events: [inner] })
    const vis = computeVisLog([...session.rawLog, splice])
    expect(vis.map(e => e.id)).toEqual([1, 2, 3, 100])
    expect((vis[3] as { playerId: number }).playerId).toBe(15)
  })

  it('replace: drops range entries and inserts new ones', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),                                                    // 1
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },        // 2
      { pointIndex: 0, type: 'possession', playerId: 14, teamId: 'B' }, // 3
      { pointIndex: 0, type: 'possession', playerId: 15, teamId: 'B' }, // 4
      { pointIndex: 0, type: 'possession', playerId: 16, teamId: 'B' }, // 5
    ])
    const inner: RawEvent = {
      id: 100, timestamp: 0, pointIndex: 0,
      type: 'possession', playerId: 17, teamId: 'B',
    }
    const splice = buildSplice({
      id: 200, afterEventId: 2, removeFromId: 3, removeToId: 5, events: [inner],
    })
    const vis = computeVisLog([...session.rawLog, splice])
    expect(vis.map(e => e.id)).toEqual([1, 2, 100])
    expect((vis[2] as { playerId: number }).playerId).toBe(17)
  })

  it('delete: range removed with no inner events', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),                                                    // 1
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },        // 2
      { pointIndex: 0, type: 'possession', playerId: 14, teamId: 'B' }, // 3
      { pointIndex: 0, type: 'possession', playerId: 15, teamId: 'B' }, // 4
    ])
    const splice = buildSplice({
      id: 200, afterEventId: 2, removeFromId: 3, removeToId: 4, events: [],
    })
    const vis = computeVisLog([...session.rawLog, splice])
    expect(vis.map(e => e.id)).toEqual([1, 2])
  })

  it('corrupt anchor (id not found): splice is dropped silently', () => {
    let session = makeSession('A')
    session = appendEvents(session, [startPoint(0)])
    const splice = buildSplice({ id: 200, afterEventId: 9999, events: [] })
    const vis = computeVisLog([...session.rawLog, splice])
    expect(vis.map(e => e.id)).toEqual([1])
  })

  it('deriveGameState reflects spliced events', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),                                                    // 1
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },        // 2
    ])
    const inner: RawEvent[] = [
      { id: 100, timestamp: 0, pointIndex: 0, type: 'possession', playerId: 14, teamId: 'B' },
      { id: 101, timestamp: 0, pointIndex: 0, type: 'goal',       playerId: 14, teamId: 'B' },
    ]
    const splice = buildSplice({ id: 200, afterEventId: 2, events: inner })
    const state = deriveGameState({ ...session, rawLog: [...session.rawLog, splice] })
    expect(state.score).toEqual({ A: 0, B: 1 })
    expect(state.gamePhase).toBe('point-over')
  })
})

describe('validateSpliceBlock', () => {
  function basePulled(): GameSession {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),                                                    // 1
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },        // 2
      { pointIndex: 0, type: 'possession', playerId: 14, teamId: 'B' }, // 3
      { pointIndex: 0, type: 'possession', playerId: 15, teamId: 'B' }, // 4
      { pointIndex: 0, type: 'possession', playerId: 16, teamId: 'B' }, // 5
    ])
    return session
  }

  it('accepts a valid mid-point insert (extra pass)', () => {
    const session = basePulled()
    const inner: RawEvent = {
      id: 100, timestamp: 0, pointIndex: 0,
      type: 'possession', playerId: 17, teamId: 'B',
    }
    const splice = buildSplice({ id: 200, afterEventId: 4, events: [inner] })
    expect(validateSpliceBlock(session, splice)).toEqual({ ok: true })
  })

  it('rejects a pull mid-play', () => {
    const session = basePulled()
    const inner: RawEvent = {
      id: 100, timestamp: 0, pointIndex: 0,
      type: 'pull', playerId: 1, teamId: 'A',
    }
    const splice = buildSplice({ id: 200, afterEventId: 4, events: [inner] })
    const result = validateSpliceBlock(session, splice)
    expect(result.ok).toBe(false)
    expect((result as { reason: string }).reason).toMatch(/cannot record pull/)
  })

  it('rejects wrong-team puller after a goal', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),                                                    // 1
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },        // 2
      { pointIndex: 0, type: 'possession', playerId: 14, teamId: 'B' }, // 3
      { pointIndex: 0, type: 'goal',       playerId: 14, teamId: 'B' }, // 4
    ])
    // After B scored, B should pull next. A illegal-puller event would fail.
    const inner: RawEvent = {
      id: 100, timestamp: 0, pointIndex: 1,
      type: 'pull', playerId: 1, teamId: 'A',
    }
    // Need a point-start event between goal and pull. Use a fresh point-start
    // so the splice anchors after the goal to begin a new point.
    const psInner: RawEvent = {
      id: 99, timestamp: 0, pointIndex: 1,
      type: 'point-start', lineA: LINE_A_IDS, lineB: LINE_B_IDS,
    }
    const splice = buildSplice({ id: 200, afterEventId: 4, events: [psInner, inner] })
    const result = validateSpliceBlock(session, splice)
    expect(result.ok).toBe(false)
    expect((result as { reason: string }).reason).toMatch(/pulling team mismatch/)
  })

  it('accepts a valid splice at end (no trailing tail)', () => {
    const session = basePulled()
    // After id 5, in-play, B has disc. A goal by 16 is legal.
    const inner: RawEvent = {
      id: 100, timestamp: 0, pointIndex: 0,
      type: 'goal', playerId: 16, teamId: 'B',
    }
    const splice = buildSplice({ id: 200, afterEventId: 5, events: [inner] })
    expect(validateSpliceBlock(session, splice)).toEqual({ ok: true })
  })

  it('rejects replace that breaks trailing possession', () => {
    // Replace mid-chain with a turnover — that flips possession to A.
    // The trailing possession-by-B event becomes inconsistent.
    const inner: RawEvent = {
      id: 100, timestamp: 0, pointIndex: 0,
      type: 'turnover-throw-away', playerId: 14, teamId: 'B',
    }
    let s2 = makeSession('A')
    s2 = appendEvents(s2, [
      startPoint(0),                                                    // 1
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },        // 2
      { pointIndex: 0, type: 'possession', playerId: 14, teamId: 'B' }, // 3
      { pointIndex: 0, type: 'possession', playerId: 15, teamId: 'B' }, // 4
      { pointIndex: 0, type: 'possession', playerId: 16, teamId: 'B' }, // 5
    ])
    const splice = buildSplice({
      id: 200, afterEventId: 3, removeFromId: 4, removeToId: 4, events: [inner],
    })
    const result = validateSpliceBlock(s2, splice)
    expect(result.ok).toBe(false)
    expect((result as { reason: string }).reason).toMatch(/possession team mismatch|cannot continue/i)
  })
})

// ─── Unknown turnover ──────────────────────────────────────────────────────────

describe('turnover-unknown', () => {
  it('flips possession and clears discHolder like any turnover', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' },
      { pointIndex: 0, type: 'possession', playerId: 14, teamId: 'B' },
      { pointIndex: 0, type: 'turnover-unknown', playerId: 14, teamId: 'B' },
    ])
    const state = deriveGameState(session)
    expect(state.possession).toBe('A')
    expect(state.discHolder).toBeNull()
  })

  it('is recordable in-play even without a disc holder', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      startPoint(0),
      { pointIndex: 0, type: 'pull', playerId: 1, teamId: 'A' }, // dead disc, no holder
    ])
    const state = deriveGameState(session)
    expect(state.discHolder).toBeNull()
    expect(canRecord(state, 'turnover-unknown')).toBe(true)
    // A regular throw-away still needs a holder.
    expect(canRecord(state, 'turnover-throw-away')).toBe(false)
  })
})

// ─── Resume from score ─────────────────────────────────────────────────────────

describe('score-resume', () => {
  it('sets score, pointIndex and hands the disc to the offence team', () => {
    let session = makeSession('A')
    session = appendEvents(session, [
      { pointIndex: 0, type: 'score-resume', scoreA: 5, scoreB: 3, offenceTeam: 'B' },
    ])
    const state = deriveGameState(session)
    expect(state.score).toEqual({ A: 5, B: 3 })
    expect(state.pointIndex).toBe(8)
    expect(state.possession).toBe('B')
    expect(state.gamePhase).toBe('point-over')
  })

  it('is recordable before the first pull and between points', () => {
    const fresh = deriveGameState(makeSession('A'))
    expect(fresh.gamePhase).toBe('pre-game')
    expect(canRecord(fresh, 'score-resume')).toBe(true)
  })
})
