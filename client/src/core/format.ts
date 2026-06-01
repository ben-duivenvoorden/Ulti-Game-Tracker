import type { VisLogEntry, Player, PlayerId } from './types'
import { UNKNOWN_PLAYER_ID, UNKNOWN_PLAYER } from './types'

// UI-layer formatting for visual log entries.
// Engine produces structured data; this layer renders strings.
// Kept separate so i18n / alternative renderings can plug in here.

function nameLookup(players: Player[]) {
  return (id: PlayerId) => {
    if (id === UNKNOWN_PLAYER_ID) return UNKNOWN_PLAYER.name
    return players.find(p => p.id === id)?.name ?? String(id)
  }
}

export function formatVisLogEntry(entry: VisLogEntry, players: Player[]): string {
  const name = nameLookup(players)
  switch (entry.type) {
    case 'point-start': {
      const lineNames = (ids: PlayerId[] | undefined) =>
        Array.isArray(ids) ? ids.map(name).join(', ') : '—'
      return `— Point Started — A: ${lineNames(entry.lineA)} | B: ${lineNames(entry.lineB)}`
    }
    case 'pull':                     return `Pull — ${name(entry.playerId)}`
    case 'pull-bonus':               return `Pull Distance Bonus — ${name(entry.playerId)}`
    case 'brick':                    return `Brick — ${name(entry.playerId)}`
    case 'possession':               return `Possession: ${name(entry.playerId)}`
    case 'turnover-throw-away':      return `Throw Away — ${name(entry.playerId)}`
    case 'turnover-receiver-error':  return `Receiver Error — ${name(entry.playerId)}`
    case 'turnover-stall':           return `Stall — ${name(entry.playerId)}`
    case 'turnover-unknown':         return `Unknown Turnover — ${name(entry.playerId)}`
    case 'block':                    return `Blocked by Defence — ${name(entry.playerId)}`
    case 'intercept':                return `Intercepted by Defence — ${name(entry.playerId)}`
    case 'goal':                     return `Goal — ${name(entry.playerId)}`
    case 'injury-sub':               return `Injury Sub — ${entry.teamId}: ${Array.isArray(entry.line) ? entry.line.map(name).join(', ') : '—'}`
    case 'half-time':                return '— Half Time —'
    case 'end-game':                 return '— Game Over —'
    case 'score-resume':             return `— Resumed at ${entry.scoreA}–${entry.scoreB} —`
    case 'timeout':                  return 'Timeout'
    case 'foul':                     return 'Foul'
    case 'pick':                     return 'Pick'
    case 'system':                   return entry.text
  }
}

export function getVisLogColor(type: VisLogEntry['type']): string {
  switch (type) {
    case 'pull':
      return 'var(--color-team-a)'
    case 'pull-bonus':
      return 'var(--color-pull-bonus)'
    case 'brick':
      return 'var(--color-brick)'
    case 'possession':
      return 'var(--color-muted)'
    case 'turnover-throw-away':
      return 'var(--color-danger)'
    case 'turnover-unknown':
      // Eye-catching red — flags a data-quality hole alongside unknown-player.
      return 'var(--color-danger)'
    case 'turnover-receiver-error':
      return 'var(--color-warn)'
    case 'turnover-stall':
      return 'var(--color-stall)'
    case 'block':
      return 'var(--color-block)'
    case 'intercept':
      return 'var(--color-intercept)'
    case 'goal':
      return 'var(--color-success)'
    case 'injury-sub':
    case 'timeout':
    case 'foul':
    case 'pick':
      return 'var(--color-warn)'
    case 'point-start':
    case 'half-time':
    case 'end-game':
    case 'score-resume':
    case 'system':
      return 'var(--color-dim)'
  }
}

export function isMutedLogEntry(type: VisLogEntry['type']): boolean {
  return type === 'possession' || type === 'system' || type === 'point-start'
      || type === 'score-resume'
}

// Events that put the game into a "dead disc / waiting for pickup" state
// (gamePhase = 'in-play' with no discHolder).
export type DeadDiscEventType =
  | 'pull' | 'pull-bonus' | 'brick'
  | 'turnover-throw-away' | 'turnover-receiver-error' | 'turnover-stall'
  | 'block'

export function deadDiscLabel(type: DeadDiscEventType): string {
  switch (type) {
    case 'pull':
    case 'pull-bonus':              return 'DEAD DISC AFTER PULL'
    case 'brick':                   return 'DEAD DISC AFTER BRICK'
    case 'turnover-throw-away':     return 'DEAD DISC AFTER THROW AWAY'
    case 'turnover-receiver-error': return 'DEAD DISC AFTER RECEIVER ERROR'
    case 'turnover-stall':          return 'DEAD DISC AFTER STALL'
    case 'block':                   return 'DEAD DISC AFTER BLOCK BY DEFENCE'
  }
}

export function lastDeadDiscEvent(visLog: VisLogEntry[]): DeadDiscEventType | null {
  for (let i = visLog.length - 1; i >= 0; i--) {
    const t = visLog[i].type
    if (t === 'pull' || t === 'pull-bonus' || t === 'brick'
     || t === 'turnover-throw-away' || t === 'turnover-receiver-error' || t === 'turnover-stall'
     || t === 'block') {
      return t
    }
  }
  return null
}
