import { useEffect, useMemo, useState } from 'react'
import {
  useSession, useDerivedState, useVisLog, useGameActions, useUiState, useRecordingOptions,
  useTruncateCursor, useEditMode, useNotification,
} from '@/core/selectors'
import { useGameStore, applyLineOverride } from '@/core/store'
import { computeVisLog } from '@/core/engine'
import { otherTeam, type EventId, type Player, type TeamId, type VisLogEntry } from '@/core/types'
import { isPickMode, pickActiveTeam } from '@/core/pickModes'
import { Header } from './Header'
import { Stage, type StageMode } from './Canvas/Stage'
import type { PassArrowSpec } from './Canvas/PassArrowLayer'
import type { ChipAction, ChipId } from './Canvas/layout'
import { LogDrawer, LOG_DRAWER_W } from './Drawers/LogDrawer'
import { AdminDrawer, ADMIN_DRAWER_W } from './Drawers/AdminDrawer'
import { DRAWER_RAIL_W } from './Drawers/Drawer'
import { useStageSize } from './Canvas/useStageSize'
import { Btn } from '@/components/ui/Btn'

// True until the active team's possession run has at least 2 recorded
// possession events — i.e. the current holder hasn't received a pass yet
// (they picked up after a pull / turnover, or are the intercepter). On
// each new possession run for the team this resets, so the "first pass"
// rule applies *every* time they get the disc fresh.
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

const FIRST_POSSESSION_DISABLED: ReadonlySet<ChipId> = new Set<ChipId>(['goal', 'rec'])
const NO_DISABLED: ReadonlySet<ChipId> = new Set<ChipId>()

// Derive pass arrows for the active team's *current* possession run.
//
// Walks the visLog backwards collecting consecutive `possession` events for
// `teamId`. Any other event (a turnover, block, intercept, pull/brick, the
// other team's possession, or point-start) breaks the chain — so as soon as
// the team loses possession, prior arrows are cleared. When they regain it
// later in the same point, only the new run shows.
//
// Returns at most `maxArrows` most recent arrows (newest last).
function derivePassArrows(
  visLog: VisLogEntry[],
  teamId: TeamId,
  players: Player[],
  maxArrows = 2,
): PassArrowSpec[] {
  type Possession = Extract<VisLogEntry, { type: 'possession' }>
  const chain: Possession[] = []
  for (let i = visLog.length - 1; i >= 0; i--) {
    const e = visLog[i]
    if (e.type === 'possession' && e.teamId === teamId) {
      chain.push(e)
    } else {
      break
    }
  }
  chain.reverse()

  const arrows: PassArrowSpec[] = []
  for (let i = 1; i < chain.length; i++) {
    const fromIdx = players.findIndex(p => p.id === chain[i - 1].playerId)
    const toIdx   = players.findIndex(p => p.id === chain[i].playerId)
    if (fromIdx >= 0 && toIdx >= 0) arrows.push({ fromIdx, toIdx })
  }
  return arrows.slice(-maxArrows)
}

const HEADER_H     = 48      // h-12
const PICK_STRIP_H = 32      // h-8

export default function LiveEntry() {
  // ── All hooks declared up front (no conditional hooks) ───────────────────
  const session          = useSession()
  const state            = useDerivedState()
  const visLog           = useVisLog()
  const ui               = useUiState()
  const actions          = useGameActions()
  const recordingOptions = useRecordingOptions()
  const pillSize         = useGameStore(s => s.pillSize)
  const stageSize        = useStageSize()
  const truncateCursor   = useTruncateCursor()
  const editMode         = useEditMode()
  const notification     = useNotification()

  // One drawer at most may be expanded at a time; toggling one collapses the
  // other. Drawers reserve their own width in the flex row, so the canvas
  // shrinks when a drawer expands rather than being overlaid.
  type ExpandedDrawer = 'log' | 'admin' | null
  const [expandedDrawer, setExpandedDrawer] = useState<ExpandedDrawer>(null)
  const logExpanded   = expandedDrawer === 'log'
  const adminExpanded = expandedDrawer === 'admin'
  const toggleDrawer = (which: 'log' | 'admin') =>
    setExpandedDrawer(prev => (prev === which ? null : which))

  // Active context — derived even when state is null so all hooks below can
  // run unconditionally. Default values are inert (null active team, empty
  // arrows, etc.) and the early return below the hooks guards rendering.
  const phase   = state?.gamePhase
  const pickMode = isPickMode(ui.uiMode) ? ui.uiMode : null

  const activeTeam: TeamId | null = state
    ? (pickMode
        ? pickActiveTeam(pickMode, state.possession)
        : phase === 'awaiting-pull'
          ? otherTeam(state.possession)
          : state.possession)
    : null

  const lineOverride = useGameStore(s => s.lineOrderOverride)

  const activePlayers = useMemo<Player[]>(
    () => {
      if (!state || !activeTeam) return []
      const engineLine = state.activeLine[activeTeam]
      const order = applyLineOverride(engineLine.map(p => p.id), lineOverride[activeTeam])
      const byId = new Map(engineLine.map(p => [p.id, p]))
      return order.map(id => byId.get(id)).filter((p): p is Player => p !== undefined)
    },
    [state, activeTeam, lineOverride],
  )

  // The full visLog still drives the LogDrawer (so greyed entries past the
  // cursor render). Anything that should reflect the historical view —
  // arrows, first-possession chip gating — gets the cursor-filtered version.
  const effectiveVisLog = useMemo(
    () => (truncateCursor === null ? visLog : visLog.filter(e => e.id <= truncateCursor)),
    [visLog, truncateCursor],
  )

  const arrows = useMemo(
    () => (activeTeam ? derivePassArrows(effectiveVisLog, activeTeam, activePlayers) : []),
    [effectiveVisLog, activeTeam, activePlayers],
  )

  // Goal and Receiver Error are disabled until the team has recorded at
  // least one pass within the current possession run. Only meaningful in
  // the in-play phase (pull-phase chips and pick-mode have their own gates).
  const disabledChipIds = useMemo<ReadonlySet<ChipId>>(() => {
    if (!activeTeam || pickMode || phase !== 'in-play') return NO_DISABLED
    return isFirstPossession(effectiveVisLog, activeTeam)
      ? FIRST_POSSESSION_DISABLED
      : NO_DISABLED
  }, [effectiveVisLog, activeTeam, pickMode, phase])

  // Auto-navigate to LineSelection after a goal or half-time. Skip while
  // previewing — otherwise rewinding to the moment of a goal would silently
  // navigate the user out of LiveEntry. Cancelling the preview re-runs this
  // against live state.
  useEffect(() => {
    if (truncateCursor !== null) return
    if (phase === 'point-over' || phase === 'half-time') actions.nextPoint()
  }, [phase, actions, truncateCursor])

  if (!session || !state || !activeTeam) return null

  const { teams } = session.gameConfig
  const stageMode: StageMode = pickMode
    ? 'pick'
    : phase === 'awaiting-pull'
      ? 'awaiting-pull'
      : 'in-play'

  const ineligibleIds = pickMode === 'receiver-error-pick' && state.discHolder !== null
    ? [state.discHolder]
    : []

  // Drawer rails (collapsed) and full panels (expanded) both reserve width
  // from the canvas. Compute the actual stage area = window - drawer widths
  // - header. Centre is the midpoint of that area; the Stage's coordinate
  // system is its parent's local space.
  const previewing = truncateCursor !== null
  const editActive = !!editMode?.active
  const editRange  = editActive && editMode?.removeFromId !== null && editMode?.removeToId !== null
    ? { from: editMode.removeFromId, to: editMode.removeToId }
    : null
  // History strip / pick strip / edit strip mutually exclude — pick clears
  // the cursor, edit replaces both — so adding one strip's height is enough.
  const stripActive = !!pickMode || previewing || editActive
  const headerH = HEADER_H + (stripActive ? PICK_STRIP_H : 0)
  const leftDrawerW  = adminExpanded ? ADMIN_DRAWER_W : DRAWER_RAIL_W
  const rightDrawerW = logExpanded   ? LOG_DRAWER_W   : DRAWER_RAIL_W
  const stageW  = Math.max(0, stageSize.w - leftDrawerW - rightDrawerW)
  const stageH  = Math.max(0, stageSize.h - headerH)
  const cx = stageW / 2
  const cy = stageH / 2

  // ─── Pill / chip dispatchers ────────────────────────────────────────────────
  const onPillTap = (player: Player) => {
    // tapPlayer in the engine covers all three flows: pick-mode dispatch,
    // puller-toggle in awaiting-pull, and auto-possession in in-play.
    actions.tapPlayer(player)
  }

  const onChipTap = (_player: Player, action: ChipAction) => {
    switch (action.kind) {
      case 'pull':            actions.recordPull(action.bonus); break
      case 'brick':           actions.recordBrick();            break
      case 'throwaway':       actions.recordThrowAway();        break
      case 'goal':            actions.recordGoal();             break
      case 'stall':           actions.recordStall();            break
      case 'def-block':       actions.triggerDefBlock(action.type); break
      case 'receiver-error':  actions.triggerReceiverError();   break
    }
  }

  const onBackgroundTap = () => {
    if (pickMode) actions.cancelPickMode()
  }

  const isGameOver = phase === 'game-over'

  // Long-press in edit mode sets the replace range. In normal mode the
  // LogDrawer handles long-press internally to enter multi-select; this
  // handler only fires for the edit-mode flow.
  const onLongPress = (entryId: EventId) => {
    if (editActive) {
      const fromId = truncateCursor ?? entryId
      void actions.setEditRange(fromId, entryId)
    }
  }

  // Paste lands at the truncate cursor if set, else after the most recent
  // event. Reads the system clipboard on demand — no background probing, so
  // the browser only prompts for permission when the user explicitly asks.
  const onPaste = () => {
    const lastId = visLog.length > 0 ? visLog[visLog.length - 1].id : null
    const targetId = truncateCursor ?? lastId
    if (targetId === null) {
      actions.dismissNotification()
      return
    }
    void actions.pasteFromClipboard(targetId)
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <Header
        teams={teams}
        score={state.score}
        pickMode={pickMode}
        defendingShort={teams[otherTeam(state.possession)].short}
        onBack={actions.backToGameList}
        onCancelPickMode={actions.cancelPickMode}
      />

      {notification && (
        <button
          onClick={actions.dismissNotification}
          className="flex-shrink-0 w-full px-3 py-1.5 text-[11px] font-semibold cursor-pointer text-left"
          style={{
            background: notification.kind === 'success' ? 'var(--color-success-bg)' : 'var(--color-warn-bg)',
            color:      notification.kind === 'success' ? 'var(--color-success)'                    : 'var(--color-warn)',
            borderBottom: `1px solid ${notification.kind === 'success' ? 'var(--color-success)' : 'var(--color-warn)'}`,
          }}
          title="Tap to dismiss"
        >
          {notification.message}
          {notification.detail && (
            <span style={{ opacity: 0.75, marginLeft: 8, fontWeight: 400 }}>· {notification.detail}</span>
          )}
        </button>
      )}

      {editActive && (
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
              : 'EDIT MODE — select range to replace'}
          </div>
          {editMode?.removeFromId !== null && editMode?.removeToId !== null && (
            <button
              onClick={() => actions.commitEdit()}
              className="px-3 cursor-pointer"
              style={{ borderLeft: '1px solid var(--color-warn)' }}
              title="Commit the edit"
            >
              DONE
            </button>
          )}
          <button
            onClick={() => actions.cancelEdit()}
            className="px-3 cursor-pointer"
            style={{ borderLeft: '1px solid var(--color-warn)' }}
            title="Discard edit"
          >
            CANCEL
          </button>
        </div>
      )}

      {previewing && !editActive && (
        // Same vocabulary as the pick-mode strip — tap to cancel the rewind.
        <button
          onClick={() => actions.setTruncateCursor(null)}
          className="flex-shrink-0 h-8 w-full flex items-center justify-center text-[11px] font-semibold tracking-widest cursor-pointer transition-colors"
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

      {/*
        Layout: AdminDrawer | Stage | LogDrawer (flex row).
        Drawers reserve their width so the canvas shrinks when one is
        expanded, rather than overlapping. Only one drawer expanded at a
        time (mutual exclusion via toggleDrawer).
      */}
      <div className="flex-1 flex overflow-hidden">
        <AdminDrawer
          state={state}
          recordingOptions={recordingOptions}
          expanded={adminExpanded}
          onToggle={() => toggleDrawer('admin')}
          onTimeout={actions.recordTimeout}
          onFoul={actions.recordFoul}
          onPick={actions.recordPick}
          onInjurySub={actions.triggerInjurySub}
          onHalfTime={actions.triggerHalfTime}
          onEndGame={actions.triggerEndGame}
          pillSize={pillSize}
          onCyclePillSize={actions.cyclePillSize}
        />

        <div className="flex-1 relative overflow-hidden" style={{ minWidth: 0 }}>
          {isGameOver ? (
            <GameOverBanner
              score={state.score}
              teams={teams}
              onBack={actions.backToGameList}
              onEdit={editActive ? undefined : actions.beginEdit}
            />
          ) : (
            <Stage
              // Re-key on team change so Stage remounts cleanly (physics + arrows reset).
              key={activeTeam}
              teamId={activeTeam}
              players={activePlayers}
              teamColor={teams[activeTeam].color}
              mode={stageMode}
              holderId={state.discHolder}
              pullerId={ui.selPuller}
              ineligibleIds={ineligibleIds}
              stallShown={recordingOptions.stall}
              bonusShown={recordingOptions.pullBonus}
              brickShown={recordingOptions.brick}
              pillSize={pillSize}
              disabledChipIds={disabledChipIds}
              arrows={arrows}
              centre={{ x: cx, y: cy }}
              bounds={{ w: stageW, h: stageH }}
              onPillTap={onPillTap}
              onChipTap={onChipTap}
              onBackgroundTap={onBackgroundTap}
            />
          )}
        </div>

        <LogDrawer
          // In edit mode, show the baseline log so the user can see the range
          // they're replacing (rendered with strike-through). Fresh draft
          // events aren't visible until commit — accepted tradeoff for v1.
          visLog={editActive && editMode ? computeVisLog(editMode.baselineSession.rawLog) : visLog}
          players={[...session.gameConfig.rosters.A, ...session.gameConfig.rosters.B]}
          expanded={logExpanded}
          truncateCursor={editActive ? null : truncateCursor}
          editRange={editRange}
          editActive={editActive}
          onToggle={() => toggleDrawer('log')}
          onUndo={actions.undo}
          onSetCursor={actions.setTruncateCursor}
          onLongPress={onLongPress}
          onCopySelection={actions.copyEventsToClipboard}
          onPaste={onPaste}
          onBeginEdit={actions.beginEdit}
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
