// ─── Shared test fixtures ─────────────────────────────────────────────────────
// `MOCK_GAMES[0]` is the Empire-vs-Breeze demo game (player ids 1–26,
// halfTimeAt 8, scoreCapAt 15). The Empire + Breeze teams are still part of
// the production seed (the engine tests are built on their rosters), but the
// game itself left the app seed in the 2026-07-04 trim — so the fixture
// synthesises the scheduled game and resolves it through the real derivation
// path, keeping the rosters from drifting from what the app boots with.

import type { GameConfig } from '../types'
import type { GameAddEvent, ScheduledGame } from '../games/types'
import { seedTeamsAndGames } from '../data'
import { deriveTeamsState } from '../teams/engine'
import { resolveGameConfig } from '../games/engine'

const seed       = seedTeamsAndGames()
const teamsState = deriveTeamsState(seed.teamEvents)

const EMPIRE_VS_BREEZE: ScheduledGame = {
  id: 1, name: 'Empire vs Breeze', scheduledTime: '09:00',
  teamAGlobalId: 1, teamBGlobalId: 2,
  halfTimeAt: 8, scoreCapAt: 15, cancelled: false,
}

/** Stamped game-add for tests that drive the real store: `selectGame`
 *  resolves against the scheduledGamesLog, so store tests append this event
 *  (the id is far past the seed's — appends stay monotonic). */
export const EMPIRE_VS_BREEZE_GAME_ADD: GameAddEvent = {
  id: 9001, timestamp: 0, type: 'game-add',
  gameId: EMPIRE_VS_BREEZE.id, name: EMPIRE_VS_BREEZE.name,
  scheduledTime: EMPIRE_VS_BREEZE.scheduledTime,
  teamAGlobalId: EMPIRE_VS_BREEZE.teamAGlobalId,
  teamBGlobalId: EMPIRE_VS_BREEZE.teamBGlobalId,
  halfTimeAt: EMPIRE_VS_BREEZE.halfTimeAt, scoreCapAt: EMPIRE_VS_BREEZE.scoreCapAt,
}

export const MOCK_GAMES: GameConfig[] = [
  resolveGameConfig(EMPIRE_VS_BREEZE, teamsState),
]
