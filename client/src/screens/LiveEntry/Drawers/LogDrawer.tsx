import { useLayoutEffect, useRef, useState } from 'react'
import type { VisLogEntry, Player, EventId } from '@/core/types'
import { formatVisLogEntry, getVisLogColor, isMutedLogEntry } from '@/core/format'
import { Label } from '@/components/ui/Label'
import { Drawer } from './Drawer'

interface LogDrawerProps {
  visLog: VisLogEntry[]
  players: Player[]
  expanded: boolean
  /** When set, entries with id > cursor are greyed/struck-through and the
   *  cursor entry itself is marked with a thick border + ▶ glyph. */
  truncateCursor: EventId | null
  /** Edit-mode range: entries with id in [from..to] render with a strike +
   *  warn-tint background. null = no range selected. */
  editRange: { from: EventId; to: EventId } | null
  /** True while edit mode is active — long-press sets the replace range
   *  instead of triggering selection. */
  editActive: boolean
  onToggle:    () => void
  onUndo:      () => void
  onSetCursor: (cursor: EventId | null) => void
  /** Long-press handler. Only fires for the edit-range flow; selection
   *  mode is handled inside the drawer. */
  onLongPress: (entryId: EventId) => void
  /** Copy a (possibly non-contiguous) set of selected entries. */
  onCopySelection: (ids: EventId[]) => void
  /** Read the system clipboard and attempt to paste. Caller decides where. */
  onPaste: () => void
  /** Enter edit mode. Available during a live game too — not only from the
   *  Game Over banner. Caller passes undefined to hide the affordance (e.g.
   *  while already in edit mode). */
  onBeginEdit?: () => void
}

export const LOG_DRAWER_W = 280
const LONG_PRESS_MS = 500

export function LogDrawer({
  visLog, players, expanded, truncateCursor, editRange, editActive,
  onToggle, onUndo, onSetCursor, onLongPress, onCopySelection, onPaste,
  onBeginEdit,
}: LogDrawerProps) {
  const logRef = useRef<HTMLDivElement>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)
  const [pressedId, setPressedId] = useState<EventId | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<EventId>>(() => new Set())

  // Pin the scroll to the most-recent entry whenever the log changes OR the
  // drawer expands. The drawer's children are unmounted while collapsed, so
  // every expansion is effectively a fresh mount of this scroller — without
  // the `expanded` dep, the scrollTop stays at 0 and the user sees the
  // oldest events first.
  useLayoutEffect(() => {
    if (expanded && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [visLog.length, expanded])

  const enterSelection = (id: EventId) => {
    setSelectionMode(true)
    setSelectedIds(new Set([id]))
  }
  const cancelSelection = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }
  const toggleSelected = (id: EventId) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const copySelected = () => {
    const ids = [...selectedIds].sort((a, b) => a - b)
    if (ids.length === 0) return
    onCopySelection(ids)
    cancelSelection()
  }

  const startPress = (id: EventId) => {
    longPressFired.current = false
    setPressedId(id)
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      longPressTimer.current = null
      setPressedId(null)
      // In selection mode long-press behaves the same as a tap (toggle).
      // In edit mode we delegate to the parent (sets the replace range).
      // Otherwise we enter selection with that entry.
      if (selectionMode) {
        toggleSelected(id)
      } else if (editActive) {
        onLongPress(id)
      } else {
        enterSelection(id)
      }
    }, LONG_PRESS_MS)
  }
  const cancelPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    setPressedId(null)
  }
  const tapEntry = (id: EventId) => {
    // If the long-press already fired, the tap event is a release after — ignore.
    if (longPressFired.current) {
      longPressFired.current = false
      return
    }
    if (selectionMode) {
      toggleSelected(id)
      return
    }
    onSetCursor(truncateCursor === id ? null : id)
  }

  const longPressHint = selectionMode
    ? 'Tap to toggle selection'
    : editActive
      ? 'Long-press to set range end'
      : 'Long-press to select for copy'

  return (
    <Drawer
      side="right"
      expanded={expanded}
      width={LOG_DRAWER_W}
      onToggle={onToggle}
      rail={<LogRailIcon />}
      footer={<UndoButton expanded={expanded} onClick={onUndo} />}
    >
      {selectionMode ? (
        <SelectionHeader
          count={selectedIds.size}
          onCopy={copySelected}
          onCancel={cancelSelection}
        />
      ) : (
        <LogHeader
          onSelect={visLog.length > 0 ? () => setSelectionMode(true) : undefined}
          onPaste={onPaste}
          onBeginEdit={!editActive && visLog.length > 0 ? onBeginEdit : undefined}
        />
      )}

      <div ref={logRef} className="flex-1 p-1.5 flex flex-col gap-0.5 overflow-y-auto">
        {visLog.length === 0 ? (
          <Label className="py-2 text-center block">No events yet</Label>
        ) : (
          visLog.map(e => {
            const color    = getVisLogColor(e.type)
            const muted    = isMutedLogEntry(e.type)
            const past     = truncateCursor !== null && e.id > truncateCursor
            const isCursor = !selectionMode && truncateCursor !== null && e.id === truncateCursor
            const inRange  = editRange !== null && e.id >= editRange.from && e.id <= editRange.to
            const pressed  = pressedId === e.id
            const selected = selectionMode && selectedIds.has(e.id)
            return (
              <div
                key={e.id}
                onClick={() => tapEntry(e.id)}
                onPointerDown={() => startPress(e.id)}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                onPointerCancel={cancelPress}
                className="py-1 px-2 rounded text-[11px] text-center cursor-pointer select-none"
                style={{
                  borderLeft: `${isCursor ? 3 : 2}px solid ${color}`,
                  background: selected
                    ? `${color}33`
                    : inRange
                      ? 'var(--color-warn-bg)'
                      : `${color}12`,
                  color: muted ? 'var(--color-muted)' : color,
                  fontFamily: e.type === 'system' || e.type === 'point-start' ? 'var(--font-mono)' : 'var(--font-sans)',
                  opacity: past ? 0.4 : 1,
                  textDecoration: past || inRange ? 'line-through' : 'none',
                  outline: selected
                    ? `2px solid ${color}`
                    : pressed
                      ? '2px solid var(--color-warn)'
                      : 'none',
                  transition: 'outline 120ms, background 120ms',
                }}
                title={isCursor ? 'Tap to cancel preview' : longPressHint}
              >
                {selected && <span style={{ marginRight: 4 }}>✓</span>}
                {isCursor && <span style={{ marginRight: 4 }}>▶</span>}
                {formatVisLogEntry(e, players)}
              </div>
            )
          })
        )}
      </div>
    </Drawer>
  )
}

function LogHeader({
  onSelect, onPaste, onBeginEdit,
}: {
  onSelect?: () => void
  onPaste: () => void
  onBeginEdit?: () => void
}) {
  return (
    <div
      className="flex-shrink-0 h-7 flex items-center justify-between px-2"
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      <button
        onClick={onPaste}
        className="cursor-pointer text-muted hover:text-content transition-colors flex items-center justify-center"
        style={{ width: 20, height: 20 }}
        title="Paste from clipboard"
      >
        <PasteIcon />
      </button>
      <Label>EVENT LOG</Label>
      <div className="flex items-center gap-1">
        {onBeginEdit && (
          <button
            onClick={onBeginEdit}
            className="cursor-pointer text-muted hover:text-content transition-colors flex items-center justify-center"
            style={{ width: 20, height: 20 }}
            title="Edit log — select a range to replace"
          >
            <EditIcon />
          </button>
        )}
        {onSelect ? (
          <button
            onClick={onSelect}
            className="cursor-pointer text-muted hover:text-content transition-colors flex items-center justify-center"
            style={{ width: 20, height: 20 }}
            title="Enter selection mode"
          >
            <SelectIcon />
          </button>
        ) : (
          <span className="w-5" />
        )}
      </div>
    </div>
  )
}

function SelectionHeader({
  count, onCopy, onCancel,
}: {
  count: number
  onCopy: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="flex-shrink-0 h-7 flex items-stretch text-[11px] font-semibold tracking-widest"
      style={{
        background: 'var(--color-warn-bg)',
        color:      'var(--color-warn)',
        borderBottom: '1px solid var(--color-warn)',
      }}
    >
      <button
        onClick={onCancel}
        className="px-2 cursor-pointer"
        title="Exit selection"
      >
        ✕
      </button>
      <div className="flex-1 flex items-center justify-center">
        {count} SELECTED
      </div>
      <button
        onClick={onCopy}
        disabled={count === 0}
        className="px-3 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ borderLeft: '1px solid var(--color-warn)' }}
        title="Copy selected to clipboard"
      >
        COPY
      </button>
    </div>
  )
}

function UndoButton({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 flex items-center justify-center gap-2 cursor-pointer transition-colors hover:text-content"
      style={{
        height: 36,
        background: 'var(--color-surf)',
        borderTop: '1px solid var(--color-border)',
        color: 'var(--color-muted)',
      }}
      title="Undo last event"
    >
      <UndoIcon />
      {expanded && (
        <span style={{ fontSize: 11, letterSpacing: 0.4 }}>UNDO</span>
      )}
    </button>
  )
}

// Curved counter-clockwise arrow — distinct from the rail's three-line glyph
// and from any single-character ↩, so the affordance reads at a glance even
// when the drawer is collapsed to its 28px rail.
function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8a5 5 0 1 0 1.5-3.5" />
      <polyline points="2,2 2,5 5,5" />
    </svg>
  )
}

function PasteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="8" height="9" rx="1" />
      <rect x="5" y="1.5" width="4" height="2.5" rx="0.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

function SelectIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="10" height="10" rx="2" strokeDasharray="2 1.5" />
      <polyline points="4.5,7.5 6.5,9.5 10,5.5" />
    </svg>
  )
}

function LogRailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <rect x="2" y="3" width="10" height="1.4" rx="0.7" />
      <rect x="2" y="6.3" width="10" height="1.4" rx="0.7" />
      <rect x="2" y="9.6" width="10" height="1.4" rx="0.7" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 11.5 L2.5 9.5 L9.5 2.5 L11.5 4.5 L4.5 11.5 Z" />
      <path d="M8 4 L10 6" />
    </svg>
  )
}
