// ─── Scheduled games append-only log ──────────────────────────────────────────
// Mirrors core/teams/types.ts: monotonic id + timestamp, no pointIndex.
// Scheduled games are the list users see on GameSetup; the in-progress
// rawLog still lives on GameSession independently. Competitions ride the
// same log: a competition groups games on GameSetup and carries the rule
// modifications applied when one of its games is selected.

import type { GameId, RecordingOptions } from '../types'
import type { GlobalTeamId } from '../teams/types'

export type CompetitionId = number

/** RecordingOptions keys a competition can govern — everything except the
 *  free-text scorer briefing, which stays per-recorder. */
export type CompetitionOptionKey = Exclude<keyof RecordingOptions, 'scorerInfo'>

export interface BaseScheduledGameEvent {
  id: number
  timestamp: number
}

export interface CompetitionAddEvent extends BaseScheduledGameEvent {
  type:          'competition-add'
  competitionId: CompetitionId
  name:          string
  /** The settings this competition specifies. Applied over the recorder's
   *  RecordingOptions whenever one of its games is selected; keys absent here
   *  are left to the recorder. */
  defaults:      Partial<RecordingOptions>
  /** Subset of `defaults` keys that are ENFORCED — GameSettings greys them
   *  out while one of this competition's games is live. */
  locked:        CompetitionOptionKey[]
}

/** Rename / retune a competition. `defaults` and `locked` replace the whole
 *  previous object when present (the editor always writes full state). */
export interface CompetitionEditEvent extends BaseScheduledGameEvent {
  type:          'competition-edit'
  competitionId: CompetitionId
  name?:         string
  defaults?:     Partial<RecordingOptions>
  locked?:       CompetitionOptionKey[]
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

export type ScheduledGameEvent =
  CompetitionAddEvent | CompetitionEditEvent | GameAddEvent | GameEditEvent | GameCancelEvent

export type ScheduledGameEventInput =
  ScheduledGameEvent extends infer T
    ? (T extends ScheduledGameEvent ? Omit<T, 'id' | 'timestamp'> : never)
    : never

// ─── Derived shape ────────────────────────────────────────────────────────────

export interface Competition {
  id:       CompetitionId
  name:     string
  defaults: Partial<RecordingOptions>
  locked:   CompetitionOptionKey[]
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
