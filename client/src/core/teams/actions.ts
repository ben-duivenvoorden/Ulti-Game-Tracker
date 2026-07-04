// Pure event builders. Callers (typically store helpers) pass the bare shape
// and the appender stamps on `id` + `timestamp`. Kept separate from store.ts
// so server-side replay can construct events directly if/when sync lands.

import type { PlayerId } from '../types'
import type {
  GlobalTeamId,
  PlayerAddEvent,
  PlayerEditEvent,
  PlayerRemoveEvent,
  TeamAddEvent,
  TeamArchiveEvent,
  TeamEditEvent,
} from './types'

export function addTeam(
  teamId: GlobalTeamId, name: string, short: string, color: string,
): Omit<TeamAddEvent, 'id' | 'timestamp'> {
  return { type: 'team-add', teamId, name, short, color }
}

export function editTeam(
  teamId: GlobalTeamId, patch: { name?: string; short?: string; color?: string },
): Omit<TeamEditEvent, 'id' | 'timestamp'> {
  return { type: 'team-edit', teamId, ...patch }
}

export function archiveTeam(teamId: GlobalTeamId): Omit<TeamArchiveEvent, 'id' | 'timestamp'> {
  return { type: 'team-archive', teamId }
}

export function addPlayer(
  playerId: PlayerId,
  teamId:   GlobalTeamId,
  name:     string,
  gender:   'M' | 'F',
  extras: { jerseyNumber?: number; photoUrl?: string; spokenAliases?: string[] } = {},
): Omit<PlayerAddEvent, 'id' | 'timestamp'> {
  return {
    type:     'player-add',
    playerId, teamId, name, gender,
    ...(extras.jerseyNumber  !== undefined ? { jerseyNumber:  extras.jerseyNumber  } : {}),
    ...(extras.photoUrl      !== undefined ? { photoUrl:      extras.photoUrl      } : {}),
    ...(extras.spokenAliases !== undefined ? { spokenAliases: extras.spokenAliases } : {}),
  }
}

export function editPlayer(
  playerId: PlayerId,
  patch: {
    name?:          string
    gender?:        'M' | 'F'
    jerseyNumber?:  number | null
    photoUrl?:      string | null
    spokenAliases?: string[]
  },
): Omit<PlayerEditEvent, 'id' | 'timestamp'> {
  return { type: 'player-edit', playerId, ...patch }
}

export function removePlayer(playerId: PlayerId): Omit<PlayerRemoveEvent, 'id' | 'timestamp'> {
  return { type: 'player-remove', playerId }
}
