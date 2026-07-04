// v19 → v20 migration: competitions join an already-populated persisted
// world. The migration must patch the logs append-only — drop the seeded
// Empire vs Breeze fixture, add the two competitions, tag the seeded BUML
// fixture, append the parity teams + fixture — and flip pullBonus off.

import { describe, it, expect } from 'vitest'
import { migrateGameStore } from '../persistence'
import { deriveScheduledGamesState } from '../games/engine'
import { deriveTeamsState } from '../teams/engine'
import type { ScheduledGameEvent } from '../games/types'
import type { TeamEvent } from '../teams/types'

// A v19-shaped persisted world: the old two-game seed (timestamp 0) plus one
// user-created team and game (real timestamps) that must survive untouched.
function v19World() {
  const teamsLog: TeamEvent[] = [
    { id: 1, timestamp: 0, type: 'team-add', teamId: 1, name: 'New York Empire',  short: 'NYE', color: '#1f4788' },
    { id: 2, timestamp: 0, type: 'team-add', teamId: 2, name: 'DC Breeze',        short: 'DCB', color: '#ff6640' },
    { id: 3, timestamp: 0, type: 'team-add', teamId: 3, name: 'Lizards Eastside', short: 'LIZ', color: '#ffffff' },
    { id: 4, timestamp: 0, type: 'team-add', teamId: 4, name: 'Gooselings',       short: 'GSL', color: '#6e1a1a' },
    { id: 5, timestamp: 0, type: 'player-add', playerId: 27, teamId: 3, name: 'Adilia Surname', gender: 'F' },
    { id: 6, timestamp: 1750000000000, type: 'team-add', teamId: 7, name: 'User Team', short: 'UT', color: '#123456' },
  ]
  const scheduledGamesLog: ScheduledGameEvent[] = [
    { id: 1, timestamp: 0, type: 'game-add', gameId: 5, name: 'BUML 2026-05-11', scheduledTime: '19:00',
      teamAGlobalId: 3, teamBGlobalId: 4, halfTimeAt: 9, scoreCapAt: 17 },
    { id: 2, timestamp: 0, type: 'game-add', gameId: 1, name: 'Empire vs Breeze', scheduledTime: '09:00',
      teamAGlobalId: 1, teamBGlobalId: 2, halfTimeAt: 8, scoreCapAt: 15 },
    { id: 3, timestamp: 1750000000000, type: 'game-add', gameId: 6, name: 'User Game', scheduledTime: '10:00',
      teamAGlobalId: 3, teamBGlobalId: 7, halfTimeAt: 8, scoreCapAt: 15 },
  ]
  return {
    teamsLog,
    scheduledGamesLog,
    recordingOptions: { pullBonus: true, brick: true },
    scorerId: 'scorer-x',
    deviceId: 'device-x',
    session: null,
  }
}

describe('migrateGameStore v19 → v20', () => {
  const migrated = migrateGameStore(v19World(), 19)
  const games = deriveScheduledGamesState(migrated.scheduledGamesLog)
  const teams = deriveTeamsState(migrated.teamsLog)

  it('drops the seeded Empire vs Breeze fixture, keeps user games', () => {
    expect(games.gamesById.has(1)).toBe(false)
    expect(games.gamesById.get(6)?.name).toBe('User Game')
  })

  it('adds both competitions and tags the seeded BUML fixture', () => {
    expect(games.competitions.map(c => c.name)).toEqual([
      'Brisbane Ultimate Mixed League',
      'Brisbane Parity League',
    ])
    expect(games.gamesById.get(5)?.competitionId).toBe(1)
  })

  it('appends the parity teams + fixture with non-colliding ids', () => {
    const parityGame = games.games.find(g => g.competitionId === 2)
    expect(parityGame).toBeDefined()
    // GlobalTeamIds continue past the user's max (7) — no collision.
    expect(parityGame!.teamAGlobalId).toBe(8)
    expect(parityGame!.teamBGlobalId).toBe(9)
    expect(teams.teamsById.get(8)?.name).toBe('The Bald and the Beautiful')
    expect(teams.teamsById.get(9)?.name).toBe('The Young and the Restless')
    // GameId continues past the user's max (6).
    expect(parityGame!.id).toBe(7)
  })

  it('flips pullBonus off (competitions now decide it per game)', () => {
    expect(migrated.recordingOptions.pullBonus).toBe(false)
    expect(migrated.recordingOptions.abba).toBe(false)
  })

  it('competitions land in the v21 shape (defaults + locked)', () => {
    expect(games.competitions.map(c => c.defaults.pullBonus)).toEqual([false, true])
    expect(games.competitions.every(c => c.locked.includes('pullBonus'))).toBe(true)
  })

  it('is idempotent — re-running on a migrated world changes nothing', () => {
    const again = migrateGameStore(migrated, 20)
    expect(again.scheduledGamesLog).toEqual(migrated.scheduledGamesLog)
    expect(again.teamsLog).toEqual(migrated.teamsLog)
  })
})

// v20 shipped competition events with a single `pullBonus` flag; v21 replaced
// that with defaults + locked. Only the two seeded competitions can exist in
// a v20 world (no creation UI shipped), so the migration strips the old-shape
// events and reseeds the same ids.
describe('migrateGameStore v20 → v21', () => {
  const oldShape = (id: number, competitionId: number, name: string, pullBonus: boolean) =>
    ({ id, timestamp: 0, type: 'competition-add', competitionId, name, pullBonus }) as unknown as ScheduledGameEvent

  const v20World = {
    teamsLog: [
      { id: 1, timestamp: 0, type: 'team-add', teamId: 3, name: 'Lizards Eastside', short: 'LIZ', color: '#ffffff' },
    ] as TeamEvent[],
    scheduledGamesLog: [
      oldShape(1, 1, 'Brisbane Ultimate Mixed League', false),
      oldShape(2, 2, 'Brisbane Parity League', true),
      { id: 3, timestamp: 0, type: 'game-add', gameId: 5, name: 'BUML 2026-05-11', scheduledTime: '19:00',
        teamAGlobalId: 3, teamBGlobalId: 4, halfTimeAt: 9, scoreCapAt: 17 },
      { id: 4, timestamp: 0, type: 'game-edit', gameId: 5, competitionId: 1 },
      { id: 5, timestamp: 0, type: 'game-add', gameId: 7, name: 'BPL 2026-07-08', scheduledTime: '18:30',
        teamAGlobalId: 8, teamBGlobalId: 9, halfTimeAt: 8, scoreCapAt: 15, competitionId: 2 },
    ] as ScheduledGameEvent[],
    recordingOptions: { pullBonus: false },
    scorerId: 'scorer-x',
    deviceId: 'device-x',
    session: null,
  }
  const migrated = migrateGameStore(v20World, 20)
  const games = deriveScheduledGamesState(migrated.scheduledGamesLog)

  it('rewrites competitions to the defaults+locked shape, same ids, no duplicates', () => {
    expect(games.competitions.map(c => c.id)).toEqual([1, 2])
    expect(games.competitions.map(c => c.defaults.pullBonus)).toEqual([false, true])
    expect(migrated.scheduledGamesLog.filter(e => e.type === 'competition-add')).toHaveLength(2)
    expect(migrated.scheduledGamesLog.some(e => e.type === 'competition-add' && !('defaults' in e))).toBe(false)
  })

  it('keeps game↔competition tags intact', () => {
    expect(games.gamesById.get(5)?.competitionId).toBe(1)
    expect(games.gamesById.get(7)?.competitionId).toBe(2)
  })
})
