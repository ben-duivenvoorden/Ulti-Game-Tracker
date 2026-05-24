import { useLayoutEffect, useRef, useState } from 'react'
import type { VisLogEntry, Player, EventId, DerivedGameState, RecordingOptions } from '@/core/types'
import { formatVisLogEntry, getVisLogColor, isMutedLogEntry } from '@/core/format'
import { canRecord } from '@/core/engine'
import { Btn } from '@/components/ui/Btn'
import { Label } from '@/components/ui/Label'

export type SheetTab = 'log' | 'more'

interface BottomSheetProps {
  open:       boolean
  activeTab:  SheetTab
  onTabChange: (tab: SheetTab) => void
  onClose:    () => void

  // Log tab
  visLog:          VisLogEntry[]
  players:         Player[]
  truncateCursor:  EventId | null
  editRange:       { from: EventId; to: EventId } | null
  editActive:      boolean
  onSetCursor:     (cursor: EventId | null) => void
  onLongPress:     (entryId: EventId) => void
  onUndo:          () => void
  onCopySelection: (ids: EventId[]) => void
  onPaste:         () => void
  onBeginEdit?:    () => void

  // More tab
  state:            DerivedGameState
  recordingOptions: RecordingOptions
  onInjurySub:      () => void
  onTimeout:        () => void
  onFoul:           () => void
  onPick:           () => void
  onHalfTime:       () => void
  onEndGame:        () => void
}

// Half-height overlay anchored to the bottom of the screen. Sits above the
// action zone (which stays visible behind / above the sheet so the recorder
// can still see what state they're in). Tap the backdrop to dismiss.
export function BottomSheet(props: BottomSheetProps) {
  if (!props.open) return null
  return (
    <div className="absolute inset-0 z-20 flex flex-col">
      {/* Backdrop — top half. Tap to dismiss. */}
      <button
        type="button"
        onClick={props.onClose}
        className="flex-1 cursor-pointer"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        aria-label="Close sheet"
      />

      {/* Sheet body — bottom half. */}
      <div
        className="flex-shrink-0 flex flex-col"
        style={{
          background:   'var(--color-bg)',
          borderTop:    '1px solid var(--color-border)',
          height:       '60%',
          minHeight:    340,
        }}
      >
        {/* Tab strip + close */}
        <div
          className="flex-shrink-0 flex items-stretch"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <TabBtn label="LOG"  active={props.activeTab === 'log'}  onClick={() => props.onTabChange('log')} />
          <TabBtn label="MORE" active={props.activeTab === 'more'} onClick={() => props.onTabChange('more')} />
          <button
            onClick={props.onClose}
            className="px-4 cursor-pointer"
            style={{ color: 'var(--color-muted)', borderLeft: '1px solid var(--color-border)' }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Tab body */}
        <div className="flex-1 overflow-hidden">
          {props.activeTab === 'log' ? <LogTab {...props} /> : <MoreTab {...props} />}
        </div>
      </div>
    </div>
  )
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 py-3 cursor-pointer text-xs tracking-widest font-semibold"
      style={{
        background:  active ? 'var(--color-surf-2)' : 'transparent',
        color:       active ? 'var(--color-content)' : 'var(--color-muted)',
        borderBottom: active ? '2px solid var(--color-team-a)' : '2px solid transparent',
      }}
    >
      {label}
    </button>
  )
}

// ─── Log tab ─────────────────────────────────────────────────────────────────
// Mirrors the old LogDrawer body — vis log entries with cursor / edit-range
// visualisation, selection mode for multi-tap copy, Undo / Edit / Paste rail.

const LONG_PRESS_MS = 500

function LogTab(props: BottomSheetProps) {
  const {
    visLog, players, truncateCursor, editRange, editActive,
    onSetCursor, onLongPress, onUndo, onCopySelection, onPaste, onBeginEdit,
  } = props

  const logRef = useRef<HTMLDivElement>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)
  const [pressedId, setPressedId] = useState<EventId | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<EventId>>(() => new Set())

  // Pin the scroll to the most-recent entry on open and whenever the log grows.
  useLayoutEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [visLog.length])

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
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      {selectionMode ? (
        <div
          className="flex-shrink-0 h-10 flex items-stretch text-xs font-semibold tracking-widest"
          style={{
            background: 'var(--color-warn-bg)',
            color:      'var(--color-warn)',
            borderBottom: '1px solid var(--color-warn)',
          }}
        >
          <button onClick={cancelSelection} className="px-3 cursor-pointer" title="Exit selection">✕</button>
          <div className="flex-1 flex items-center justify-center">{selectedIds.size} SELECTED</div>
          <button onClick={copySelected} className="px-3 cursor-pointer" disabled={selectedIds.size === 0}>COPY</button>
        </div>
      ) : (
        <div
          className="flex-shrink-0 h-10 flex items-stretch text-xs"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <ToolBtn onClick={onUndo} disabled={visLog.length === 0}>↩ Undo</ToolBtn>
          <ToolBtn onClick={() => setSelectionMode(true)} disabled={visLog.length === 0}>Select</ToolBtn>
          {onBeginEdit && !editActive && (
            <ToolBtn onClick={onBeginEdit} disabled={visLog.length === 0}>Edit</ToolBtn>
          )}
          <ToolBtn onClick={onPaste}>Paste</ToolBtn>
        </div>
      )}

      {/* Log body */}
      <div ref={logRef} className="flex-1 p-2 flex flex-col gap-1 overflow-y-auto">
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
                className="py-1.5 px-2.5 rounded text-[12px] cursor-pointer select-none"
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
                  outline: selected ? `2px solid ${color}` : pressed ? '2px solid var(--color-warn)' : 'none',
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
    </div>
  )
}

function ToolBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex-1 cursor-pointer disabled:opacity-30 disabled:cursor-default"
      style={{ color: 'var(--color-muted)', borderRight: '1px solid var(--color-border)' }}
    >
      {children}
    </button>
  )
}

// ─── More tab ────────────────────────────────────────────────────────────────
// Stoppages + manual half-time / end-game.

function MoreTab(props: BottomSheetProps) {
  const { state, recordingOptions,
          onInjurySub, onTimeout, onFoul, onPick, onHalfTime, onEndGame } = props
  const can = (t: Parameters<typeof canRecord>[1]) => canRecord(state, t)

  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-3">
      <Section title="STOPPAGES">
        <Btn variant="warn"  size="sm" full disabled={!can('injury-sub')} onClick={onInjurySub}>Injury Sub</Btn>
        <Btn variant="ghost" size="sm" full disabled={!can('timeout')}    onClick={onTimeout}>Timeout</Btn>
        {recordingOptions.foul && (
          <Btn variant="ghost" size="sm" full disabled={!can('foul')} onClick={onFoul}>Foul</Btn>
        )}
        {recordingOptions.pick && (
          <Btn variant="ghost" size="sm" full disabled={!can('pick')} onClick={onPick}>Pick</Btn>
        )}
      </Section>

      <Section title="MANUAL TRIGGERS">
        <Btn variant="ghost" size="sm" full disabled={!can('half-time')} onClick={onHalfTime}>Half Time</Btn>
        <Btn variant="ghost" size="sm" full disabled={!can('end-game')}  onClick={onEndGame}>End Game</Btn>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{title}</Label>
      {children}
    </div>
  )
}
