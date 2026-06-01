import { describe, it, expect } from 'vitest'
import { detectLogPatterns } from '../patterns'
import type { VisLogEntry, RawEvent } from '../types'

let counter = 0
function ev(partial: Omit<RawEvent, 'id' | 'timestamp'> & { pointIndex?: number }): VisLogEntry {
  return { id: ++counter, timestamp: 0, pointIndex: 0, ...partial } as VisLogEntry
}

describe('detectLogPatterns — Callahan', () => {
  it('flags an intercept immediately followed by a goal from the same team', () => {
    const log: VisLogEntry[] = [
      ev({ type: 'point-start', lineA: [], lineB: [] }),
      ev({ type: 'pull', playerId: 1, teamId: 'A' }),
      ev({ type: 'possession', playerId: 14, teamId: 'B' }),
      ev({ type: 'intercept', playerId: 2, teamId: 'A' }),
      ev({ type: 'goal', playerId: 2, teamId: 'A' }),
    ]
    const patterns = detectLogPatterns(log)
    const goal = log[log.length - 1]
    expect(patterns.get(goal.id)?.label).toBe('CALLAHAN')
  })

  it('ignores muted entries (possession) between the intercept and the goal', () => {
    const log: VisLogEntry[] = [
      ev({ type: 'intercept', playerId: 2, teamId: 'A' }),
      ev({ type: 'possession', playerId: 2, teamId: 'A' }),
      ev({ type: 'goal', playerId: 3, teamId: 'A' }),
    ]
    const goal = log[log.length - 1]
    expect(detectLogPatterns(log).get(goal.id)?.label).toBe('CALLAHAN')
  })

  it('does not flag a plain goal with no preceding intercept', () => {
    const log: VisLogEntry[] = [
      ev({ type: 'possession', playerId: 14, teamId: 'B' }),
      ev({ type: 'goal', playerId: 14, teamId: 'B' }),
    ]
    expect(detectLogPatterns(log).size).toBe(0)
  })

  it('does not flag when the goal is by the other team', () => {
    const log: VisLogEntry[] = [
      ev({ type: 'intercept', playerId: 2, teamId: 'A' }),
      ev({ type: 'turnover-throw-away', playerId: 2, teamId: 'A' }),
      ev({ type: 'goal', playerId: 14, teamId: 'B' }),
    ]
    expect(detectLogPatterns(log).size).toBe(0)
  })
})
