// Pure walker over the teams log. Mirrors deriveGameState's shape — single
// source of truth for "what teams + players exist right now".

import type {
  GlobalPlayer,
  GlobalTeam,
  GlobalTeamId,
  TeamEvent,
  TeamsState,
} from './types'

export function deriveTeamsState(log: TeamEvent[]): TeamsState {
  const teamsById:   Map<GlobalTeamId, GlobalTeam>           = new Map()
  const teamsOrder:  GlobalTeamId[]                          = []
  const playersById: Map<number, GlobalPlayer>               = new Map()
  // Track per-team insertion order so the UI roster reads stable.
  const playerOrderByTeam: Map<GlobalTeamId, number[]>       = new Map()

  for (const event of log) {
    switch (event.type) {
      case 'team-add': {
        if (teamsById.has(event.teamId)) break
        const team: GlobalTeam = {
          id:       event.teamId,
          name:     event.name,
          short:    event.short,
          color:    event.color,
          archived: false,
        }
        teamsById.set(event.teamId, team)
        teamsOrder.push(event.teamId)
        playerOrderByTeam.set(event.teamId, [])
        break
      }

      case 'team-edit': {
        const t = teamsById.get(event.teamId)
        if (!t) break
        if (event.name  !== undefined) t.name  = event.name
        if (event.short !== undefined) t.short = event.short
        if (event.color !== undefined) t.color = event.color
        break
      }

      case 'team-archive': {
        const t = teamsById.get(event.teamId)
        if (!t) break
        t.archived = true
        break
      }

      case 'player-add': {
        if (playersById.has(event.playerId)) break
        const player: GlobalPlayer = {
          id:           event.playerId,
          teamId:       event.teamId,
          name:         event.name,
          gender:       event.gender,
          ...(event.jerseyNumber !== undefined ? { jerseyNumber: event.jerseyNumber } : {}),
          ...(event.photoUrl     !== undefined ? { photoUrl:     event.photoUrl     } : {}),
          spokenAliases: event.spokenAliases ?? [],
          removed:      false,
        }
        playersById.set(event.playerId, player)
        const order = playerOrderByTeam.get(event.teamId)
        if (order) order.push(event.playerId)
        else playerOrderByTeam.set(event.teamId, [event.playerId])
        break
      }

      case 'player-edit': {
        const p = playersById.get(event.playerId)
        if (!p) break
        if (event.name   !== undefined) p.name   = event.name
        if (event.gender !== undefined) p.gender = event.gender
        if (event.jerseyNumber !== undefined) {
          if (event.jerseyNumber === null) delete p.jerseyNumber
          else p.jerseyNumber = event.jerseyNumber
        }
        if (event.photoUrl !== undefined) {
          if (event.photoUrl === null) delete p.photoUrl
          else p.photoUrl = event.photoUrl
        }
        if (event.spokenAliases !== undefined) p.spokenAliases = event.spokenAliases
        break
      }

      case 'player-remove': {
        const p = playersById.get(event.playerId)
        if (!p) break
        p.removed = true
        break
      }
    }
  }

  const teams: GlobalTeam[] = teamsOrder
    .map(id => teamsById.get(id)!)
    .filter(t => !t.archived)

  const rosterByTeam: Map<GlobalTeamId, GlobalPlayer[]> = new Map()
  for (const teamId of teamsOrder) {
    const order = playerOrderByTeam.get(teamId) ?? []
    rosterByTeam.set(
      teamId,
      order
        .map(pid => playersById.get(pid)!)
        .filter(p => !p.removed),
    )
  }

  return { teams, teamsById, rosterByTeam, playersById }
}

/** Convenience: resolve any player (including removed) by id. */
export function lookupPlayer(state: TeamsState, id: number): GlobalPlayer | undefined {
  return state.playersById.get(id)
}

/** Convenience: resolve any team (including archived) by id. */
export function lookupTeam(state: TeamsState, id: GlobalTeamId): GlobalTeam | undefined {
  return state.teamsById.get(id)
}

/** Full historical roster for a team (includes removed players). Used when
 *  resolving a saved GameSession's gameConfig — the in-progress log may
 *  reference players who've since been soft-removed, and we still want their
 *  names to render. */
export function fullRosterFor(state: TeamsState, teamId: GlobalTeamId): GlobalPlayer[] {
  const active = state.rosterByTeam.get(teamId) ?? []
  if (state.playersById.size === active.length) return active
  const out: GlobalPlayer[] = []
  for (const p of state.playersById.values()) {
    if (p.teamId === teamId) out.push(p)
  }
  return out
}
