import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGameStore } from '../store'
import { MOCK_GAMES } from '../data'
import { computeVisLog } from '../engine'
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

