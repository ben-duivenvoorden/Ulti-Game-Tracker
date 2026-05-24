import { useLayoutEffect, useRef } from 'react'
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
  /** When set, entries with id > cursor are greyed/struck-through and the
   *  cursor entry itself is marked with a thick border + ▶ glyph. */
  truncateCursor:  EventId | null
  onSetCursor:     (cursor: EventId | null) => void

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

// Half-height overlay anchored to the bottom of the screen. Tap the
// backdrop to dismiss.
export function BottomSheet(props: BottomSheetProps) {
  if (!props.open) return null
  return (
    <div className="absolute inset-0 z-20 flex flex-col">
      <button
        type="button"
        onClick={props.onClose}
        className="flex-1 cursor-pointer"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        aria-label="Close sheet"
      />
      <div
        className="flex-shrink-0 flex flex-col"
        style={{
          background:   'var(--color-bg)',
          borderTop:    '1px solid var(--color-border)',
          height:       '60%',
          minHeight:    340,
        }}
      >
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
// Vis log entries with the truncate-cursor visualisation. Tap an entry
// to set the cursor (rewind); tap the same entry again to clear.
// Select / copy / paste / range-edit affordances have been removed —
// "go back in time and re-record" via the cursor is the only correction
// flow that lives here. (Inline single-event amend is a planned future
// addition.)

function LogTab(props: BottomSheetProps) {
  const { visLog, players, truncateCursor, onSetCursor } = props

  const logRef = useRef<HTMLDivElement>(null)

  // Pin the scroll to the most-recent entry on open and whenever the log grows.
  useLayoutEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [visLog.length])

  const tapEntry = (id: EventId) => {
    onSetCursor(truncateCursor === id ? null : id)
  }

  return (
    <div className="h-full flex flex-col">
      <div
        className="flex-shrink-0 h-9 flex items-center justify-center px-3 text-xs"
        style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-muted)' }}
      >
        Tap any entry to rewind · tap again to cancel
      </div>
      <div ref={logRef} className="flex-1 p-2 flex flex-col gap-1 overflow-y-auto">
        {visLog.length === 0 ? (
          <Label className="py-2 text-center block">No events yet</Label>
        ) : (
          visLog.map(e => {
            const color    = getVisLogColor(e.type)
            const muted    = isMutedLogEntry(e.type)
            const past     = truncateCursor !== null && e.id > truncateCursor
            const isCursor = truncateCursor !== null && e.id === truncateCursor
            return (
              <button
                key={e.id}
                onClick={() => tapEntry(e.id)}
                className="py-1.5 px-2.5 rounded text-[13px] cursor-pointer select-none text-left"
                style={{
                  borderLeft: `${isCursor ? 3 : 2}px solid ${color}`,
                  background: `${color}12`,
                  color: muted ? 'var(--color-muted)' : color,
                  fontFamily: e.type === 'system' || e.type === 'point-start' ? 'var(--font-mono)' : 'var(--font-sans)',
                  opacity: past ? 0.4 : 1,
                  textDecoration: past ? 'line-through' : 'none',
                }}
                title={isCursor ? 'Tap to cancel preview' : 'Tap to rewind to here'}
              >
                {isCursor && <span style={{ marginRight: 4 }}>▶</span>}
                {formatVisLogEntry(e, players)}
              </button>
            )
          })
        )}
      </div>
    </div>
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
