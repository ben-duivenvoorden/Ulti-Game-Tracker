import { useEffect, useMemo, useState } from 'react'
import {
  useSession, useDerivedState, useVisLog, useGameActions, useUiState, useRecordingOptions,
  useTruncateCursor, useEditMode, useNotification,
} from '@/core/selectors'
import { computeVisLog } from '@/core/engine'
import { otherTeam, type EventId, type Player, type TeamId, type VisLogEntry } from '@/core/types'
import { isPickMode, pickActiveTeam, resolveContextLabel } from '@/core/pickModes'
import { Header } from './Header'
import { LogPeek } from './LogPeek'
import { PlayerColumn } from './PlayerColumn'
import { EventColumn } from './EventColumn'
import { PassLane } from './PassLane'
import { BottomSheet, type SheetTab } from './BottomSheet'
import { Btn } from '@/components/ui/Btn'

// True until the active team's possession run has at least 2 recorded
// possession events — i.e. the current holder hasn't received a pass yet
// (they picked up after a pull / turnover, or are the interceptor).
function isFirstPossession(visLog: VisLogEntry[], teamId: TeamId): boolean {
  let count = 0
  for (let i = visLog.length - 1; i >= 0; i--) {
    const e = visLog[i]
    if (e.type === 'possession' && e.teamId === teamId) {
      count++
      if (count >= 2) return false
    } else {
      break
    }
  }
  return true
}

export default function LiveEntry() {
  const session          = useSession()
  const state            = useDerivedState()
  const visLog           = useVisLog()
  const ui               = useUiState()
  const actions          = useGameActions()
  const recordingOptions = useRecordingOptions()
  const truncateCursor   = useTruncateCursor()
  const editMode         = useEditMode()
  const notification     = useNotification()

  // Bottom sheet — opens on log-peek tap or on MORE button.
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetTab, setSheetTab] = useState<SheetTab>('log')
  const openSheet = (tab: SheetTab) => { setSheetTab(tab); setSheetOpen(true) }

  const phase   = state?.gamePhase
  const pickMode = isPickMode(ui.uiMode) ? ui.uiMode : null

  const activeTeam: TeamId | null = state
    ? (pickMode
        ? pickActiveTeam(pickMode, state.possession)
        : phase === 'awaiting-pull'
          ? otherTeam(state.possession)
          : state.possession)
    : null

  const activePlayers = useMemo<Player[]>(
    () => (state && activeTeam ? state.activeLine[activeTeam] : []),
    [state, activeTeam],
  )

  const effectiveVisLog = useMemo(
    () => (truncateCursor === null ? visLog : visLog.filter(e => e.id <= truncateCursor)),
    [visLog, truncateCursor],
  )

  const firstPossession = !!activeTeam && phase === 'in-play' && isFirstPossession(effectiveVisLog, activeTeam)

  // Auto-advance to LineSelection after a goal or half-time.
  useEffect(() => {
    if (truncateCursor !== null) return
    if (phase === 'point-over' || phase === 'half-time') actions.nextPoint()
  }, [phase, actions, truncateCursor])

  if (!session || !state || !activeTeam) return null

  const { teams } = session.gameConfig
  const ineligibleIds = pickMode === 'receiver-error-pick' && state.discHolder !== null
    ? [state.discHolder]
    : []

  const isGameOver = phase === 'game-over'
  const previewing = truncateCursor !== null
  const editActive = !!editMode?.active
  const editRange  = editActive && editMode?.removeFromId !== null && editMode?.removeToId !== null
    ? { from: editMode.removeFromId, to: editMode.removeToId }
    : null

  const onLongPress = (entryId: EventId) => {
    if (editActive) {
      const fromId = truncateCursor ?? entryId
      void actions.setEditRange(fromId, entryId)
    }
  }

  const onPaste = () => {
    const lastId = visLog.length > 0 ? visLog[visLog.length - 1].id : null
    const targetId = truncateCursor ?? lastId
    if (targetId === null) {
      actions.dismissNotification()
      return
    }
    void actions.pasteFromClipboard(targetId)
  }

  const defendingShort = teams[otherTeam(state.possession)].short
  const activeTeamColor = teams[activeTeam].color

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <Header
        teams={teams}
        score={state.score}
        onBack={actions.backToGameList}
      />

      {/* Mode strip — mutually exclusive. */}
      {pickMode && (
        <button
          onClick={actions.cancelPickMode}
          className="flex-shrink-0 h-8 w-full flex items-center justify-center text-[11px] font-semibold tracking-widest cursor-pointer"
          style={{
            background: 'var(--color-warn-bg)',
            color: 'var(--color-warn)',
            borderBottom: '1px solid var(--color-warn)',
          }}
          title="Tap to cancel"
        >
          {resolveContextLabel(pickMode, { defendingShort })} · TAP TO CANCEL
        </button>
      )}

      {editActive && !pickMode && (
        <div
          className="flex-shrink-0 h-8 w-full flex items-stretch text-[11px] font-semibold tracking-widest"
          style={{
            background: 'var(--color-warn-bg)',
            color:      'var(--color-warn)',
            borderBottom: '1px solid var(--color-warn)',
          }}
        >
          <div className="flex-1 flex items-center justify-center">
            {editMode?.removeFromId !== null && editMode?.removeToId !== null
              ? `EDITING #${editMode.removeFromId}–#${editMode.removeToId}`
              : 'EDIT MODE — long-press a log entry to set the range end'}
          </div>
          {editMode?.removeFromId !== null && editMode?.removeToId !== null && (
            <button
              onClick={() => actions.commitEdit()}
              className="px-3 cursor-pointer"
              style={{ borderLeft: '1px solid var(--color-warn)' }}
            >
              DONE
            </button>
          )}
          <button
            onClick={() => actions.cancelEdit()}
            className="px-3 cursor-pointer"
            style={{ borderLeft: '1px solid var(--color-warn)' }}
          >
            CANCEL
          </button>
        </div>
      )}

      {previewing && !editActive && !pickMode && (
        <button
          onClick={() => actions.setTruncateCursor(null)}
          className="flex-shrink-0 h-8 w-full flex items-center justify-center text-[11px] font-semibold tracking-widest cursor-pointer"
          style={{
            background: 'var(--color-warn-bg)',
            color: 'var(--color-warn)',
            borderBottom: '1px solid var(--color-warn)',
          }}
          title="Tap to cancel preview"
        >
          VIEWING HISTORY · RECORD TO TRUNCATE FORWARD · TAP TO CANCEL
        </button>
      )}

      {notification && (
        <button
          onClick={actions.dismissNotification}
          className="flex-shrink-0 w-full px-3 py-1.5 text-[11px] font-semibold cursor-pointer text-left"
          style={{
            background: notification.kind === 'success' ? 'var(--color-success-bg)' : 'var(--color-warn-bg)',
            color:      notification.kind === 'success' ? 'var(--color-success)'    : 'var(--color-warn)',
            borderBottom: `1px solid ${notification.kind === 'success' ? 'var(--color-success)' : 'var(--color-warn)'}`,
          }}
        >
          {notification.message}
          {notification.detail && (
            <span style={{ opacity: 0.75, marginLeft: 8, fontWeight: 400 }}>· {notification.detail}</span>
          )}
        </button>
      )}

      <LogPeek
        visLog={visLog}
        players={[...session.gameConfig.rosters.A, ...session.gameConfig.rosters.B]}
        onOpen={() => openSheet('log')}
      />

      {/* Main body: PlayerColumn | PassLane | EventColumn */}
      <div className="flex-1 relative overflow-hidden" style={{ minWidth: 0 }}>
        {isGameOver ? (
          <GameOverBanner
            score={state.score}
            teams={teams}
            onBack={actions.backToGameList}
            onEdit={editActive ? undefined : actions.beginEdit}
          />
        ) : (
          <div className="h-full grid" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
            <PlayerColumn
              players={activePlayers}
              teamColor={activeTeamColor}
              holderId={state.discHolder}
              pullerId={ui.selPuller}
              ineligibleIds={ineligibleIds}
              onTap={actions.tapPlayer}
            />
            <PassLane
              visLog={effectiveVisLog}
              players={activePlayers}
              activeTeam={activeTeam}
              teamColor={activeTeamColor}
            />
            <EventColumn
              state={state}
              recordingOptions={recordingOptions}
              firstPossession={firstPossession}
              pullerSelected={ui.selPuller !== null}
              onGoal={actions.recordGoal}
              onThrowaway={actions.recordThrowAway}
              onReceiverError={actions.triggerReceiverError}
              onBlock={() => actions.triggerDefBlock('block')}
              onIntercept={() => actions.triggerDefBlock('intercept')}
              onStall={actions.recordStall}
              onPull={() => actions.recordPull(false)}
              onPullBonus={() => actions.recordPull(true)}
              onBrick={actions.recordBrick}
              onMore={() => openSheet('more')}
            />
          </div>
        )}

        <BottomSheet
          open={sheetOpen}
          activeTab={sheetTab}
          onTabChange={setSheetTab}
          onClose={() => setSheetOpen(false)}
          visLog={editActive && editMode ? computeVisLog(editMode.baselineSession.rawLog) : visLog}
          players={[...session.gameConfig.rosters.A, ...session.gameConfig.rosters.B]}
          truncateCursor={editActive ? null : truncateCursor}
          editRange={editRange}
          editActive={editActive}
          onSetCursor={actions.setTruncateCursor}
          onLongPress={onLongPress}
          onUndo={actions.undo}
          onCopySelection={actions.copyEventsToClipboard}
          onPaste={onPaste}
          onBeginEdit={editActive ? undefined : actions.beginEdit}
          state={state}
          recordingOptions={recordingOptions}
          onInjurySub={actions.triggerInjurySub}
          onTimeout={actions.recordTimeout}
          onFoul={actions.recordFoul}
          onPick={actions.recordPick}
          onHalfTime={actions.triggerHalfTime}
          onEndGame={actions.triggerEndGame}
        />
      </div>
    </div>
  )
}

function GameOverBanner({
  score, teams, onBack, onEdit,
}: {
  score: { A: number; B: number }
  teams: Record<TeamId, { name: string; short: string; color: string }>
  onBack: () => void
  onEdit?: () => void
}) {
  const winner: TeamId = score.A >= score.B ? 'A' : 'B'
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 px-6">
        <div className="text-xs tracking-widest font-mono text-muted">GAME OVER</div>
        <div className="text-5xl font-black tabular-nums" style={{ color: teams[winner].color }}>
          {score.A} – {score.B}
        </div>
        <div className="text-sm text-muted">{teams[winner].name} wins</div>
        <div className="flex gap-2">
          <Btn variant="ghost" size="md" onClick={onBack}>Back to games</Btn>
          {onEdit && <Btn variant="ghost" size="md" onClick={onEdit}>Edit log</Btn>}
        </div>
      </div>
    </div>
  )
}
