import type { VisLogEntry, Player } from '@/core/types'
import { formatVisLogEntry, getVisLogColor, isMutedLogEntry } from '@/core/format'

interface LogPeekProps {
  visLog: VisLogEntry[]
  players: Player[]
  onOpen: () => void
}

// Thin strip that sits between the header and the canvas. Shows the most
// recent visible log entry in muted text; tap anywhere on the strip to open
// the bottom sheet's Log tab.
export function LogPeek({ visLog, players, onOpen }: LogPeekProps) {
  const last = visLog.length > 0 ? visLog[visLog.length - 1] : null
  const color = last ? getVisLogColor(last.type) : 'var(--color-dim)'
  const muted = last ? isMutedLogEntry(last.type) : true

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex-shrink-0 w-full h-8 px-3 flex items-center justify-between cursor-pointer transition-colors"
      style={{
        background: 'var(--color-surf)',
        borderBottom: '1px solid var(--color-border)',
        color: muted ? 'var(--color-muted)' : color,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.4,
      }}
      title="Open event log"
    >
      <span className="truncate text-left flex-1 mr-2">
        {last ? formatVisLogEntry(last, players) : 'No events yet'}
      </span>
      <span style={{ color: 'var(--color-muted)' }}>LOG ▾</span>
    </button>
  )
}
