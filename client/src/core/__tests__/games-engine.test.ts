import { beforeEach, describe, it, expect } from 'vitest'
import { competitionOverrides, deriveScheduledGames, deriveScheduledGamesState, resolveGameConfig } from '../games/engine'
import { deriveTeamsState } from '../teams/engine'
import type { ScheduledGameEvent } from '../games/types'
import type { TeamEvent } from '../teams/types'

let counter = 0
function ev(partial: Omit<ScheduledGameEvent, 'id' | 'timestamp'>): ScheduledGameEvent {
  return { id: ++counter, timestamp: 0, ...partial } as ScheduledGameEvent
}

beforeEach(() => { counter = 0 })

describe('deriveScheduledGames', () => {
  it('empty log returns empty list', () => {
    expect(deriveScheduledGames([])).toEqual([])
  })

  it('game-add materialises an active game with cancelled=false', () => {
    const log: ScheduledGameEvent[] = [
      ev({ type: 'game-add', gameId: 1, name: 'Final', scheduledTime: '12:00',
        teamAGlobalId: 1, teamBGlobalId: 2, halfTimeAt: 8, scoreCapAt: 15 }),
    ]
    const games = deriveScheduledGames(log)
    expect(games).toHaveLength(1)
    expect(games[0]).toMatchObject({ id: 1, name: 'Final', cancelled: false })
  })

  it('game-edit patches; missing fields untouched', () => {
    const log: ScheduledGameEvent[] = [
      ev({ type: 'game-add',  gameId: 1, name: 'Final', scheduledTime: '12:00',
        teamAGlobalId: 1, teamBGlobalId: 2, halfTimeAt: 8, scoreCapAt: 15 }),
      ev({ type: 'game-edit', gameId: 1, name: 'Championship Final' }),
      ev({ type: 'game-edit', gameId: 1, halfTimeAt: 10 }),
    ]
    const g = deriveScheduledGamesState(log).gamesById.get(1)!
    expect(g.name).toBe('Championship Final')
    expect(g.scheduledTime).toBe('12:00')
    expect(g.halfTimeAt).toBe(10)
    expect(g.scoreCapAt).toBe(15)
  })

  it('game-cancel hides from active list but keeps the byId lookup', () => {
    const log: ScheduledGameEvent[] = [
      ev({ type: 'game-add', gameId: 1, name: 'A', scheduledTime: '09:00',
        teamAGlobalId: 1, teamBGlobalId: 2, halfTimeAt: 8, scoreCapAt: 15 }),
      ev({ type: 'game-add', gameId: 2, name: 'B', scheduledTime: '11:00',
        teamAGlobalId: 1, teamBGlobalId: 2, halfTimeAt: 8, scoreCapAt: 15 }),
      ev({ type: 'game-cancel', gameId: 1 }),
    ]
    const s = deriveScheduledGamesState(log)
    expect(s.games.map(g => g.id)).toEqual([2])
    expect(s.gamesById.get(1)?.cancelled).toBe(true)
  })

  it('events targeting unknown gameIds are no-ops', () => {
    const log: ScheduledGameEvent[] = [
      ev({ type: 'game-edit',   gameId: 999, name: 'ghost' }),
      ev({ type: 'game-cancel', gameId: 999 }),
    ]
    expect(deriveScheduledGames(log)).toEqual([])
  })

  it('competition-add materialises competitions in insertion order; game-add/edit attach games', () => {
    const log: ScheduledGameEvent[] = [
      ev({ type: 'competition-add', competitionId: 1, name: 'BUML',   defaults: { pullBonus: false }, locked: [] }),
      ev({ type: 'competition-add', competitionId: 2, name: 'Parity', defaults: { pullBonus: true },  locked: ['pullBonus'] }),
      ev({ type: 'game-add', gameId: 1, name: 'A', scheduledTime: '09:00',
        teamAGlobalId: 1, teamBGlobalId: 2, halfTimeAt: 8, scoreCapAt: 15, competitionId: 2 }),
      ev({ type: 'game-add', gameId: 2, name: 'B', scheduledTime: '11:00',
        teamAGlobalId: 1, teamBGlobalId: 2, halfTimeAt: 8, scoreCapAt: 15 }),
      ev({ type: 'game-edit', gameId: 2, competitionId: 1 }),
    ]
    const s = deriveScheduledGamesState(log)
    expect(s.competitions.map(c => c.name)).toEqual(['BUML', 'Parity'])
    expect(s.gamesById.get(1)?.competitionId).toBe(2)
    expect(s.gamesById.get(2)?.competitionId).toBe(1)
  })

  it('competition-edit renames and replaces defaults/locked wholesale', () => {
    const log: ScheduledGameEvent[] = [
      ev({ type: 'competition-add', competitionId: 1, name: 'BUML',
        defaults: { pullBonus: false, abba: true }, locked: ['pullBonus'] }),
      ev({ type: 'competition-edit', competitionId: 1, name: 'BUML 2026' }),
      ev({ type: 'competition-edit', competitionId: 1, defaults: { stall: true }, locked: [] }),
      ev({ type: 'competition-edit', competitionId: 999, name: 'ghost' }),
    ]
    const c = deriveScheduledGamesState(log).competitionsById.get(1)!
    expect(c.name).toBe('BUML 2026')
    expect(c.defaults).toEqual({ stall: true })
    expect(c.locked).toEqual([])
  })
})

describe('competitionOverrides', () => {
  const log: ScheduledGameEvent[] = [
    { id: 1, timestamp: 0, type: 'competition-add', competitionId: 1, name: 'BUML',
      defaults: { pullBonus: false, abba: true }, locked: [] },
    { id: 2, timestamp: 0, type: 'competition-add', competitionId: 2, name: 'Parity',
      defaults: { pullBonus: true }, locked: ['pullBonus'] },
    { id: 3, timestamp: 0, type: 'game-add', gameId: 10, name: 'Plain', scheduledTime: '09:00',
      teamAGlobalId: 1, teamBGlobalId: 2, halfTimeAt: 8, scoreCapAt: 15 },
    { id: 4, timestamp: 0, type: 'game-add', gameId: 11, name: 'Parity R1', scheduledTime: '18:30',
      teamAGlobalId: 1, teamBGlobalId: 2, halfTimeAt: 8, scoreCapAt: 15, competitionId: 2 },
    { id: 5, timestamp: 0, type: 'game-add', gameId: 12, name: 'BUML R1', scheduledTime: '19:00',
      teamAGlobalId: 1, teamBGlobalId: 2, halfTimeAt: 8, scoreCapAt: 15, competitionId: 1 },
  ]
  const state = deriveScheduledGamesState(log)

  it('game without a competition yields no overrides', () => {
    expect(competitionOverrides(state, 10)).toEqual({})
  })

  it('the competition defaults flow through as overrides', () => {
    expect(competitionOverrides(state, 11)).toEqual({ pullBonus: true })
    expect(competitionOverrides(state, 12)).toEqual({ pullBonus: false, abba: true })
  })

  it('unknown game / dangling competition yields no overrides', () => {
    expect(competitionOverrides(state, 999)).toEqual({})
  })
})

describe('resolveGameConfig', () => {
  it('materialises positional Team + roster from a scheduled game + teams state', () => {
    const teamsLog: TeamEvent[] = [
      { id: 1, timestamp: 0, type: 'team-add', teamId: 10, name: 'Empire', short: 'NYE', color: '#1f4788' },
      { id: 2, timestamp: 0, type: 'team-add', teamId: 11, name: 'Breeze', short: 'DCB', color: '#ff6640' },
      { id: 3, timestamp: 0, type: 'player-add', playerId: 100, teamId: 10, name: 'Alice', gender: 'F' },
      { id: 4, timestamp: 0, type: 'player-add', playerId: 101, teamId: 11, name: 'Bob',   gender: 'M', jerseyNumber: 7 },
    ]
    const gamesLog: ScheduledGameEvent[] = [
      ev({ type: 'game-add', gameId: 1, name: 'Final', scheduledTime: '12:00',
        teamAGlobalId: 10, teamBGlobalId: 11, halfTimeAt: 8, scoreCapAt: 15 }),
    ]
    const config = resolveGameConfig(
      deriveScheduledGames(gamesLog)[0],
      deriveTeamsState(teamsLog),
    )
    expect(config.teams.A.name).toBe('Empire')
    expect(config.teams.A.id).toBe('A')        // positional
    expect(config.teams.B.id).toBe('B')
    expect(config.rosters.A).toHaveLength(1)
    expect(config.rosters.A[0].teamId).toBe('A')
    expect(config.rosters.B[0].jerseyNumber).toBe(7)
  })

  it('missing team falls back to placeholder colour (does not crash)', () => {
    const config = resolveGameConfig(
      {
        id: 1, name: 'Orphan', scheduledTime: '12:00',
        teamAGlobalId: 9999, teamBGlobalId: 9998,
        halfTimeAt: 8, scoreCapAt: 15, cancelled: false,
      },
      deriveTeamsState([]),
    )
    expect(config.teams.A.id).toBe('A')
    expect(config.teams.B.id).toBe('B')
    expect(config.rosters.A).toEqual([])
    expect(config.rosters.B).toEqual([])
  })
})
