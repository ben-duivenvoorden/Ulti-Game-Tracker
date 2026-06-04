import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { VisLogEntry, Player, EventId, DerivedGameState, RecordingOptions, TeamId, Team } from '@/core/types'
import { formatVisLogEntry, getVisLogColor, isMutedLogEntry } from '@/core/format'
import { detectLogPatterns } from '@/core/patterns'
import { canRecord } from '@/core/engine'
import { Btn } from '@/components/ui/Btn'
import { Label } from '@/components/ui/Label'
import { CloseIcon, CursorIcon } from '@/components/ui/Icons'

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
  teams:            Record<TeamId, Team>
  onInjurySub:      () => void
  onTimeout:        () => void
  onFoul:           () => void
  onPick:           () => void
  onResumeFromScore: (scoreA: number, scoreB: number, offenceTeam: TeamId) => void
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
            className="px-4 cursor-pointer flex items-center justify-center hover:text-content transition-colors"
            style={{ color: 'var(--color-muted)', borderLeft: '1px solid var(--color-border)' }}
            title="Close"
          >
            <CloseIcon size={18} />
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

  // Multi-event pattern annotations (Callahan, …) derived from the log.
  const patterns = useMemo(() => detectLogPatterns(visLog), [visLog])

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
            const pattern  = patterns.get(e.id)
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
                {isCursor && <CursorIcon size={10} />}{isCursor && ' '}
                {formatVisLogEntry(e, players)}
                {pattern && (
                  <span
                    className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-wide align-middle"
                    style={{ background: pattern.color, color: 'var(--color-bg)' }}
                  >
                    {pattern.label}
                  </span>
                )}
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
  const { state, recordingOptions, teams,
          onInjurySub, onTimeout, onFoul, onPick, onResumeFromScore } = props
  const can = (t: Parameters<typeof canRecord>[1]) => canRecord(state, t)
  const [resumeOpen, setResumeOpen] = useState(false)

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

      <Section title="RESYNC">
        <Btn variant="ghost" size="sm" full disabled={!can('score-resume')} onClick={() => setResumeOpen(true)}>
          Resume from score
        </Btn>
      </Section>

      {resumeOpen && (
        <ResumeFromScoreDialog
          teams={teams}
          score={state.score}
          onCancel={() => setResumeOpen(false)}
          onConfirm={(a, b, offence) => { setResumeOpen(false); onResumeFromScore(a, b, offence) }}
        />
      )}
    </div>
  )
}

// Resync after missing points: enter the current score and say which team is on
// Offence (they receive — the other team pulls the resumed point).
function ResumeFromScoreDialog({
  teams, score, onCancel, onConfirm,
}: {
  teams:     Record<TeamId, Team>
  score:     { A: number; B: number }
  onCancel:  () => void
  onConfirm: (scoreA: number, scoreB: number, offenceTeam: TeamId) => void
}) {
  const [a, setA] = useState(score.A)
  const [b, setB] = useState(score.B)
  const [offence, setOffence] = useState<TeamId>('A')

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onCancel}
    >
      <div
        className="rounded-xl p-5 w-full max-w-sm flex flex-col gap-4"
        style={{ background: 'var(--color-surf)', border: '1px solid var(--color-border-2)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="text-sm font-bold text-content">Resume from score</div>
        <div className="text-[12px]" style={{ color: 'var(--color-muted)' }}>
          Set the current score and which team is on offence. If the score is past half-time, half time is recorded automatically.
        </div>

        <div className="flex items-stretch gap-3">
          <ScoreSpinner label={teams.A.short} color={teams.A.color} value={a} onChange={setA} />
          <ScoreSpinner label={teams.B.short} color={teams.B.color} value={b} onChange={setB} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>ON OFFENCE (RECEIVES) — OTHER TEAM PULLS</Label>
          <div className="flex gap-2">
            {(['A', 'B'] as TeamId[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setOffence(t)}
                className="flex-1 h-10 rounded-md border text-sm font-semibold cursor-pointer transition-colors"
                style={{
                  background:  offence === t ? `${teams[t].color}22` : 'transparent',
                  borderColor: offence === t ? `${teams[t].color}88` : 'var(--color-border)',
                  color:       offence === t ? teams[t].color : 'var(--color-muted)',
                }}
              >
                {teams[t].short}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 mt-1">
          <Btn variant="ghost"   size="md" full onClick={onCancel}>Cancel</Btn>
          <Btn variant="primary" size="md" full onClick={() => onConfirm(a, b, offence)}>Resume</Btn>
        </div>
      </div>
    </div>
  )
}

function ScoreSpinner({
  label, color, value, onChange,
}: {
  label:    string
  color:    string
  value:    number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1.5">
      <span className="text-xs font-bold truncate max-w-full" style={{ color }}>{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-8 h-8 rounded-md border text-lg font-bold cursor-pointer"
          style={{ background: 'var(--color-surf-3)', borderColor: 'var(--color-border-2)', color: 'var(--color-content)' }}
        >−</button>
        <span className="w-8 text-center text-2xl font-display font-bold tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="w-8 h-8 rounded-md border text-lg font-bold cursor-pointer"
          style={{ background: 'var(--color-surf-3)', borderColor: 'var(--color-border-2)', color: 'var(--color-content)' }}
        >+</button>
      </div>
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
