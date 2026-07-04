// ─── Seed data ────────────────────────────────────────────────────────────────
// On first boot (and on v6→v7 migrations) `seedTeamsAndGames()` produces the
// team-add / player-add events for every demo team plus the competition-add /
// game-add events for every demo fixture. Engine tests also build their
// fixture sessions from this seed (resolved via `__tests__/fixtures.ts`).
//
// Two competitions: Brisbane Ultimate Mixed League (the Lizards fixture, the
// live test target) and Brisbane Parity League (pull-bonus modification on).
// The Empire vs Breeze demo game left the seed in the 2026-07-04 trim — its
// teams (rosters 1–26) stay because the engine-test fixtures are built on
// them. AUDL Summer Series + Championship were removed in the 2026-05-11 trim.

import type { GameId, Player, Team } from './types'
import type { GlobalTeamId, TeamEvent, TeamEventInput } from './teams/types'
import type { ScheduledGameEvent, ScheduledGameEventInput } from './games/types'
import { addPlayer, addTeam } from './teams/actions'
import { addCompetition, addScheduledGame } from './games/actions'

// ─── Reusable team/player builders ────────────────────────────────────────────

function team(id: 'A' | 'B', name: string, short: string, color: string): Team {
  return { id, name, short, color }
}

function player(
  id: number, name: string, teamId: 'A' | 'B', gender: 'M' | 'F',
  photoUrl?: string, jerseyNumber?: number,
): Player {
  return {
    id, name, teamId, gender,
    ...(photoUrl ? { photoUrl } : {}),
    ...(jerseyNumber !== undefined ? { jerseyNumber } : {}),
  }
}

// ─── Global identifiers ──────────────────────────────────────────────────────
// GlobalTeamIds and PlayerIds are reserved here so the seed is deterministic.
// User-created entities use `Math.max(...existing) + 1`, so reserving low ids
// for the demo is safe.
const EMPIRE_GID     = 1
const BREEZE_GID     = 2
const LIZARDS_GID    = 3
const GOOSELINGS_GID = 4

const EMPIRE = team('A', 'New York Empire', 'NYE', '#1f4788')
const BREEZE = team('B', 'DC Breeze',       'DCB', '#ff6640')

const portrait = (g: 'men' | 'women', n: number) => `https://randomuser.me/api/portraits/${g}/${n}.jpg`

// Empire 1–13, Breeze 14–26 (untouched from the original demo so existing
// engine tests stay valid). Lizards 27–36, Gooselings 37–47.
const EMPIRE_ROSTER: Player[] = [
  player( 1, 'Alex Surname',     'A', 'M', portrait('men', 32),    7),
  player( 2, 'Caoba Surname',    'A', 'M', portrait('men', 64)      ),
  player( 3, 'Matt Surname',     'A', 'M', undefined,             11),
  player( 4, 'Ben Surname',      'A', 'M', portrait('men', 17),   23),
  player( 5, 'Benjamin Surname', 'A', 'M'                           ),
  player( 6, 'Nicholas Surname', 'A', 'M', undefined,              4),
  player( 7, 'Samuel Surname',   'A', 'M', portrait('men', 45)      ),
  player( 8, 'Solomon Surname',  'A', 'M', portrait('men', 83),   42),
  player( 9, 'Tej Surname',      'A', 'M'                           ),
  player(10, 'Sarah Surname',    'A', 'F', portrait('women', 26),  6),
  player(11, 'Jordan Surname',   'A', 'F', portrait('women', 51)    ),
  player(12, 'Megan Surname',    'A', 'F', portrait('women', 9),  18),
  player(13, 'Leah Surname',     'A', 'F'                           ),
]

const BREEZE_ROSTER: Player[] = [
  player(14, 'Xavier Surname',  'B', 'M', portrait('men', 12),     8),
  player(15, 'Graham Surname',  'B', 'M', undefined,              13),
  player(16, 'Aidan Surname',   'B', 'M', portrait('men', 76)       ),
  player(17, 'Charlie Surname', 'B', 'M', portrait('men', 29),    21),
  player(18, 'AJ Surname',      'B', 'M'                            ),
  player(19, 'Zachary Surname', 'B', 'M', undefined,              88),
  player(20, 'Lev Surname',     'B', 'M', portrait('men', 53)       ),
  player(21, 'Wiebe Surname',   'B', 'M', portrait('men', 88),     3),
  player(22, 'Ben Surname',     'B', 'M'                            ),
  player(23, 'Maya Surname',    'B', 'F', portrait('women', 33),  14),
  player(24, 'Olivia Surname',  'B', 'F', portrait('women', 68)     ),
  player(25, 'Emily Surname',   'B', 'F', undefined,               2),
  player(26, 'Hannah Surname',  'B', 'F', portrait('women', 12)     ),
]

// ─── BUML 2026-05-11 rosters ─────────────────────────────────────────────────
// Real teams for live test recording. No portraits — names and gender only.

const LIZARDS_ROSTER: Player[] = [
  player(27, 'Adilia Surname',  'A', 'F'),
  player(28, 'Bell Surname',    'A', 'F'),
  player(29, 'Natalie Surname', 'A', 'F'),
  player(30, 'Tanya Surname',   'A', 'F'),
  player(31, 'Alex Surname',    'A', 'M'),
  player(32, 'Ben Surname',     'A', 'M'),
  player(33, 'Daniel Surname',  'A', 'M'),
  player(34, 'Israel Surname',  'A', 'M'),
  player(35, 'Keith Surname',   'A', 'M'),
  player(36, 'Vern Surname',    'A', 'M'),
]

const GOOSELINGS_ROSTER: Player[] = [
  player(37, 'Ana Surname',     'B', 'F'),
  player(38, 'Bridget Surname', 'B', 'F'),
  player(39, 'Chloe Surname',   'B', 'F'),
  player(40, 'Drew Surname',    'B', 'F'),
  player(41, 'Jane Surname',    'B', 'F'),
  player(42, 'Nicole Surname',  'B', 'F'),
  player(43, 'Yeanna Surname',  'B', 'F'),
  player(44, 'Isobel Surname',  'B', 'F'),
  player(45, 'Ikkei Surname',   'B', 'M'),
  player(46, 'Kim Surname',     'B', 'M'),
  player(47, 'Sun Surname',     'B', 'M'),
]

// Lizards play in white today (the two teams' usual red + maroon were too
// similar on a dark canvas — white reads cleanly against the maroon as the
// opposing outline).
const LIZARDS    = team('A', 'Lizards Eastside', 'LIZ', '#ffffff')
const GOOSELINGS = team('B', 'Gooselings',       'GSL', '#6e1a1a')

// ─── Competitions ─────────────────────────────────────────────────────────────
// The competition level owns rule defaults + enforcement: `defaults` are laid
// over the recorder's RecordingOptions when one of its games is selected;
// `locked` keys are enforced (greyed out in GameSettings while the game is
// live). BUML plays straight WFDF mixed with ABBA advice on and no pull
// bonus; the Parity League runs the pull-distance-bonus modification.

export const BUML_COMPETITION_ID   = 1
export const PARITY_COMPETITION_ID = 2

/** Competition-add inputs — shared by the seed and the log migrations so
 *  already-populated persisted logs inherit the same competitions. */
export function competitionInputs(): ScheduledGameEventInput[] {
  return [
    addCompetition({
      competitionId: BUML_COMPETITION_ID,
      name: 'Brisbane Ultimate Mixed League',
      defaults: { gameMode: 'mixed', lineRatio: { M: 4, F: 3 }, lineSize: 7, abba: true, pullBonus: false },
      locked:   ['pullBonus'],
    }),
    addCompetition({
      competitionId: PARITY_COMPETITION_ID,
      name: 'Brisbane Parity League',
      defaults: { gameMode: 'mixed', lineRatio: { M: 4, F: 3 }, lineSize: 7, abba: false, pullBonus: true },
      locked:   ['pullBonus'],
    }),
  ]
}

// ─── Brisbane Parity League demo ──────────────────────────────────────────────
// Sample fixture only — parity teams redraft every season, so both rosters
// are placeholder names.

const BALD_GID     = 5
const YOUNG_GID    = 6
const PARITY_GAME_ID = 6

const BALD  = team('A', 'The Bald and the Beautiful', 'BAB', '#d9a521')
const YOUNG = team('B', 'The Young and the Restless', 'YAR', '#2a9d8f')

const PARITY_NAMES: Record<'bald' | 'young', Array<[name: string, gender: 'M' | 'F']>> = {
  bald: [
    ['Marcus Surname', 'M'], ['Toby Surname',   'M'], ['Ryan Surname',  'M'],
    ['Ollie Surname',  'M'], ['Pete Surname',   'M'], ['Grace Surname', 'F'],
    ['Ivy Surname',    'F'], ['Ruby Surname',   'F'], ['Tess Surname',  'F'],
    ['Zoe Surname',    'F'],
  ],
  young: [
    ['Callum Surname', 'M'], ['Dylan Surname',  'M'], ['Josh Surname',  'M'],
    ['Liam Surname',   'M'], ['Noah Surname',   'M'], ['Amber Surname', 'F'],
    ['Eliza Surname',  'F'], ['Freya Surname',  'F'], ['Mia Surname',   'F'],
    ['Sasha Surname',  'F'],
  ],
}

/** Parity-league team + roster inputs with caller-chosen ids. The seed uses
 *  the fixed low ids above; the v19→v20 migration allocates ids past the
 *  persisted log's max so it can append to an already-populated world. */
export function parityTeamInputs(
  baldGid: GlobalTeamId, youngGid: GlobalTeamId, firstPlayerId: number,
): TeamEventInput[] {
  const out: TeamEventInput[] = []
  let pid = firstPlayerId
  out.push(addTeam(baldGid, BALD.name, BALD.short, BALD.color))
  for (const [name, gender] of PARITY_NAMES.bald) out.push(addPlayer(pid++, baldGid, name, gender, {}))
  out.push(addTeam(youngGid, YOUNG.name, YOUNG.short, YOUNG.color))
  for (const [name, gender] of PARITY_NAMES.young) out.push(addPlayer(pid++, youngGid, name, gender, {}))
  return out
}

/** Parity-league sample fixture input — id-parameterised for the same reason
 *  as `parityTeamInputs`. */
export function parityGameInput(
  gameId: GameId, baldGid: GlobalTeamId, youngGid: GlobalTeamId,
): ScheduledGameEventInput {
  return addScheduledGame({
    gameId, name: 'BPL 2026-07-08', scheduledTime: '18:30',
    teamAGlobalId: baldGid, teamBGlobalId: youngGid,
    halfTimeAt: 8, scoreCapAt: 15,
    competitionId: PARITY_COMPETITION_ID,
  })
}

// ─── Seed function ────────────────────────────────────────────────────────────

interface SeedResult {
  teamEvents: TeamEvent[]
  gameEvents: ScheduledGameEvent[]
}

function stampTeam(events: TeamEventInput[]): TeamEvent[] {
  // Deterministic ids starting at 1 — matches the production appender shape
  // but doesn't depend on Date.now() (so seed output stays stable in tests).
  return events.map((e, i) => ({ ...e, id: i + 1, timestamp: 0 }) as TeamEvent)
}
function stampGame(events: ScheduledGameEventInput[]): ScheduledGameEvent[] {
  return events.map((e, i) => ({ ...e, id: i + 1, timestamp: 0 }) as ScheduledGameEvent)
}

function emitTeamWithRoster(
  out: TeamEventInput[], gid: number, t: Team, roster: Player[],
): void {
  out.push(addTeam(gid, t.name, t.short, t.color))
  for (const p of roster) {
    out.push(addPlayer(
      p.id, gid, p.name, p.gender,
      {
        ...(p.jerseyNumber !== undefined ? { jerseyNumber: p.jerseyNumber } : {}),
        ...(p.photoUrl     !== undefined ? { photoUrl:     p.photoUrl     } : {}),
      },
    ))
  }
}

/** Produce the team-add/player-add/game-add events that materialise the demo
 *  state. Pure — safe to call from store init, migrations, and tests. */
export function seedTeamsAndGames(): SeedResult {
  const teamInputs: TeamEventInput[] = []
  emitTeamWithRoster(teamInputs, EMPIRE_GID,     EMPIRE,     EMPIRE_ROSTER)
  emitTeamWithRoster(teamInputs, BREEZE_GID,     BREEZE,     BREEZE_ROSTER)
  emitTeamWithRoster(teamInputs, LIZARDS_GID,    LIZARDS,    LIZARDS_ROSTER)
  emitTeamWithRoster(teamInputs, GOOSELINGS_GID, GOOSELINGS, GOOSELINGS_ROSTER)
  teamInputs.push(...parityTeamInputs(BALD_GID, YOUNG_GID, 48))

  // Order matters: deriveScheduledGames preserves insertion order, so the
  // BUML fixture is emitted first (top of GameSetup), competitions in their
  // display order before it.
  const gameInputs: ScheduledGameEventInput[] = [
    ...competitionInputs(),
    addScheduledGame({
      gameId: 5, name: 'BUML 2026-05-11', scheduledTime: '19:00',
      teamAGlobalId: LIZARDS_GID, teamBGlobalId: GOOSELINGS_GID,
      halfTimeAt: 9, scoreCapAt: 17,
      competitionId: BUML_COMPETITION_ID,
    }),
    parityGameInput(PARITY_GAME_ID, BALD_GID, YOUNG_GID),
  ]

  return {
    teamEvents: stampTeam(teamInputs),
    gameEvents: stampGame(gameInputs),
  }
}
