import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGameStore } from '../store'
import { MOCK_GAMES } from '../data'
import { computeVisLog, deriveGameState } from '../engine'
import { tryParse, serialize, buildEnvelope } from '../clipboard'
import type { ClipboardEnvelope } from '../clipboard'

// The store is a singleton; reset to a known fresh state before each case.
function resetAndStartGame() {
  useGameStore.setState({ session: null, truncateCursor: null, selPuller: null, uiMode: 'idle' })
  useGameStore.getState().selectGame(MOCK_GAMES[0].id, 'A')
  // Confirm the first line so we land in awaiting-pull and can record events.
  const rosterA = MOCK_GAMES[0].rosters.A.slice(0, 7)
  const rosterB = MOCK_GAMES[0].rosters.B.slice(0, 7)
  useGameStore.getState().confirmLine(rosterA, rosterB)
}

describe('truncateCursor flow through recordVia', () => {
  beforeEach(resetAndStartGame)

  it('with cursor null: tap records only the new event', () => {
    const { tapPlayer, recordPull, session } = useGameStore.getState()
    if (!session) throw new Error('no session')
    // Pull → in-play
    const puller = MOCK_GAMES[0].rosters.A[0]
    useGameStore.setState({ selPuller: puller.id })
    recordPull(false)
    // Tap a B player → records possession
    const receiver = MOCK_GAMES[0].rosters.B[0]
    tapPlayer(receiver)

    const tail = useGameStore.getState().session!.rawLog
    expect(tail[tail.length - 1].type).toBe('possession')
    // No truncate event should be present anywhere.
    expect(tail.some(e => e.type === 'truncate')).toBe(false)
  })

  it('with cursor set: tap commits [truncate, possession] and clears the cursor', () => {
    // Build: point-start, pull, possession(B[0]), possession(B[1])
    const puller = MOCK_GAMES[0].rosters.A[0]
    useGameStore.setState({ selPuller: puller.id })
    useGameStore.getState().recordPull(false)

    const b0 = MOCK_GAMES[0].rosters.B[0]
    const b1 = MOCK_GAMES[0].rosters.B[1]
    useGameStore.getState().tapPlayer(b0)
    useGameStore.getState().tapPlayer(b1)

    const beforeLog = useGameStore.getState().session!.rawLog
    const afterB0Id = beforeLog.find(e => e.type === 'possession' && (e as { playerId: number }).playerId === b0.id)!.id

    // Set cursor to the moment after B[0]'s possession (B[1]'s possession is past the cursor).
    useGameStore.getState().setTruncateCursor(afterB0Id)
    expect(useGameStore.getState().truncateCursor).toBe(afterB0Id)

    // Tap a different player — should commit [truncate(afterB0Id), possession(b2)] and clear cursor.
    const b2 = MOCK_GAMES[0].rosters.B[2]
    useGameStore.getState().tapPlayer(b2)

    const afterLog = useGameStore.getState().session!.rawLog
    const tail2 = afterLog.slice(-2)
    expect(tail2[0].type).toBe('truncate')
    expect((tail2[0] as { truncateAfterId: number }).truncateAfterId).toBe(afterB0Id)
    expect(tail2[1].type).toBe('possession')
    expect((tail2[1] as { playerId: number }).playerId).toBe(b2.id)

    expect(useGameStore.getState().truncateCursor).toBeNull()
  })

  it('pick-mode triggers clear the cursor', () => {
    const puller = MOCK_GAMES[0].rosters.A[0]
    useGameStore.setState({ selPuller: puller.id })
    useGameStore.getState().recordPull(false)
    const b0 = MOCK_GAMES[0].rosters.B[0]
    useGameStore.getState().tapPlayer(b0)

    useGameStore.getState().setTruncateCursor(useGameStore.getState().session!.rawLog[0].id)
    expect(useGameStore.getState().truncateCursor).not.toBeNull()

    useGameStore.getState().triggerDefBlock('block')
    expect(useGameStore.getState().truncateCursor).toBeNull()
    expect(useGameStore.getState().uiMode).toBe('block-pick')
  })
})

describe('segment identity', () => {
  it('selectGame stamps a fresh segment carrying the device scorerId', () => {
    const { scorerId } = useGameStore.getState()
    useGameStore.getState().selectGame(MOCK_GAMES[0].id, 'A')
    const seg = useGameStore.getState().session!.segment
    expect(seg.segmentId).toMatch(/^seg_/)
    expect(seg.scorerId).toBe(scorerId)
    expect(seg.createdAt).toBeGreaterThan(0)
    // A from-the-start recording has no anchor.
    expect(seg.anchor).toBeUndefined()
  })

  it('each game selection gets a distinct segmentId, same scorerId', () => {
    useGameStore.getState().selectGame(MOCK_GAMES[0].id, 'A')
    const first = useGameStore.getState().session!.segment
    useGameStore.getState().selectGame(MOCK_GAMES[0].id, 'A')
    const second = useGameStore.getState().session!.segment
    expect(second.segmentId).not.toBe(first.segmentId)
    expect(second.scorerId).toBe(first.scorerId)
  })

  it('startSegmentFromScore opens an anchored segment derived at the given score', () => {
    useGameStore.getState().startSegmentFromScore(MOCK_GAMES[0].id, 8, 6, 'A')
    const session = useGameStore.getState().session!
    expect(session.segment.anchor).toEqual({ scoreA: 8, scoreB: 6, offence: 'A' })
    expect(session.rawLog).toHaveLength(0)         // anchor lives on the segment, not the log
    const state = deriveGameState(session)
    expect(state.score).toEqual({ A: 8, B: 6 })
    expect(state.possession).toBe('A')             // offence receives
    expect(state.pointIndex).toBe(14)
    expect(useGameStore.getState().screen).toBe('line-selection')
  })

  it('forkSegment copies the prefix into a new segment pointing at its parent', () => {
    resetAndStartGame()                            // a session with a point-start logged
    const parent = useGameStore.getState().session!
    const parentId = parent.segment.segmentId
    const parentLogLen = parent.rawLog.length
    expect(parentLogLen).toBeGreaterThan(0)

    useGameStore.getState().forkSegment()
    const fork = useGameStore.getState().session!
    expect(fork.segment.segmentId).not.toBe(parentId)
    expect(fork.segment.parentSegmentId).toBe(parentId)
    expect(fork.segment.scorerId).toBe(parent.segment.scorerId)
    // Prefix copied verbatim, but it's a fresh array (not the same reference).
    expect(fork.rawLog).toHaveLength(parentLogLen)
    expect(fork.rawLog).not.toBe(parent.rawLog)
    expect(fork.rawLog.map(e => e.id)).toEqual(parent.rawLog.map(e => e.id))
    // The fork derives the same state as the parent did.
    expect(deriveGameState(fork)).toEqual(deriveGameState(parent))
  })
})

