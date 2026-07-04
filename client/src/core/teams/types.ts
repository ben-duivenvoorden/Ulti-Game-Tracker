// ─── Teams + players append-only log ──────────────────────────────────────────
// Mirrors the rawLog pattern in core/types.ts: monotonic ids, timestamps, never
// mutated in place. Lives in its own union — these aren't game-history events
// so they don't share RawEvent's pointIndex.

import type { PlayerId } from '../types'

/** Globally unique team identifier (distinct from the per-game positional
 *  TeamId = 'A' | 'B'). Allocated when a team-add event is appended. */
export type GlobalTeamId = number

export interface BaseTeamEvent {
  id: number
  timestamp: number
}

export interface TeamAddEvent extends BaseTeamEvent {
  type:    'team-add'
  teamId:  GlobalTeamId
  name:    string
  short:   string
  color:   string
}

export interface TeamEditEvent extends BaseTeamEvent {
  type:    'team-edit'
  teamId:  GlobalTeamId
  name?:   string
  short?:  string
  color?:  string
}

/** Soft delete — hidden from active pickers, kept for historical games to
 *  resolve their rosters by id. */
export interface TeamArchiveEvent extends BaseTeamEvent {
  type:    'team-archive'
  teamId:  GlobalTeamId
}

export interface PlayerAddEvent extends BaseTeamEvent {
  type:          'player-add'
  playerId:      PlayerId
  teamId:        GlobalTeamId
  name:          string
  gender:        'M' | 'F'
  jerseyNumber?: number
  photoUrl?:     string
  /** Nicknames / call-names for voice matching ("Bennie", "Beast"). */
  spokenAliases?: string[]
}

export interface PlayerEditEvent extends BaseTeamEvent {
  type:          'player-edit'
  playerId:      PlayerId
  name?:         string
  gender?:       'M' | 'F'
  jerseyNumber?: number | null   // null clears
  photoUrl?:     string | null   // null clears
  spokenAliases?: string[]       // [] clears
}

/** Soft remove — same reasoning as team-archive. */
export interface PlayerRemoveEvent extends BaseTeamEvent {
  type:     'player-remove'
  playerId: PlayerId
}

export type TeamEvent =
  | TeamAddEvent
  | TeamEditEvent
  | TeamArchiveEvent
  | PlayerAddEvent
  | PlayerEditEvent
  | PlayerRemoveEvent

/** Bare event input — `id` and `timestamp` are stamped on by the appender. */
export type TeamEventInput =
  TeamEvent extends infer T ? (T extends TeamEvent ? Omit<T, 'id' | 'timestamp'> : never) : never

// ─── Derived shape ────────────────────────────────────────────────────────────

export interface GlobalTeam {
  id:        GlobalTeamId
  name:      string
  short:     string
  color:     string
  archived:  boolean
}

export interface GlobalPlayer {
  id:            PlayerId
  teamId:        GlobalTeamId
  name:          string
  gender:        'M' | 'F'
  jerseyNumber?: number
  photoUrl?:     string
  /** Nicknames / call-names for voice matching. Always present on the derived
   *  shape (defaults to []) so consumers never null-check. */
  spokenAliases: string[]
  removed:       boolean
}

export interface TeamsState {
  /** Active (non-archived) teams in insertion order. */
  teams:        GlobalTeam[]
  /** Lookup including archived teams — for historical roster resolution. */
  teamsById:    Map<GlobalTeamId, GlobalTeam>
  /** Active (non-removed) players grouped by team, in insertion order. */
  rosterByTeam: Map<GlobalTeamId, GlobalPlayer[]>
  /** Lookup including removed players — for historical roster resolution. */
  playersById:  Map<PlayerId, GlobalPlayer>
}
