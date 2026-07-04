import { useEffect, useMemo, useState } from 'react'
import {
  useSession, useDerivedState, useVisLog, useGameActions, useUiState, useRecordingOptions,
  useTruncateCursor, useDisplayEndsSwapped, useTeamsState,
} from '@/core/selectors'
import { otherTeam, UNKNOWN_PLAYER, type Player, type PlayerId, type TeamId, type VisLogEntry } from '@/core/types'
import { isPickMode, pickActiveTeam, resolveContextLabel } from '@/core/pickModes'
import { firstNameKey } from '@/core/teams/shortName'
import { inkOn } from '@/core/contrast'
import { Header } from './Header'
import { LogPeek } from './LogPeek'
import { PlayerColumn } from './PlayerColumn'
import { EventColumn } from './EventColumn'
import { PassNotation } from './PassNotation'
import { BottomSheet, type SheetTab } from './BottomSheet'
import { SankeyBridge } from './SankeyBridge'
import { VoiceReviewSheet } from './VoiceReviewSheet'
import { Btn } from '@/components/ui/Btn'
import { MomentBackdrop } from '@/components/MomentBackdrop'
import { ModalScrim } from '@/components/ModalScrim'
import { VoicePTT } from '@/components/VoicePTT'
import { CloseIcon } from '@/components/ui/Icons'
import { getVoice, resultWords, type VoiceCaptureResult } from '@/core/voice/plugin'
import { buildMatcher } from '@/core/voice/match'
import { parseNarration, type ParsedNarration } from '@/core/voice/parse'

// True until the active team's possession run has at least 2 recorded
// disc-in-hand events — i.e. the current holder hasn't received a pass
// yet (they picked up after a turnover / block, or are the interceptor
// that just won the disc).
//
// `intercept` counts alongside `possession` because it puts the disc in
// the interceptor's hand the same way a catch does (the engine sets
// discHolder=interceptor). Without that, the post-intercept first-pass
// receiver would still be treated as the first possession and
// "Receiver Error" would stay locked.
//
// `block` does NOT count — the disc is dead after a block, and the
// follow-up `possession` event (whoever picks it up) is the first
// in-hand event on the chain.
//
// Special case: when the chain starts with a `pull` / `pull-bonus`, the
// first possession event is a *pull catch* — the receiver might have
// dropped it (receiver error off the pull). Treat as not-first so the
// Receiver Error button stays available.
function isFirstPossession(visLog: VisLogEntry[], teamId: TeamId): boolean {
  let count = 0
  for (let i = visLog.length - 1; i >= 0; i--) {
    const e = visLog[i]
    if ((e.type === 'possession' || e.type === 'intercept') && e.teamId === teamId) {
      count++
      if (count >= 2) return false
    } else {
      if (count === 1 && (e.type === 'pull' || e.type === 'pull-bonus')) {
        return false
      }
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

  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetTab, setSheetTab] = useState<SheetTab>('log')
  const openSheet = (tab: SheetTab) => { setSheetTab(tab); setSheetOpen(true) }
  // Display orientation — derived from a transient store baseline + the
  // visible log. Goals flip it; half-time may flip it conditionally; the
  // swap button just toggles the baseline. See `deriveEndsSwapped`.
  const endsSwapped = useDisplayEndsSwapped()

  // Per-team player-tile ordering override (long-press to enter Move
  // mode → tap another tile to swap). Session-only, resets per mount.
  // The override is a permutation of the engine's active-line player
  // IDs; we degrade gracefully when the line changes (sub on / off).
  const [lineOrderOverride, setLineOrderOverride] = useState<Record<TeamId, PlayerId[] | null>>({ A: null, B: null })
  const [moveSelectedId, setMoveSelectedId] = useState<PlayerId | null>(null)
  // Running-start backfill picker — open when an empty `+` slot is tapped.
  const [backfillOpen, setBackfillOpen] = useState(false)

  // Voice narration: PTT (in-play only — voice never drives the pull) →
  // parse against the active lines → review sheet → recordVoiceEvents.
  const teamsState = useTeamsState()
  const voice = getVoice()
  const [voiceParsed, setVoiceParsed] = useState<ParsedNarration | null>(null)

  const phase   = state?.gamePhase
  const pickMode = isPickMode(ui.uiMode) ? ui.uiMode : null

  const activeTeam: TeamId | null = state
    ? (pickMode
        ? pickActiveTeam(pickMode, state.possession)
        : phase === 'awaiting-pull'
          ? otherTeam(state.possession)
          : state.possession)
    : null

  const activePlayers = useMemo<Player[]>(() => {
    if (!state || !activeTeam) return []
    const engineLine = state.activeLine[activeTeam]
    const override = lineOrderOverride[activeTeam]
    // Default order is alphabetical by first name; a transient Move-mode
    // override (when present) takes precedence over that default.
    if (!override) return [...engineLine].sort((a, b) => firstNameKey(a.name).localeCompare(firstNameKey(b.name)))
    // Apply override: place players in override order, append any new
    // arrivals (engine line drifted since the override was captured).
    const byId = new Map(engineLine.map(p => [p.id, p]))
    const seen = new Set<PlayerId>()
    const out: Player[] = []
    for (const id of override) {
      const p = byId.get(id)
      if (p) { out.push(p); seen.add(id) }
    }
    for (const p of engineLine) {
      if (!seen.has(p.id)) out.push(p)
    }
    return out
  }, [state, activeTeam, lineOrderOverride])

  const effectiveVisLog = useMemo(
    () => (truncateCursor === null ? visLog : visLog.filter(e => e.id <= truncateCursor)),
    [visLog, truncateCursor],
  )

  const firstPossession = !!activeTeam && phase === 'in-play' && isFirstPossession(effectiveVisLog, activeTeam)

  useEffect(() => {
    if (truncateCursor !== null) return
    if (phase === 'point-over' || phase === 'half-time') actions.nextPoint()
  }, [phase, actions, truncateCursor])

  if (!session || !state || !activeTeam) return null

  const { teams } = session.gameConfig

  const isGameOver = phase === 'game-over'
  const previewing = truncateCursor !== null

  const defendingShort = teams[otherTeam(state.possession)].short
  const activeTeamColor = teams[activeTeam].color

  // ── Recording canvas ─────────────────────────────────────────────────────
  // Player column sits on the side of the active team's score chip — so
  // Team A's possession reads A-on-the-left (or the mirror when endsSwapped
  // flips both header chips AND grid). PassNotation overlays the player
  // column itself; the middle grid cell is just a narrow spacer between the
  // player and event columns.
  const playerLeft = endsSwapped ? activeTeam === 'B' : activeTeam === 'A'
  const handleTap = (player: Player) => {
    if (moveSelectedId !== null) {
      if (moveSelectedId === player.id) {
        setMoveSelectedId(null)
        return
      }
      // Swap moveSelectedId and player.id in the active team's order.
      const baseOrder = lineOrderOverride[activeTeam] ?? activePlayers.map(p => p.id)
      const idxA = baseOrder.indexOf(moveSelectedId)
      const idxB = baseOrder.indexOf(player.id)
      if (idxA >= 0 && idxB >= 0) {
        const next = [...baseOrder]
        next[idxA] = player.id
        next[idxB] = moveSelectedId
        setLineOrderOverride({ ...lineOrderOverride, [activeTeam]: next })
      }
      setMoveSelectedId(null)
      return
    }
    actions.tapPlayer(player)
  }
  const handleLongPress = (player: Player) => {
    setMoveSelectedId(player.id)
  }
  const handleRemove = (player: Player) => {
    actions.editActiveLine(activeTeam, activePlayers.filter(p => p.id !== player.id).map(p => p.id))
    setMoveSelectedId(null)
  }
  const recording = phase === 'in-play' || phase === 'awaiting-pull'

  // Event-mode candidates = both active lines (small set → high accuracy);
  // aliases resolved from the global players log by id.
  const onVoiceResult = (result: VoiceCaptureResult) => {
    const lineFor = (t: TeamId) => state.activeLine[t]
    const speakables = [...lineFor('A'), ...lineFor('B')].map(p => ({
      id:            p.id,
      name:          p.name,
      spokenAliases: teamsState.playersById.get(p.id)?.spokenAliases ?? [],
    }))
    const teamOf = (id: PlayerId): TeamId | null =>
      lineFor('A').some(p => p.id === id) ? 'A'
        : lineFor('B').some(p => p.id === id) ? 'B'
        : null
    const parsed = parseNarration(resultWords(result), buildMatcher(speakables), {
      pointIndex: state.pointIndex,
      possession: state.possession,
      discHolder: state.discHolder,
      teamOf,
      passes:    recordingOptions.passes,
      stall:     recordingOptions.stall,
      pullBonus: recordingOptions.pullBonus,
      brick:     recordingOptions.brick,
      awaitingPull: phase === 'awaiting-pull',
      selPuller:    ui.selPuller,
    })
    // A pure "injury" call has nothing to record — jump straight to the
    // injury line editor instead of showing an empty review sheet.
    if (parsed.followUp === 'injury-sub' && parsed.events.length === 0 && parsed.issues.length === 0) {
      actions.triggerInjurySub()
      return
    }
    setVoiceParsed(parsed)
  }
  const voiceBias = state.activeLine.A.concat(state.activeLine.B)
    .flatMap(p => [p.name.split(/\s+/)[0], ...(teamsState.playersById.get(p.id)?.spokenAliases ?? [])])
    .concat([
      'to', 'score', 'goal', 'drop', 'throwaway', 'stall', 'block', 'intercept', 'callahan',
      'pull', 'bonus', 'brick', 'foul', 'pick', 'timeout', 'undo', 'injury',
    ])
    .join(', ')
  // Shared tile count: players (or the running-start lineSize) plus
  // the always-present Unknown-Player tile. Drives the event-column
  // padding AND the Sankey geometry so all three columns stay
  // row-aligned.
  const playerSlotCount =
    Math.max(activePlayers.length, recording ? recordingOptions.lineSize : 0) + 1
  const playerColumn = (
    <div className="relative h-full">
      <PlayerColumn
        players={activePlayers}
        teamColor={activeTeamColor}
        holderId={state.discHolder}
        pullerId={ui.selPuller}
        onTap={handleTap}
        onLongPress={handleLongPress}
        moveSelectedId={moveSelectedId}
        lineSize={recording ? recordingOptions.lineSize : undefined}
        onAddSlot={() => setBackfillOpen(true)}
        onRemove={handleRemove}
        onUnknownPlayer={() => handleTap(UNKNOWN_PLAYER)}
      />
      <PassNotation
        visLog={effectiveVisLog}
        players={activePlayers}
        slotCount={playerSlotCount}
        activeTeam={activeTeam}
        teamColor={activeTeamColor}
        passesEnabled={recordingOptions.passes}
        playersOn={playerLeft ? 'left' : 'right'}
      />
    </div>
  )
  const centreSpacer = <div className="w-4 h-full" />  // 16 px — halved again from 32 px
  // Narration covers the whole live grammar (pulls, passes, outcomes, calls,
  // undo); only history preview and pick-mode suspend it. First-run setup
  // (permission + model) works regardless.
  const narrationReady = (phase === 'in-play' || phase === 'awaiting-pull') && !previewing && pickMode === null
  const eventColumn = (
    <EventColumn
      state={state}
      recordingOptions={recordingOptions}
      firstPossession={firstPossession}
      pullerSelected={ui.selPuller !== null}
      teamColor={activeTeamColor}
      playerCount={playerSlotCount}
      isPicking={pickMode !== null}
      onGoal={actions.recordGoal}
      onThrowaway={actions.recordThrowAway}
      onReceiverError={actions.recordReceiverError}
      onBlock={() => actions.triggerDefBlock('block')}
      onIntercept={() => actions.triggerDefBlock('intercept')}
      onStall={actions.recordStall}
      onUnknownTurnover={actions.recordUnknownTurnover}
      onPull={() => actions.recordPull(false)}
      onPullBonus={() => actions.recordPull(true)}
      onBrick={actions.recordBrick}
      onMore={() => openSheet('more')}
    />
  )
  const activePlayerId = state.discHolder ?? ui.selPuller
  // The Unknown-Player tile renders in the row directly after the
  // roster (it isn't a member of activePlayers), so its active index
  // is activePlayers.length — feed that to the Sankey so the wrap
  // appears around it just like any active player.
  const activeIdx = activePlayerId === null
    ? -1
    : activePlayerId === UNKNOWN_PLAYER.id
      ? activePlayers.length
      : activePlayers.findIndex(p => p.id === activePlayerId)
  // Visible action count drives where the Sankey wrap's event-
  // side bottom edge lands (just below the last action button,
  // above the spacer + More button).
  const actionCount = phase === 'in-play'
    // RE/Throw/Block/Intercept + [Stall] + Unknown turnover + Goal
    // (Unknown player moved to the player column).
    ? (4 + (recordingOptions.stall ? 1 : 0) + 1 + 1)
    : phase === 'awaiting-pull'
      ? (1 + (recordingOptions.pullBonus ? 1 : 0) + (recordingOptions.brick ? 1 : 0))
      : 0

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <Header
        teams={teams}
        score={state.score}
        endsSwapped={endsSwapped}
        onToggleEnds={actions.toggleEndsSwapped}
        onBack={actions.backToGameList}
      />

      {pickMode && (
        <ModeBanner
          onClick={actions.cancelPickMode}
          title="Tap to cancel"
          label={resolveContextLabel(pickMode, { defendingShort })}
          hint="TAP TO CANCEL"
        />
      )}

      {previewing && !pickMode && (
        <ModeBanner
          onClick={() => actions.setTruncateCursor(null)}
          title="Tap to cancel preview"
          label="VIEWING HISTORY · RECORD TO TRUNCATE FORWARD"
          hint="TAP TO CANCEL"
        />
      )}

      <LogPeek
        visLog={visLog}
        players={[...session.gameConfig.rosters.A, ...session.gameConfig.rosters.B]}
        onOpen={() => openSheet('log')}
        onUndo={actions.undo}
      />

      <div className="flex-1 relative overflow-hidden" style={{ minWidth: 0 }}>
        {isGameOver ? (
          <GameOverBanner
            score={state.score}
            teams={teams}
            onBack={actions.backToGameList}
          />
        ) : (
          <div className="relative h-full">
            <SankeyBridge
              activeIdx={activeIdx}
              playerCount={playerSlotCount}
              actionCount={actionCount}
              playerLeft={playerLeft}
              teamColor={activeTeamColor}
              awaitingPull={phase === 'awaiting-pull'}
            />
            <div
              className="h-full grid relative"
              style={{ gridTemplateColumns: '1fr auto 1fr' }}
            >
              {playerLeft
                ? <>{playerColumn}{centreSpacer}{eventColumn}</>
                : <>{eventColumn}{centreSpacer}{playerColumn}</>}
            </div>
          </div>
        )}

        <BottomSheet
          open={sheetOpen}
          activeTab={sheetTab}
          onTabChange={setSheetTab}
          onClose={() => setSheetOpen(false)}
          visLog={visLog}
          players={[...session.gameConfig.rosters.A, ...session.gameConfig.rosters.B]}
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

        {voiceParsed && (
          <VoiceReviewSheet
            parsed={voiceParsed}
            onApply={events => {
              const ok = actions.recordVoiceEvents(events.map(e => e.input))
              // "injury" spoken alongside events: apply them, then open the
              // injury line editor (the part no event can express).
              if (ok && voiceParsed.followUp === 'injury-sub') actions.triggerInjurySub()
              return ok
            }}
            onClose={() => setVoiceParsed(null)}
          />
        )}

        {backfillOpen && (
          <BackfillPicker
            bench={session.gameConfig.rosters[activeTeam].filter(
              p => !activePlayers.some(a => a.id === p.id),
            )}
            teamColor={activeTeamColor}
            onPick={(player) => {
              actions.editActiveLine(activeTeam, [...activePlayers.map(p => p.id), player.id])
              setBackfillOpen(false)
            }}
            onClose={() => setBackfillOpen(false)}
          />
        )}
      </div>

      {/* Voice footer — the narration PTT gets its own centred row so it
          never fights the columns for space. Hidden once the game is over. */}
      {voice && !isGameOver && (
        <div
          className="flex-shrink-0 flex items-center justify-center py-2"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <VoicePTT
            voice={voice}
            bias={voiceBias}
            onResult={onVoiceResult}
            disabled={!narrationReady}
            title={narrationReady
              ? 'Hold and narrate — pulls, passes, calls, undo'
              : 'Narration paused while previewing / picking'}
          />
        </div>
      )}
    </div>
  )
}

// Running-start backfill: pick a bench player to drop into an empty line slot
// mid-point. Sorted by first name to match the rest of the app.
function BackfillPicker({
  bench, teamColor, onPick, onClose,
}: {
  bench:     Player[]
  teamColor: string
  onPick:    (player: Player) => void
  onClose:   () => void
}) {
  const sorted = [...bench].sort((a, b) => firstNameKey(a.name).localeCompare(firstNameKey(b.name)))
  return (
    <ModalScrim
      onDismiss={onClose}
      align="bottom"
      variant="bare"
      z={30}
      panelClassName="w-full flex flex-col"
      panelStyle={{ background: 'var(--color-bg)', borderTop: `2px solid ${teamColor}`, maxHeight: '70%' }}
    >
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <span className="text-xs font-mono tracking-widest" style={{ color: 'var(--color-muted)' }}>
          ADD PLAYER TO LINE
        </span>
        <button onClick={onClose} className="cursor-pointer text-muted hover:text-content flex items-center" title="Cancel"><CloseIcon size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2">
        {sorted.length === 0 ? (
          <div className="col-span-2 text-center py-6 text-sm" style={{ color: 'var(--color-muted)' }}>
            No bench players available.
          </div>
        ) : sorted.map(p => (
          <button
            key={p.id}
            onClick={() => onPick(p)}
            className="h-12 rounded-lg border cursor-pointer flex items-center justify-center px-2 text-center truncate"
            style={{ background: teamColor, color: inkOn(teamColor), borderColor: teamColor, fontWeight: 600 }}
          >
            {p.name}
          </button>
        ))}
      </div>
    </ModalScrim>
  )
}

// Full-width transient mode strip stacked under the Header (pick mode,
// rewind/preview). Two centred lines: the context label, then the cancel
// hint on its own line so neither gets cramped or truncated.
function ModeBanner({ tone = 'warn', onClick, title, label, hint }: {
  tone?:    'warn' | 'success'
  onClick?: () => void
  title?:   string
  label:    string
  hint?:    string
}) {
  const color = tone === 'success' ? 'var(--color-success)'    : 'var(--color-warn)'
  const bg    = tone === 'success' ? 'var(--color-success-bg)' : 'var(--color-warn-bg)'
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex-shrink-0 w-full flex flex-col items-center justify-center py-1.5 text-[11px] font-semibold tracking-widest cursor-pointer leading-tight"
      style={{ background: bg, color, borderBottom: `1px solid ${color}` }}
    >
      <span>{label}</span>
      {hint && <span style={{ opacity: 0.7, marginTop: 2 }}>{hint}</span>}
    </button>
  )
}

function GameOverBanner({
  score, teams, onBack,
}: {
  score: { A: number; B: number }
  teams: Record<TeamId, { name: string; short: string; color: string }>
  onBack: () => void
}) {
  const winner: TeamId = score.A >= score.B ? 'A' : 'B'
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <MomentBackdrop tint={teams[winner].color} />
      <div className="relative z-10 flex flex-col items-center gap-4 px-6">
        <div className="text-xs tracking-[0.3em] font-mono text-muted" style={{ animation: 'fadeUp 460ms ease-out both' }}>GAME OVER</div>
        <div
          className="text-7xl font-display font-bold tabular-nums leading-none"
          style={{ color: teams[winner].color, animation: 'fadeUp 460ms ease-out both', animationDelay: '80ms' }}
        >
          {score.A} <span className="font-sans font-black" style={{ color: 'var(--color-dim)' }}>–</span> {score.B}
        </div>
        <div className="text-sm text-muted" style={{ animation: 'fadeUp 460ms ease-out both', animationDelay: '160ms' }}>{teams[winner].name} wins</div>
        <div style={{ animation: 'fadeUp 460ms ease-out both', animationDelay: '240ms' }}>
          <Btn variant="ghost" size="md" onClick={onBack}>Back to games</Btn>
        </div>
      </div>
    </div>
  )
}
