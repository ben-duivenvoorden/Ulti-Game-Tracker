// ─── Shared test fixtures ─────────────────────────────────────────────────────
// `MOCK_GAMES[0]` is the Empire-vs-Breeze demo game (player ids 1–26,
// halfTimeAt 8, scoreCapAt 15), resolved from the production seed through the
// real derivation path — so the fixture can never drift from what the app
// actually boots with. Replaces the compatibility export that used to live in
// `core/data.ts`.

import type { GameConfig } from '../types'
import { seedTeamsAndGames } from '../data'
import { deriveTeamsState } from '../teams/engine'
import { deriveScheduledGamesState, resolveGameConfig } from '../games/engine'

const seed       = seedTeamsAndGames()
const teamsState = deriveTeamsState(seed.teamEvents)
const gamesState = deriveScheduledGamesState(seed.gameEvents)

const EMPIRE_VS_BREEZE_GAME_ID = 1

export const MOCK_GAMES: GameConfig[] = [
  resolveGameConfig(gamesState.gamesById.get(EMPIRE_VS_BREEZE_GAME_ID)!, teamsState),
]
