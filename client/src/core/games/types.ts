// ─── Scheduled games append-only log ──────────────────────────────────────────
// Mirrors core/teams/types.ts: monotonic id + timestamp, no pointIndex.
// Scheduled games are the list users see on GameSetup; the in-progress
// rawLog still lives on GameSession independently. Competitions ride the
// same log: a competition groups games on GameSetup and carries the rule
// modifications applied when one of its games is selected.

import type { GameId } from '../types'
import type { GlobalTeamId } from '../teams/types'

export type CompetitionId = number

export interface BaseScheduledGameEvent {
  id: number
  timestamp: number
}

export interface CompetitionAddEvent extends BaseScheduledGameEvent {
  type:          'competition-add'
  competitionId: CompetitionId
  name:          string
  /** Modification: end-zone pulls score a bonus. House rule — off in plain
   *  WFDF play; applied to RecordingOptions when a game of this competition
   *  is selected. */
  pullBonus:     boolean
}

export interface GameAddEvent extends BaseScheduledGameEvent {
  type:           'game-add'
  gameId:         GameId
  name:           string
  scheduledTime:  string
  teamAGlobalId:  GlobalTeamId
  teamBGlobalId:  GlobalTeamId
  halfTimeAt:     number
  scoreCapAt:     number
  competitionId?: CompetitionId
}

export interface GameEditEvent extends BaseScheduledGameEvent {
  type:           'game-edit'
  gameId:         GameId
  name?:          string
  scheduledTime?: string
  teamAGlobalId?: GlobalTeamId
  teamBGlobalId?: GlobalTeamId
  halfTimeAt?:    number
  scoreCapAt?:    number
  competitionId?: CompetitionId
}

/** Soft cancel — hidden from active pickers, kept in the byId map. */
export interface GameCancelEvent extends BaseScheduledGameEvent {
  type:   'game-cancel'
  gameId: GameId
}

export type ScheduledGameEvent = CompetitionAddEvent | GameAddEvent | GameEditEvent | GameCancelEvent

export type ScheduledGameEventInput =
  ScheduledGameEvent extends infer T
    ? (T extends ScheduledGameEvent ? Omit<T, 'id' | 'timestamp'> : never)
    : never

// ─── Derived shape ────────────────────────────────────────────────────────────

export interface Competition {
  id:        CompetitionId
  name:      string
  pullBonus: boolean
}

export interface ScheduledGame {
  id:             GameId
  name:           string
  scheduledTime:  string
  teamAGlobalId:  GlobalTeamId
  teamBGlobalId:  GlobalTeamId
  halfTimeAt:     number
  scoreCapAt:     number
  competitionId?: CompetitionId
  cancelled:      boolean
}
