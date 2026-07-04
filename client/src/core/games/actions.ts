// Pure event builders for scheduled-games log. See core/teams/actions.ts for
// the rationale of keeping these separate from store wiring.

import type { GameId, RecordingOptions } from '../types'
import type { GlobalTeamId } from '../teams/types'
import type {
  CompetitionAddEvent,
  CompetitionEditEvent,
  CompetitionId,
  CompetitionOptionKey,
  GameAddEvent,
  GameCancelEvent,
  GameEditEvent,
} from './types'

export function addCompetition(args: {
  competitionId: CompetitionId
  name:          string
  defaults:      Partial<RecordingOptions>
  locked:        CompetitionOptionKey[]
}): Omit<CompetitionAddEvent, 'id' | 'timestamp'> {
  return { type: 'competition-add', ...args }
}

export function editCompetition(
  competitionId: CompetitionId,
  patch: {
    name?:     string
    defaults?: Partial<RecordingOptions>
    locked?:   CompetitionOptionKey[]
  },
): Omit<CompetitionEditEvent, 'id' | 'timestamp'> {
  return { type: 'competition-edit', competitionId, ...patch }
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
