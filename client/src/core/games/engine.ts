// Pure walker over the scheduled-games log. The active list returned by
// `deriveScheduledGames` preserves insertion order; the UI sorts by
// scheduledTime when rendering.

import type { GameConfig, GameId, Player, RecordingOptions, Team } from '../types'
import type { GlobalTeam, GlobalTeamId, TeamsState } from '../teams/types'
import { fullRosterFor } from '../teams/engine'
import type { Competition, CompetitionId, ScheduledGame, ScheduledGameEvent } from './types'

export interface ScheduledGamesState {
  /** Active (non-cancelled) games in insertion order. */
  games:            ScheduledGame[]
  /** Lookup including cancelled games — historical resolution. */
  gamesById:        Map<GameId, ScheduledGame>
  /** Competitions in insertion order — drives the GameSetup group order. */
  competitions:     Competition[]
  competitionsById: Map<CompetitionId, Competition>
}

export function deriveScheduledGamesState(log: ScheduledGameEvent[]): ScheduledGamesState {
  const gamesById: Map<GameId, ScheduledGame> = new Map()
  const order: GameId[] = []
  const competitionsById: Map<CompetitionId, Competition> = new Map()
  const competitions: Competition[] = []

  for (const event of log) {
    switch (event.type) {
      case 'competition-add': {
        if (competitionsById.has(event.competitionId)) break
        const c: Competition = {
          id:       event.competitionId,
          name:     event.name,
          defaults: event.defaults ?? {},
          locked:   event.locked ?? [],
        }
        competitionsById.set(event.competitionId, c)
        competitions.push(c)
        break
      }

      case 'competition-edit': {
        const c = competitionsById.get(event.competitionId)
        if (!c) break
        if (event.name     !== undefined) c.name     = event.name
        if (event.defaults !== undefined) c.defaults = event.defaults
        if (event.locked   !== undefined) c.locked   = event.locked
        break
      }

      case 'game-add': {
        if (gamesById.has(event.gameId)) break
        const g: ScheduledGame = {
          id:            event.gameId,
          name:          event.name,
          scheduledTime: event.scheduledTime,
          teamAGlobalId: event.teamAGlobalId,
          teamBGlobalId: event.teamBGlobalId,
          halfTimeAt:    event.halfTimeAt,
          scoreCapAt:    event.scoreCapAt,
          ...(event.competitionId !== undefined ? { competitionId: event.competitionId } : {}),
          cancelled:     false,
        }
        gamesById.set(event.gameId, g)
        order.push(event.gameId)
        break
      }

      case 'game-edit': {
        const g = gamesById.get(event.gameId)
        if (!g) break
        if (event.name          !== undefined) g.name          = event.name
        if (event.scheduledTime !== undefined) g.scheduledTime = event.scheduledTime
        if (event.teamAGlobalId !== undefined) g.teamAGlobalId = event.teamAGlobalId
        if (event.teamBGlobalId !== undefined) g.teamBGlobalId = event.teamBGlobalId
        if (event.halfTimeAt    !== undefined) g.halfTimeAt    = event.halfTimeAt
        if (event.scoreCapAt    !== undefined) g.scoreCapAt    = event.scoreCapAt
        if (event.competitionId !== undefined) g.competitionId = event.competitionId
        break
      }

      case 'game-cancel': {
        const g = gamesById.get(event.gameId)
        if (!g) break
        g.cancelled = true
        break
      }
    }
  }

  const games = order.map(id => gamesById.get(id)!).filter(g => !g.cancelled)
  return { games, gamesById, competitions, competitionsById }
}

/** The competition governing a game, or null (no competition / dangling id). */
export function competitionForGame(
  state: ScheduledGamesState, gameId: GameId,
): Competition | null {
  const game = state.gamesById.get(gameId)
  return (game?.competitionId !== undefined
    ? state.competitionsById.get(game.competitionId)
    : undefined) ?? null
}

/** RecordingOptions overrides implied by a game's competition — its
 *  `defaults`, applied over the recorder's options when the game is selected.
 *  Empty when the game has no competition (the current options stand). */
export function competitionOverrides(
  state: ScheduledGamesState, gameId: GameId,
): Partial<RecordingOptions> {
  return competitionForGame(state, gameId)?.defaults ?? {}
}

/** Convenience for `deriveScheduledGames(...)` style call sites that only
 *  want the active list. */
export function deriveScheduledGames(log: ScheduledGameEvent[]): ScheduledGame[] {
  return deriveScheduledGamesState(log).games
}

// ─── GameConfig resolution ────────────────────────────────────────────────────
// `GameConfig` (in `core/types.ts`) is the runtime shape the engine consumes —
// the engine reads `gameConfig.rosters` and `gameConfig.teams` directly. The
// scheduled-games log only stores `teamAGlobalId` / `teamBGlobalId`; resolving
// to a full `GameConfig` means looking those ids up in the teams state and
// materialising positional Team + Player records.

const FALLBACK_TEAM_COLORS = { A: '#1f4788', B: '#ff6640' } as const
const FALLBACK_TEAM_NAMES  = { A: 'Team A',  B: 'Team B'  } as const
const FALLBACK_TEAM_SHORTS = { A: 'A',       B: 'B'       } as const

function asTeam(positional: 'A' | 'B', global: GlobalTeam | undefined): Team {
  if (!global) {
    return {
      id:    positional,
      name:  FALLBACK_TEAM_NAMES[positional],
      short: FALLBACK_TEAM_SHORTS[positional],
      color: FALLBACK_TEAM_COLORS[positional],
    }
  }
  return { id: positional, name: global.name, short: global.short, color: global.color }
}

function asRoster(positional: 'A' | 'B', teamId: GlobalTeamId, teamsState: TeamsState): Player[] {
  return fullRosterFor(teamsState, teamId).map(p => ({
    id:     p.id,
    name:   p.name,
    teamId: positional,
    gender: p.gender,
    ...(p.jerseyNumber !== undefined ? { jerseyNumber: p.jerseyNumber } : {}),
    ...(p.photoUrl     !== undefined ? { photoUrl:     p.photoUrl     } : {}),
  }))
}

/** Build a runtime `GameConfig` from a scheduled game + live teams state.
 *  Missing teams fall back to placeholder colours so the UI never crashes
 *  if the underlying log references a team that's been archived away. */
export function resolveGameConfig(game: ScheduledGame, teamsState: TeamsState): GameConfig {
  return {
    id:            game.id,
    name:          game.name,
    scheduledTime: game.scheduledTime,
    teamAGlobalId: game.teamAGlobalId,
    teamBGlobalId: game.teamBGlobalId,
    teams: {
      A: asTeam('A', teamsState.teamsById.get(game.teamAGlobalId)),
      B: asTeam('B', teamsState.teamsById.get(game.teamBGlobalId)),
    },
    rosters: {
      A: asRoster('A', game.teamAGlobalId, teamsState),
      B: asRoster('B', game.teamBGlobalId, teamsState),
    },
    halfTimeAt: game.halfTimeAt,
    scoreCapAt: game.scoreCapAt,
  }
}
