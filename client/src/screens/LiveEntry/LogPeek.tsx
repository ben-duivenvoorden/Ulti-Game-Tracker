import type { VisLogEntry, Player } from '@/core/types'
import { formatVisLogEntry, getVisLogColor, isMutedLogEntry } from '@/core/format'
import { UndoIcon } from '@/components/ui/Icons'

interface LogPeekProps {
  visLog: VisLogEntry[]
  players: Player[]
  onOpen: () => void
  onUndo: () => void
}

// Thin strip that sits between the header and the body. Two surfaces:
//   - LEFT (flex-1): the last visible log entry as a tappable preview that
//     opens the full log sheet. Muted-coloured by event type.
//   - RIGHT: a prominent Undo button. Undo is the most common correction
//     during live recording so it lives here, always visible, not buried
//     in a sheet.
export function LogPeek({ visLog, players, onOpen, onUndo }: LogPeekProps) {
  const last = visLog.length > 0 ? visLog[visLog.length - 1] : null
  const color = last ? getVisLogColor(last.type) : 'var(--color-dim)'
  const muted = last ? isMutedLogEntry(last.type) : true
  const canUndo = visLog.length > 0

  return (
    <div
      className="flex-shrink-0 w-full h-9 flex items-stretch"
      style={{
        background: 'var(--color-surf)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 h-full px-3 flex items-center justify-between cursor-pointer transition-colors"
        style={{
          color: muted ? 'var(--color-muted)' : color,
          fontSize: 13,
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
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className="flex-shrink-0 px-4 h-full cursor-pointer text-sm font-semibold tracking-wider disabled:opacity-25 disabled:cursor-default flex items-center justify-center gap-1.5"
        style={{
          background: 'var(--color-warn-bg)',
          color:      'var(--color-warn)',
          borderLeft: '1px solid var(--color-border)',
        }}
        title="Undo last event"
      >
        <UndoIcon size={14} />UNDO
      </button>
    </div>
  )
}
