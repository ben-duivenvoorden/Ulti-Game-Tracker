import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from '../store'
import { computeVisLog, deriveGameState } from '../engine'
import { EMPIRE_VS_BREEZE_GAME_ADD, MOCK_GAMES } from './fixtures'

// The fixture game is no longer part of the production seed — install it in
// the store's scheduledGamesLog so selectGame can resolve it.
beforeEach(() => {
  const { scheduledGamesLog } = useGameStore.getState()
  if (!scheduledGamesLog.some(e => e.type === 'game-add' && e.gameId === MOCK_GAMES[0].id)) {
    useGameStore.setState({ scheduledGamesLog: [...scheduledGamesLog, EMPIRE_VS_BREEZE_GAME_ADD] })
  }
})

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

describe('recordVoiceEvents', () => {
  beforeEach(resetAndStartGame)

  // Voice auto-applies per pause segment with no confirm step, so this
  // action is the only gate between the parser and the rawLog.

  /** Land in-play: A pulls, B receives. */
  function recordPullFirst() {
    const puller = MOCK_GAMES[0].rosters.A[0]
    useGameStore.setState({ selPuller: puller.id })
    useGameStore.getState().recordPull(false)
  }

  it('commits a valid batch in one append; a trailing goal routes to point-summary', () => {
    recordPullFirst()
    const state = deriveGameState(useGameStore.getState().session!)
    const [b0, b1] = MOCK_GAMES[0].rosters.B
    const before = useGameStore.getState().session!.rawLog.length

    const ok = useGameStore.getState().recordVoiceEvents([
      { pointIndex: state.pointIndex, type: 'possession', playerId: b0.id, teamId: 'B' },
      { pointIndex: state.pointIndex, type: 'possession', playerId: b1.id, teamId: 'B' },
      { pointIndex: state.pointIndex, type: 'goal',       playerId: b1.id, teamId: 'B' },
    ])

    expect(ok).toBe(true)
    const log = useGameStore.getState().session!.rawLog
    expect(log.length).toBe(before + 3)
    expect(log.slice(-3).map(e => e.type)).toEqual(['possession', 'possession', 'goal'])
    expect(useGameStore.getState().screen).toBe('point-summary')
  })

  it('rejects the whole batch when any event fails canRecord — nothing is appended', () => {
    recordPullFirst()
    const state = deriveGameState(useGameStore.getState().session!)
    const b0 = MOCK_GAMES[0].rosters.B[0]
    const a0 = MOCK_GAMES[0].rosters.A[0]
    const before = useGameStore.getState().session!.rawLog.length

    // A pull is not recordable while in-play — the batch must die whole,
    // including the valid possession ahead of it.
    const ok = useGameStore.getState().recordVoiceEvents([
      { pointIndex: state.pointIndex, type: 'possession', playerId: b0.id, teamId: 'B' },
      { pointIndex: state.pointIndex, type: 'pull',       playerId: a0.id, teamId: 'A' },
    ])

    expect(ok).toBe(false)
    expect(useGameStore.getState().session!.rawLog.length).toBe(before)
  })

  it('applies a batch containing a spoken undo', () => {
    recordPullFirst()
    const state = deriveGameState(useGameStore.getState().session!)
    const b0 = MOCK_GAMES[0].rosters.B[0]

    const ok = useGameStore.getState().recordVoiceEvents([
      { pointIndex: state.pointIndex, type: 'possession', playerId: b0.id, teamId: 'B' },
      { pointIndex: state.pointIndex, type: 'undo' },
    ])

    expect(ok).toBe(true)
    // The undo pops the possession it followed — the last visible entry is
    // the pull again.
    const vis = computeVisLog(useGameStore.getState().session!.rawLog)
    expect(vis[vis.length - 1].type).toBe('pull')
  })
})

describe('resumeFromScore', () => {
  beforeEach(resetAndStartGame)

  // MOCK_GAMES[0] (Empire vs Breeze) has halfTimeAt = 8.
  it('records the resume and lands on line selection', () => {
    useGameStore.getState().resumeFromScore(5, 3, 'A')
    const vis = computeVisLog(useGameStore.getState().session!.rawLog)
    const resume = vis.find(e => e.type === 'score-resume')
    expect(resume).toBeTruthy()
    expect(useGameStore.getState().screen).toBe('line-selection')
  })

  it('does NOT insert half-time at 5–3 (neither team has reached 8)', () => {
    useGameStore.getState().resumeFromScore(5, 3, 'A')
    const vis = computeVisLog(useGameStore.getState().session!.rawLog)
    expect(vis.some(e => e.type === 'half-time')).toBe(false)
  })

  it('auto-inserts half-time when a team reaches the half-time threshold', () => {
    useGameStore.getState().resumeFromScore(8, 2, 'B')
    const vis = computeVisLog(useGameStore.getState().session!.rawLog)
    const htIdx = vis.findIndex(e => e.type === 'half-time')
    const resIdx = vis.findIndex(e => e.type === 'score-resume')
    expect(htIdx).toBeGreaterThanOrEqual(0)
    // Half-time must precede the score-resume so orientation stays correct.
    expect(htIdx).toBeLessThan(resIdx)
  })
})

describe('segment identity', () => {
  it('selectGame stamps a fresh segment carrying the device scorerId + deviceId', () => {
    const { scorerId, deviceId } = useGameStore.getState()
    useGameStore.getState().selectGame(MOCK_GAMES[0].id, 'A')
    const seg = useGameStore.getState().session!.segment
    expect(seg.segmentId).toMatch(/^seg_/)
    expect(seg.scorerId).toBe(scorerId)
    expect(seg.deviceId).toBe(deviceId)
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
    expect(fork.segment.deviceId).toBe(parent.segment.deviceId)
    // Prefix copied verbatim, but it's a fresh array (not the same reference).
    expect(fork.rawLog).toHaveLength(parentLogLen)
    expect(fork.rawLog).not.toBe(parent.rawLog)
    expect(fork.rawLog.map(e => e.id)).toEqual(parent.rawLog.map(e => e.id))
    // The fork derives the same state as the parent did.
    expect(deriveGameState(fork)).toEqual(deriveGameState(parent))
  })
})

