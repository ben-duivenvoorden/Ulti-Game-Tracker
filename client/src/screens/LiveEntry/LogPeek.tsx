import type { ReactNode } from 'react'
import type { VisLogEntry, Player } from '@/core/types'
import { formatVisLogEntry, getVisLogColor, isMutedLogEntry } from '@/core/format'
import { UndoIcon, WarnIcon } from '@/components/ui/Icons'

interface LogPeekProps {
  visLog: VisLogEntry[]
  players: Player[]
  onOpen: () => void
  onUndo: () => void
  /** The voice mic, docked at the left edge (kept away from UNDO so a
   *  mis-tap can't stop a capture AND pop an event). */
  voiceSlot?: ReactNode
  /** Voice narration problems this capture — amber chip when > 0. */
  warnCount?: number
  /** Full issue lines behind the count (title text on the chip). */
  warnDetail?: string
  onWarnClick?: () => void
}

// Thin strip that sits between the header and the body. Surfaces, left to
// right:
//   - voiceSlot: the narration mic (when a voice engine is present)
//   - the last visible log entry as a tappable preview that opens the full
//     log sheet — muted-coloured by event type
//   - an amber voice-issues chip (words/segments that didn't land cleanly)
//   - a prominent Undo button. Undo is the most common correction during
//     live recording so it lives here, always visible, not buried in a sheet.
export function LogPeek({ visLog, players, onOpen, onUndo, voiceSlot, warnCount = 0, warnDetail, onWarnClick }: LogPeekProps) {
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
      {voiceSlot}
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
          {/* Point-start lists the whole line — far too long for this one-line
              strip (it just truncates mid-name). Show a short label here; the
              full LOG sheet still renders the rosters via formatVisLogEntry. */}
          {!last
            ? 'No events yet'
            : last.type === 'point-start'
              ? '— Point Started —'
              : formatVisLogEntry(last, players)}
        </span>
        <span style={{ color: 'var(--color-muted)' }}>LOG ▾</span>
      </button>
      {warnCount > 0 && (
        <button
          type="button"
          onClick={onWarnClick}
          className="flex-shrink-0 px-3 h-full cursor-pointer flex items-center gap-1.5 text-sm font-semibold"
          style={{
            background: 'var(--color-warn-bg)',
            color:      'var(--color-warn)',
            borderLeft: '1px solid var(--color-border)',
          }}
          title={warnDetail || 'Voice narration issues — check the log'}
        >
          <WarnIcon size={14} />{warnCount}
        </button>
      )}
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
