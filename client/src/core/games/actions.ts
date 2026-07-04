// Pure event builders for scheduled-games log. See core/teams/actions.ts for
// the rationale of keeping these separate from store wiring.

import type { GameId } from '../types'
import type { GlobalTeamId } from '../teams/types'
import type {
  CompetitionAddEvent,
  CompetitionId,
  GameAddEvent,
  GameCancelEvent,
  GameEditEvent,
} from './types'

export function addCompetition(args: {
  competitionId: CompetitionId
  name:          string
  pullBonus:     boolean
}): Omit<CompetitionAddEvent, 'id' | 'timestamp'> {
  return { type: 'competition-add', ...args }
}

export function addScheduledGame(args: {
  gameId:         GameId
  name:           string
  scheduledTime:  string
  teamAGlobalId:  GlobalTeamId
  teamBGlobalId:  GlobalTeamId
  halfTimeAt:     number
  scoreCapAt:     number
  competitionId?: CompetitionId
}): Omit<GameAddEvent, 'id' | 'timestamp'> {
  return { type: 'game-add', ...args }
}

export function editScheduledGame(
  gameId: GameId,
  patch: {
    name?:          string
    scheduledTime?: string
    teamAGlobalId?: GlobalTeamId
    teamBGlobalId?: GlobalTeamId
    halfTimeAt?:    number
    scoreCapAt?:    number
    competitionId?: CompetitionId
  },
): Omit<GameEditEvent, 'id' | 'timestamp'> {
  return { type: 'game-edit', gameId, ...patch }
}

export function cancelScheduledGame(gameId: GameId): Omit<GameCancelEvent, 'id' | 'timestamp'> {
  return { type: 'game-cancel', gameId }
}
