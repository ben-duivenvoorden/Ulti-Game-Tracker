import { useMemo, useState, type CSSProperties } from 'react'
import {
  useSession, useDerivedState, useVisLog, useGameActions,
  useRecordingOptions, useTruncateCursor, useSuggestedTransition,
} from '@/core/selectors'
import { UNKNOWN_PLAYER_ID, UNKNOWN_PLAYER, type TeamId, type VisLogEntry } from '@/core/types'
import { inkOn } from '@/core/contrast'
import { Btn } from '@/components/ui/Btn'
import { BottomSheet } from '@/screens/LiveEntry/BottomSheet'
import { ConfirmSheet } from '@/components/ConfirmSheet'
import { MomentBackdrop } from '@/components/MomentBackdrop'
import { WarnIcon, UndoIcon } from '@/components/ui/Icons'

// Full-screen point-completion splash shown after each goal, before line
// selection. Dismissible (tap to continue) and keeps undo + log accessible.
// Summarises the last point and flags data-quality holes (unknown player /
// unknown turnover) — highlighted, not enforced.
export default function PointSummary() {
  const session          = useSession()
  const state            = useDerivedState()
  const visLog           = useVisLog()
  const actions          = useGameActions()
  const recordingOptions = useRecordingOptions()
  const truncateCursor   = useTruncateCursor()
  const suggestion       = useSuggestedTransition()
  const [sheetOpen, setSheetOpen]     = useState(false)
  const [dismissed, setDismissed]     = useState(false)
  const [confirmEnd, setConfirmEnd]   = useState(false)

  // Confirm the suggested transition then advance — dismissPointSummary
  // re-reads the session and routes correctly (line-selection after half-time,
  // game-over banner after end-game).
  const confirmSuggestion = () => {
    if (suggestion === 'half-time') actions.recordHalfTime()
    else actions.recordEndGame()
    actions.dismissPointSummary()
  }

  const players = useMemo(
    () => session ? [...session.gameConfig.rosters.A, ...session.gameConfig.rosters.B] : [],
    [session],
  )

  const summary = useMemo(() => summariseLastPoint(visLog), [visLog])

  if (!session || !state || !summary) return null

  const { teams } = session.gameConfig
  const scoringTeam: TeamId = summary.goalTeam
  const scorerName = summary.scorerId === UNKNOWN_PLAYER_ID
    ? UNKNOWN_PLAYER.name
    : (players.find(p => p.id === summary.scorerId)?.name ?? 'Unknown')

  // Staggered fade-up entrance — the screen mounts fresh each point, so a
  // CSS-only reveal keyed by child index is enough.
  const reveal = (i: number): CSSProperties => ({
    animation: 'fadeUp 460ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
    animationDelay: `${i * 70}ms`,
  })

  return (
    <div className="h-full flex flex-col bg-bg text-content relative overflow-hidden">
      <MomentBackdrop tint={teams[scoringTeam].color} />
      {/* Tap-anywhere-to-continue surface. The buttons below stop propagation. */}
      <button
        type="button"
        onClick={actions.dismissPointSummary}
        className="relative z-10 flex-1 w-full flex flex-col items-center justify-center gap-6 px-6 cursor-pointer select-none"
        aria-label="Continue to next point"
      >
        <div className="text-xs tracking-[0.3em] font-mono" style={{ color: 'var(--color-muted)', ...reveal(0) }}>
          POINT COMPLETE
        </div>

        <div
          className="px-4 py-1 rounded-full text-sm font-bold"
          style={{ background: teams[scoringTeam].color, color: inkOn(teams[scoringTeam].color), ...reveal(1) }}
        >
          {teams[scoringTeam].name}
        </div>

        <div className="text-8xl font-display font-bold tabular-nums leading-none" style={reveal(2)}>
          {state.score.A} <span className="text-dim font-sans font-black">–</span> {state.score.B}
        </div>

        <div className="text-base" style={{ color: 'var(--color-content)', ...reveal(3) }}>
          Goal — <span className="font-bold">{scorerName}</span>
        </div>

        <div className="text-sm" style={{ color: 'var(--color-muted)', ...reveal(4) }}>
          {summary.turnovers === 0
            ? 'Clean hold — no turnovers'
            : `${summary.turnovers} turnover${summary.turnovers === 1 ? '' : 's'} this point`}
        </div>

        {summary.hasUnknownData && (
          <div
            className="px-4 py-2 rounded-lg text-sm font-semibold text-center max-w-xs flex items-center gap-2"
            style={{ background: 'var(--color-warn-bg)', color: 'var(--color-danger)', border: '1px solid var(--color-danger)', ...reveal(5) }}
          >
            <WarnIcon size={18} />
            <span>Unknown data in this point — review the log to fill in who had the disc.</span>
          </div>
        )}

        <div className="text-[11px] tracking-widest font-mono mt-2" style={{ color: 'var(--color-dim)', ...reveal(6) }}>
          TAP ANYWHERE TO CONTINUE
        </div>
      </button>

      {/* Half-time / end-game suggestion — fires here, at the point boundary. */}
      {suggestion && !dismissed && (
        <div
          className="relative z-10 flex-shrink-0 flex items-stretch text-[11px] font-semibold tracking-widest"
          style={{
            background:   'var(--color-warn-bg)',
            color:        'var(--color-warn)',
            borderTop:    '1px solid var(--color-warn)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex-1 flex items-center justify-center px-3 py-2 text-center">
            {suggestion === 'half-time'
              ? 'HALF-TIME SCORE REACHED — CALL HALF TIME?'
              : 'SCORE CAP REACHED — END THE GAME?'}
          </div>
          <button
            onClick={confirmSuggestion}
            className="px-3 cursor-pointer font-semibold"
            style={{ borderLeft: '1px solid var(--color-warn)' }}
          >
            {suggestion === 'half-time' ? 'CALL HALF' : 'END GAME'}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="px-3 cursor-pointer"
            style={{ borderLeft: '1px solid var(--color-warn)' }}
          >
            NOT YET
          </button>
        </div>
      )}

      {/* Undo + log — kept reachable on this screen. */}
      <div
        className="flex-shrink-0 flex items-stretch gap-2 p-3 pb-2"
        style={{ borderTop: '1px solid var(--color-border)' }}
        onClick={e => e.stopPropagation()}
      >
        <Btn variant="default" size="md" full style={{ background: 'var(--color-warn-bg)', color: 'var(--color-warn)' }} onClick={actions.undoPointSummary}><UndoIcon size={15} /><span className="ml-1.5">Undo goal</span></Btn>
        <Btn variant="default" size="md" full onClick={() => setSheetOpen(true)}>View log</Btn>
        <Btn variant="primary" size="md" full onClick={actions.dismissPointSummary}>Next point</Btn>
      </div>

      {/* Manual end — the only path to `end-game` when the score cap won't be
          reached (time-capped formats: indoor 30-min games, league time caps).
          The score-cap banner above stays the fast path when it applies. */}
      <div className="flex-shrink-0 px-3 pb-3" onClick={e => e.stopPropagation()}>
        <Btn variant="ghost" size="sm" full onClick={() => setConfirmEnd(true)}>
          End game — time cap / final score
        </Btn>
      </div>

      <ConfirmSheet
        open={confirmEnd}
        title="End the game?"
        message={`Records ${state.score.A} – ${state.score.B} as the final score and marks the game complete.`}
        confirmLabel="End game"
        danger
        onConfirm={() => {
          setConfirmEnd(false)
          actions.recordEndGame()
          actions.dismissPointSummary()
        }}
        onCancel={() => setConfirmEnd(false)}
      />

      <BottomSheet
        open={sheetOpen}
        activeTab="log"
        onTabChange={() => { /* log-only on this screen */ }}
        onClose={() => setSheetOpen(false)}
        visLog={visLog}
        players={players}
        truncateCursor={truncateCursor}
        onSetCursor={actions.setTruncateCursor}
        state={state}
        recordingOptions={recordingOptions}
        teams={teams}
        onInjurySub={actions.triggerInjurySub}
        onTimeout={actions.recordTimeout}
        onFoul={actions.recordFoul}
        onPick={actions.recordPick}
        onResumeFromScore={actions.resumeFromScore}
      />
    </div>
  )
}

interface PointSummaryInfo {
  goalTeam:       TeamId
  scorerId:       number
  turnovers:      number
  hasUnknownData: boolean
}

// Walk back from the most recent goal to the point boundary that opened it
// (point-start / score-resume / half-time) and summarise what happened.
function summariseLastPoint(visLog: VisLogEntry[]): PointSummaryInfo | null {
  let goalIdx = -1
  for (let i = visLog.length - 1; i >= 0; i--) {
    if (visLog[i].type === 'goal') { goalIdx = i; break }
  }
  if (goalIdx < 0) return null
  const goal = visLog[goalIdx]
  if (goal.type !== 'goal') return null

  let startIdx = 0
  for (let i = goalIdx - 1; i >= 0; i--) {
    const t = visLog[i].type
    if (t === 'point-start' || t === 'score-resume' || t === 'half-time') { startIdx = i; break }
  }

  const pointEvents = visLog.slice(startIdx, goalIdx + 1)
  const turnovers = pointEvents.filter(e =>
    e.type === 'turnover-throw-away' || e.type === 'turnover-receiver-error'
    || e.type === 'turnover-stall' || e.type === 'turnover-unknown'
    || e.type === 'block' || e.type === 'intercept').length
  const hasUnknownData = pointEvents.some(e =>
    e.type === 'turnover-unknown'
    || ('playerId' in e && e.playerId === UNKNOWN_PLAYER_ID))

  return {
    goalTeam:  goal.teamId,
    scorerId:  goal.playerId,
    turnovers,
    hasUnknownData,
  }
}
