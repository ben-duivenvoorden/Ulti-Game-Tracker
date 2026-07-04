import { describe, it, expect } from 'vitest'
import { buildMatcher } from '../voice/match'
import { parseNarration, matchLineCall, type ParseContext } from '../voice/parse'

// Team A on offence: Ben, Sam, Alice. Team B defending: Kim, Dana.
const ROSTER = [
  { id: 1, name: 'Ben Duivenvoorden', spokenAliases: ['Bennie'] },
  { id: 2, name: 'Sam Kooistra',      spokenAliases: [] },
  { id: 3, name: 'Alice de Vries',    spokenAliases: [] },
  { id: 4, name: 'Kim Park',          spokenAliases: [] },
  { id: 5, name: 'Dana Wu',           spokenAliases: [] },
]
const TEAM_OF: Record<number, 'A' | 'B'> = { 1: 'A', 2: 'A', 3: 'A', 4: 'B', 5: 'B' }

const matcher = buildMatcher(ROSTER)

const ctx = (over: Partial<ParseContext> = {}): ParseContext => ({
  pointIndex: 3,
  possession: 'A',
  discHolder: null,
  teamOf: id => TEAM_OF[id] ?? null,
  passes: true,
  stall: false,
  ...over,
})

const types   = (r: { events: { input: { type: string } }[] }) => r.events.map(e => e.input.type)
const players = (r: { events: { input: { type: string; playerId?: number } }[] }) =>
  r.events.map(e => e.input.playerId)

describe('parseNarration — pass chains and goals', () => {
  it('"Sam to Ben to Alice, score" → possession ×3 + goal(Alice)', () => {
    const r = parseNarration(['Sam', 'to', 'Ben', 'to', 'Alice', 'score'], matcher, ctx())
    expect(types(r)).toEqual(['possession', 'possession', 'possession', 'goal'])
    expect(players(r)).toEqual([2, 1, 3, 3])
    expect(r.events.every(e => e.input.type === 'goal' || (e.input as { teamId: string }).teamId === 'A')).toBe(true)
    expect(r.issues).toEqual([])
  })

  it('bare "score" applies to the current holder', () => {
    const r = parseNarration(['score'], matcher, ctx({ discHolder: 2 }))
    expect(types(r)).toEqual(['goal'])
    expect(players(r)).toEqual([2])
  })

  it('bare "score" with no holder is an issue, not an event', () => {
    const r = parseNarration(['score'], matcher, ctx())
    expect(r.events).toEqual([])
    expect(r.issues.length).toBeGreaterThan(0)
  })

  it('passes off: goal still gets its holder-setting possession', () => {
    const r = parseNarration(['Sam', 'to', 'Ben', 'to', 'Alice', 'goal'], matcher, ctx({ passes: false }))
    expect(types(r)).toEqual(['possession', 'goal'])
    expect(players(r)).toEqual([3, 3])
  })

  it('chain without an outcome is just possessions', () => {
    const r = parseNarration(['Sam', 'to', 'Ben'], matcher, ctx())
    expect(types(r)).toEqual(['possession', 'possession'])
  })

  it('does not re-record the existing holder', () => {
    const r = parseNarration(['Sam', 'to', 'Ben'], matcher, ctx({ discHolder: 2 }))
    expect(types(r)).toEqual(['possession'])
    expect(players(r)).toEqual([1])
  })
})

describe('parseNarration — turnovers', () => {
  it('"Alice drop" → possession(Alice) + receiver-error(Alice)', () => {
    const r = parseNarration(['Alice', 'drop'], matcher, ctx())
    expect(types(r)).toEqual(['possession', 'turnover-receiver-error'])
    expect(players(r)).toEqual([3, 3])
  })

  it('"Ben throw away" folds the bigram → throw-away(Ben)', () => {
    const r = parseNarration(['Ben', 'throw', 'away'], matcher, ctx())
    expect(types(r)).toEqual(['possession', 'turnover-throw-away'])
    expect(players(r)).toEqual([1, 1])
  })

  it('"Ben throwaway" single token works too', () => {
    const r = parseNarration(['Ben', 'throwaway'], matcher, ctx())
    expect(types(r)).toEqual(['possession', 'turnover-throw-away'])
  })

  it('stall is skipped with an issue when the option is off', () => {
    const r = parseNarration(['Ben', 'stall'], matcher, ctx({ stall: false }))
    expect(types(r)).toEqual(['possession'])
    expect(r.issues.some(i => i.includes('Stall'))).toBe(true)
  })

  it('stall records when the option is on', () => {
    const r = parseNarration(['Ben', 'stall'], matcher, ctx({ stall: true }))
    expect(types(r)).toEqual(['possession', 'turnover-stall'])
  })

  it('possession flips after a turnover: defence can then chain', () => {
    const r = parseNarration(['Ben', 'drop', 'Kim', 'to', 'Dana', 'score'], matcher, ctx())
    expect(types(r)).toEqual([
      'possession', 'turnover-receiver-error',   // A
      'possession', 'possession', 'goal',        // B after the turn
    ])
    const goal = r.events[4].input as { teamId: string; playerId: number }
    expect(goal.teamId).toBe('B')
    expect(goal.playerId).toBe(5)
  })
})

describe('parseNarration — defensive plays', () => {
  it('"Kim D" with a holder → block(Kim), possession flips', () => {
    const r = parseNarration(['Kim', 'D'], matcher, ctx({ discHolder: 1 }))
    expect(types(r)).toEqual(['block'])
    const block = r.events[0].input as { teamId: string; playerId: number }
    expect(block.playerId).toBe(4)
    expect(block.teamId).toBe('B')
  })

  it('"Sam to Ben, Kim D" → chain possessions then block', () => {
    const r = parseNarration(['Sam', 'to', 'Ben', 'Kim', 'D'], matcher, ctx())
    expect(types(r)).toEqual(['possession', 'possession', 'block'])
    expect(players(r)).toEqual([2, 1, 4])
  })

  it('"Kim callahan" → intercept(Kim) who then scores as new holder', () => {
    const r = parseNarration(['Kim', 'callahan', 'score'], matcher, ctx({ discHolder: 1 }))
    expect(types(r)).toEqual(['intercept', 'goal'])
    const goal = r.events[1].input as { teamId: string; playerId: number }
    expect(goal.playerId).toBe(4)
    expect(goal.teamId).toBe('B')
  })

  it('an offensive player named as the defender is an issue', () => {
    const r = parseNarration(['Sam', 'D'], matcher, ctx({ discHolder: 1 }))
    expect(types(r)).toEqual([])
    expect(r.issues.some(i => i.includes('offence'))).toBe(true)
  })
})

describe('parseNarration — unknown tokens', () => {
  it('surfaces unmatched words instead of dropping them silently', () => {
    const r = parseNarration(['Sam', 'to', 'Zorblax', 'score'], matcher, ctx())
    expect(r.unmatched).toEqual(['Zorblax'])
    expect(r.issues.some(i => i.includes('Zorblax'))).toBe(true)
    // Sam still chains; the goal lands on the last *matched* player.
    expect(types(r)).toEqual(['possession', 'goal'])
  })
})

describe('matchLineCall — line mode', () => {
  it('matches a run of names and dedupes stutters', () => {
    const r = matchLineCall(['Ben', 'Sam', 'Alice', 'Sam'], matcher)
    expect(r.matches.map(m => m.playerId)).toEqual([1, 2, 3])
    expect(r.unmatched).toEqual([])
  })

  it('nicknames resolve and unknowns surface', () => {
    const r = matchLineCall(['Bennie', 'Zorblax'], matcher)
    expect(r.matches.map(m => m.playerId)).toEqual([1])
    expect(r.unmatched).toEqual(['Zorblax'])
  })
})
