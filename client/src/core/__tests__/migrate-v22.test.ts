// v21 → v22 migration: the NBU Indoor Ultimate 1 Day Tournament joins an
// already-populated persisted world. The migration must append the
// competition + 6 teams + 15 fixtures with every id allocated past the
// persisted max — including the competition id, since competitions are
// user-creatable from v21 on.

import { describe, it, expect } from 'vitest'
import { migrateGameStore } from '../persistence'
import { deriveScheduledGamesState } from '../games/engine'
import { deriveTeamsState } from '../teams/engine'
import { INDOOR_COMPETITION_NAME } from '../data'
import type { ScheduledGameEvent } from '../games/types'
import type { TeamEvent } from '../teams/types'

// A v21-shaped world: seeded competitions 1+2 plus a USER-CREATED competition
// (id 3) and a user team/player — all of which must survive untouched and
// force the indoor ids past them.
function v21World() {
  const teamsLog: TeamEvent[] = [
    { id: 1, timestamp: 0, type: 'team-add', teamId: 3, name: 'Lizards Eastside', short: 'LIZ', color: '#ffffff' },
    { id: 2, timestamp: 0, type: 'player-add', playerId: 27, teamId: 3, name: 'Adilia Surname', gender: 'F' },
    { id: 3, timestamp: 1750000000000, type: 'team-add', teamId: 14, name: 'User Team', short: 'UT', color: '#123456' },
    { id: 4, timestamp: 1750000000000, type: 'player-add', playerId: 80, teamId: 14, name: 'User Player', gender: 'M' },
  ]
  const scheduledGamesLog: ScheduledGameEvent[] = [
    { id: 1, timestamp: 0, type: 'competition-add', competitionId: 1, name: 'Brisbane Ultimate Mixed League',
      defaults: { pullBonus: false }, locked: ['pullBonus'] },
    { id: 2, timestamp: 0, type: 'competition-add', competitionId: 2, name: 'Brisbane Parity League',
      defaults: { pullBonus: true }, locked: ['pullBonus'] },
    { id: 3, timestamp: 1750000000000, type: 'competition-add', competitionId: 3, name: 'User Competition',
      defaults: {}, locked: [] },
    { id: 4, timestamp: 0, type: 'game-add', gameId: 5, name: 'BUML 2026-05-11', scheduledTime: '19:00',
      teamAGlobalId: 3, teamBGlobalId: 4, halfTimeAt: 9, scoreCapAt: 17, competitionId: 1 },
    { id: 5, timestamp: 1750000000000, type: 'game-add', gameId: 9, name: 'User Game', scheduledTime: '10:00',
      teamAGlobalId: 3, teamBGlobalId: 14, halfTimeAt: 8, scoreCapAt: 15 },
  ]
  return {
    teamsLog,
    scheduledGamesLog,
    recordingOptions: { pullBonus: false },
    scorerId: 'scorer-x',
    deviceId: 'device-x',
    session: null,
  }
}

describe('migrateGameStore v21 → v22', () => {
  const migrated = migrateGameStore(v21World(), 21)
  const games = deriveScheduledGamesState(migrated.scheduledGamesLog)
  const teams = deriveTeamsState(migrated.teamsLog)
  const indoor = games.competitions.find(c => c.name === INDOOR_COMPETITION_NAME)

  it('appends the indoor competition past the user-created competition id', () => {
    expect(indoor).toBeDefined()
    expect(indoor!.id).toBe(4)
    expect(indoor!.defaults.lineRatio).toEqual({ M: 3, F: 1 })
    expect(indoor!.defaults.lineSize).toBe(4)
    expect(indoor!.defaults.brick).toBe(false)
    expect(indoor!.locked).toEqual(['pullBonus', 'brick'])
    // Existing competitions untouched.
    expect(games.competitions.map(c => c.id)).toEqual([1, 2, 3, 4])
  })

  it('appends the 6 indoor teams with gids past the user max', () => {
    // User max teamId is 14 → indoor teams take 15–20 in site order.
    expect(teams.teamsById.get(15)?.name).toBe("BB's")
    expect(teams.teamsById.get(16)?.name).toBe('Cool Beans')
    expect(teams.teamsById.get(17)?.name).toBe('Family Force 5')
    expect(teams.teamsById.get(18)?.name).toBe('Inside jokes')
    expect(teams.teamsById.get(19)?.name).toBe('NBU Indoor')
    expect(teams.teamsById.get(20)?.name).toBe('Sarcastic Commentary')
  })

  it('adds only the publicly visible players, ids past the user max', () => {
    const roster = (gid: number) => (teams.rosterByTeam.get(gid) ?? []).map(p => `${p.name}/${p.gender}`)
    expect(roster(15)).toEqual([])
    expect(roster(16)).toEqual([
      'Jane Huggins/F', 'Jean Pameron/F',
      'Angus McCall/M', 'Arman Mehrabkhani/M', 'Erik Stevenson/M',
    ])
    expect(roster(17)).toEqual(['Daniel Johansen/M'])
    expect(roster(18)).toEqual([])
    expect(roster(19)).toEqual([])
    expect(roster(20)).toEqual([
      'Kellie Mantle/F', 'Tanya Dodgen/F',
      'Alexi Paasonen/M', 'Ben Duivenvoorden/M', 'Keith Algar/M',
    ])
    // Player ids continue past the user's 80 — 11 visible players in total.
    const indoorPids = [...teams.playersById.keys()].filter(id => id > 80)
    expect(indoorPids).toHaveLength(11)
    expect(Math.min(...indoorPids)).toBe(81)
  })

  it('appends all 15 fixtures with gameIds past the user max, no half time', () => {
    const fixtures = games.games.filter(g => g.competitionId === indoor!.id)
    expect(fixtures).toHaveLength(15)
    expect(fixtures.map(g => g.id)).toEqual(Array.from({ length: 15 }, (_, i) => 10 + i))
    expect(fixtures.every(g => g.halfTimeAt === 99 && g.scoreCapAt === 99)).toBe(true)
    // Spot-check round 1: Sarcastic Commentary vs NBU Indoor on court 5.
    const r1c5 = fixtures.find(g => g.name === 'Pool R1 · Court 5')
    expect(r1c5?.scheduledTime).toBe('10:50')
    expect(r1c5?.teamAGlobalId).toBe(20)
    expect(r1c5?.teamBGlobalId).toBe(19)
    // Every team plays every other team exactly once.
    const pairs = fixtures.map(g => [g.teamAGlobalId, g.teamBGlobalId].sort((a, b) => a - b).join('-'))
    expect(new Set(pairs).size).toBe(15)
  })

  it('keeps user-created entities untouched', () => {
    expect(teams.teamsById.get(14)?.name).toBe('User Team')
    expect(games.gamesById.get(9)?.name).toBe('User Game')
    expect(games.competitions.find(c => c.id === 3)?.name).toBe('User Competition')
  })

  it('is idempotent — re-running on a migrated world changes nothing', () => {
    const again = migrateGameStore(migrated, 21)
    expect(again.scheduledGamesLog).toEqual(migrated.scheduledGamesLog)
    expect(again.teamsLog).toEqual(migrated.teamsLog)
  })

  it('a same-named USER-created competition does not suppress the seed', () => {
    // The guard keys on the seed stamp (timestamp 0), not the name alone — a
    // user who hand-made an identically named competition still gets the data.
    const world = v21World()
    world.scheduledGamesLog.push({ id: 6, timestamp: 1750000000001, type: 'competition-add',
      competitionId: 4, name: INDOOR_COMPETITION_NAME, defaults: {}, locked: [] })
    const m = migrateGameStore(world, 21)
    const g = deriveScheduledGamesState(m.scheduledGamesLog)
    expect(g.competitions.filter(c => c.name === INDOOR_COMPETITION_NAME)).toHaveLength(2)
    expect(m.scheduledGamesLog.some(e =>
      e.type === 'competition-add' && e.name === INDOOR_COMPETITION_NAME && e.timestamp === 0)).toBe(true)
    // Seeded competition id continues past the user's (4) → 5, and its 15
    // fixtures point at it.
    const seeded = g.competitions.find(c => c.name === INDOOR_COMPETITION_NAME && c.id === 5)
    expect(seeded).toBeDefined()
    expect(g.games.filter(x => x.competitionId === 5)).toHaveLength(15)
  })
})
