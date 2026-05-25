import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  useSession, useDerivedState, useVisLog, useGameActions, useUiState, useRecordingOptions,
  useTruncateCursor, useNotification, useDisplayEndsSwapped,
} from '@/core/selectors'
import { otherTeam, type Player, type PlayerId, type TeamId, type VisLogEntry } from '@/core/types'
import { isPickMode, pickActiveTeam, resolveContextLabel } from '@/core/pickModes'
import { Header } from './Header'
import { LogPeek } from './LogPeek'
import { PlayerColumn } from './PlayerColumn'
import { EventColumn } from './EventColumn'
import { PassNotation } from './PassNotation'
import { BottomSheet, type SheetTab } from './BottomSheet'
import { Btn } from '@/components/ui/Btn'

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
  const notification     = useNotification()

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
    if (!override) return engineLine
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
  const ineligibleIds: never[] = []

  const isGameOver = phase === 'game-over'
  const previewing = truncateCursor !== null

  const defendingShort = teams[otherTeam(state.possession)].short
  const activeTeamColor = teams[activeTeam].color

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

      {previewing && !pickMode && (
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
          (() => {
            // Player column sits on the side of the active team's score
            // chip — so Team A's possession reads A-on-the-left (or the
            // mirror when endsSwapped flips both header chips AND grid).
            // PassNotation overlays the player column itself; the middle
            // grid cell is just a narrow spacer between the player and
            // event columns.
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
            const playerColumn = (
              <div className="relative h-full">
                <PlayerColumn
                  players={activePlayers}
                  teamColor={activeTeamColor}
                  holderId={state.discHolder}
                  pullerId={ui.selPuller}
                  ineligibleIds={ineligibleIds}
                  onTap={handleTap}
                  onLongPress={handleLongPress}
                  moveSelectedId={moveSelectedId}
                />
                <PassNotation
                  visLog={effectiveVisLog}
                  players={activePlayers}
                  activeTeam={activeTeam}
                  teamColor={activeTeamColor}
                  passesEnabled={recordingOptions.passes}
                  playersOn={playerLeft ? 'left' : 'right'}
                />
              </div>
            )
            const centreSpacer = <div className="w-4 h-full" />  // 16 px — halved again from 32 px
            const eventColumn = (
              <EventColumn
                state={state}
                recordingOptions={recordingOptions}
                firstPossession={firstPossession}
                pullerSelected={ui.selPuller !== null}
                teamColor={activeTeamColor}
                playerCount={activePlayers.length}
                isPicking={pickMode !== null}
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
            )
            const activePlayerId = state.discHolder ?? ui.selPuller
            const activeIdx = activePlayerId !== null
              ? activePlayers.findIndex(p => p.id === activePlayerId)
              : -1
            // Visible action count drives where the Sankey wrap's event-
            // side bottom edge lands (just below the last action button,
            // above the spacer + More button).
            const actionCount = phase === 'in-play'
              ? (4 + (recordingOptions.stall ? 1 : 0) + 1) // RE/Throw/Block/Intercept/[Stall]/Goal
              : phase === 'awaiting-pull'
                ? (1 + (recordingOptions.pullBonus ? 1 : 0) + (recordingOptions.brick ? 1 : 0))
                : 0
            return (
              <div className="relative h-full">
                <SankeyBridge
                  activeIdx={activeIdx}
                  playerCount={activePlayers.length}
                  actionCount={actionCount}
                  playerLeft={playerLeft}
                  teamColor={activeTeamColor}
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
            )
          })()
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

// Sankey-style ribbon connecting the active player tile to the event
// column. Smooth Bezier curves flow from the tile's facing edge to the
// event column's facing edge, with the same team-colour wash + stroke
// as the tile and column borders, so the two regions read as one
// outlined / washed group with the events "expanding out" from the
// active player.
//
// Pixel positions are approximated from the player count + active row
// index plus the known centre-spacer width (32) and column padding (6 px).
// The SVG sizes itself from a ResizeObserver on its wrapper so the
// path stays in real pixels regardless of viewport scale.
// Sankey-style ribbon that wraps the active player tile, the bridge,
// and the action-button region of the event column as ONE outlined
// shape. No internal sub-borders — the active player tile and the
// event column themselves render without borders so the only outline
// visible is this combined wrap. Inside the wrap, a faint team-colour
// wash fills the whole region; action buttons retain their own solid
// colours (Goal green, Throw away red, etc.) and sit on top.
//
// The shape's vertical extent on the events side covers only the
// action-button stack (NOT the gap below or the More button) — so
// More sits outside the encompass.
function SankeyBridge({
  activeIdx, playerCount, actionCount, playerLeft, teamColor,
}: {
  activeIdx:   number
  playerCount: number
  /** Number of action buttons (RE / Throw / Block / Intercept / [Stall] / Goal
   *  on in-play; Pull / Bonus / Brick on awaiting-pull). The encompass
   *  stops at the bottom of these — the More button below is outside. */
  actionCount: number
  playerLeft:  boolean
  teamColor:   string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    if (!ref.current) return
    const update = () => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setSize({ w: r.width, h: r.height })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])

  const LANE_W  = 16   // matches the centre spacer (w-4)
  const COL_PAD = 12   // matches PlayerColumn/EventColumn p-3
  const GAP     = 16   // matches PlayerColumn/EventColumn gap-4
  // Outer corners of the encompass — larger than the pill's own rounded-xl
  // (12 px) so the wrap reads as a softer ribbon around the pill rather
  // than tracing its corners tightly.
  const RADIUS  = 18
  const EVT_PAD     = 9   // px the encompass extends past the action tiles on all four sides
  const PLAYER_PAD  = 9   // px the encompass extends past the active player tile on all four sides
  // How far INSIDE each region's bridge-facing edge the bezier attaches.
  // Larger = shorter flat segments along both the player pill and the
  // events region, so the sankey curve begins earlier on both sides
  // rather than springing off the very corners.
  const BRIDGE_INSET = 12
  // Bezier control-point bias along the bridge. Higher = control points
  // sit closer to the opposite tile, so the curve stays flat next to the
  // tile it springs from and only bends in the middle. Smooths the
  // perceived transition where the bridge meets the straight tile edges.
  const BRIDGE_EASE = 1

  if (activeIdx < 0 || size.w === 0 || size.h === 0 || playerCount <= 0 || actionCount <= 0) {
    return <div ref={ref} className="absolute inset-0 pointer-events-none" aria-hidden />
  }

  const W = size.w
  const H = size.h
  const colWidth = (W - LANE_W) / 2

  // Player + event column tile heights both derive from playerCount so
  // every action tile matches every player tile.
  const innerH = H - 2 * COL_PAD
  const tileH  = (innerH - (playerCount - 1) * GAP) / playerCount

  // Active-tile vertical extent (in player column). Padded out by
  // PLAYER_PAD so the encompass surrounds the tile rather than tracing
  // its edges directly.
  const tileTopRaw    = COL_PAD + activeIdx * (tileH + GAP)
  const tileBottomRaw = tileTopRaw + tileH
  const activeTop     = tileTopRaw - PLAYER_PAD
  const activeBottom  = tileBottomRaw + PLAYER_PAD

  // Action-button-region vertical extent (in event column). Stops at the
  // bottom of the last action button; spacer + More live below this.
  // EVT_PAD pushes the outline OUTWARD on all four event-side edges so the
  // encompass visibly surrounds the action tiles without sitting on top of
  // their borders.
  const evtTop         = COL_PAD - EVT_PAD
  const evtStackBottom = COL_PAD + actionCount * (tileH + GAP) - GAP + EVT_PAD

  // When the action list has fewer items than the player column (some
  // Recording Options disabled), the spacer between the last action
  // tile and More leaves vertical room that the encompass can sweep
  // into for a comfier bottom corner. The further down we extend, the
  // larger the BR/BL corner radius — so the curve eases gracefully into
  // the previously-vacant rows rather than tucking tight against Goal.
  const vacantBelow = Math.max(
    0,
    (playerCount - 1 - actionCount) * (tileH + GAP) - EVT_PAD,
  )
  const COMFY_EXT   = Math.min(vacantBelow * 0.5, tileH * 0.4)
  const evtBottom   = evtStackBottom + COMFY_EXT
  // Bottom event-side corner radius scales with the extension so the
  // curve visibly sweeps when there's room, and falls back to RADIUS
  // when the stack fills the column.
  const BR_RADIUS_RAW = RADIUS + COMFY_EXT * 1.5
  const BR_RADIUS     = Math.max(
    RADIUS,
    Math.min(BR_RADIUS_RAW, evtBottom - evtTop - RADIUS - 4),
  )

  // Active-tile horizontal extent — also pushed out by PLAYER_PAD on
  // both the outer side AND the bridge-facing side.
  const tileR = (playerLeft ? colWidth - COL_PAD : W - COL_PAD)             + PLAYER_PAD
  const tileL = (playerLeft ? COL_PAD            : colWidth + LANE_W + COL_PAD) - PLAYER_PAD

  // Event-region horizontal extent — also pushed out by EVT_PAD.
  const evtL  = playerLeft ? colWidth + LANE_W + COL_PAD - EVT_PAD : COL_PAD - EVT_PAD
  const evtR  = playerLeft ? W - COL_PAD + EVT_PAD          : colWidth - COL_PAD + EVT_PAD

  // Source/target points for the bridge curves — the edges that face
  // each other across the pass lane. Both are pulled INWARD from the
  // padded edges by BRIDGE_INSET, so the flat segments along the
  // pill's and the events region's top/bottom are shorter and the
  // bezier begins/ends earlier on both sides.
  const sourceX = playerLeft ? tileR - BRIDGE_INSET : tileL + BRIDGE_INSET
  const targetX = playerLeft ? evtL  + BRIDGE_INSET : evtR  - BRIDGE_INSET
  // Asymmetric control-point X coords — biased toward the OTHER tile so
  // the bezier eases out of the tile it springs from. Replaces ctrlMid
  // (which sat exactly halfway, causing a sharp bend right at the joint).
  const ctrlPX  = sourceX + (targetX - sourceX) * BRIDGE_EASE
  const ctrlEX  = targetX - (targetX - sourceX) * BRIDGE_EASE

  // Helper: SVG rounded-corner arc. Use the same RADIUS as the player
  // tile rounded-lg so the active-tile portion of the outline matches
  // inactive tile corners.
  const arc = (x: number, y: number) => `A ${RADIUS} ${RADIUS} 0 0 1 ${x} ${y}`

  // Build the closed outline tracing clockwise around the combined
  // shape (active tile + bridge + events region). The four "outer"
  // corners get rounded; the bridge attaches to straight edges next to
  // each tile (the bridge-side of the tile has no corner — the bezier
  // curve takes over directly).
  const d = playerLeft
    ? [
        `M ${tileL + RADIUS} ${activeTop}`,
        `L ${sourceX} ${activeTop}`,
        `C ${ctrlPX} ${activeTop}, ${ctrlEX} ${evtTop}, ${targetX} ${evtTop}`,
        `L ${evtR - RADIUS} ${evtTop}`,
        arc(evtR, evtTop + RADIUS),
        `L ${evtR} ${evtBottom - BR_RADIUS}`,
        `A ${BR_RADIUS} ${BR_RADIUS} 0 0 1 ${evtR - BR_RADIUS} ${evtBottom}`,
        `L ${targetX} ${evtBottom}`,
        `C ${ctrlEX} ${evtBottom}, ${ctrlPX} ${activeBottom}, ${sourceX} ${activeBottom}`,
        `L ${tileL + RADIUS} ${activeBottom}`,
        arc(tileL, activeBottom - RADIUS),
        `L ${tileL} ${activeTop + RADIUS}`,
        arc(tileL + RADIUS, activeTop),
        'Z',
      ].join(' ')
    : [
        `M ${tileR - RADIUS} ${activeTop}`,
        `L ${sourceX} ${activeTop}`,
        `C ${ctrlPX} ${activeTop}, ${ctrlEX} ${evtTop}, ${targetX} ${evtTop}`,
        `L ${evtL + RADIUS} ${evtTop}`,
        `A ${RADIUS} ${RADIUS} 0 0 0 ${evtL} ${evtTop + RADIUS}`,
        `L ${evtL} ${evtBottom - BR_RADIUS}`,
        `A ${BR_RADIUS} ${BR_RADIUS} 0 0 0 ${evtL + BR_RADIUS} ${evtBottom}`,
        `L ${targetX} ${evtBottom}`,
        `C ${ctrlEX} ${evtBottom}, ${ctrlPX} ${activeBottom}, ${sourceX} ${activeBottom}`,
        `L ${tileR - RADIUS} ${activeBottom}`,
        `A ${RADIUS} ${RADIUS} 0 0 0 ${tileR} ${activeBottom - RADIUS}`,
        `L ${tileR} ${activeTop + RADIUS}`,
        `A ${RADIUS} ${RADIUS} 0 0 0 ${tileR - RADIUS} ${activeTop}`,
        'Z',
      ].join(' ')

  return (
    <div
      ref={ref}
      className="absolute inset-0 pointer-events-none"
      aria-hidden
    >
      <svg width={W} height={H} style={{ display: 'block' }}>
        <path
          d={d}
          fill={`${teamColor}39`}
          stroke={`${teamColor}cc`}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </svg>
    </div>
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
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 px-6">
        <div className="text-xs tracking-widest font-mono text-muted">GAME OVER</div>
        <div className="text-5xl font-black tabular-nums" style={{ color: teams[winner].color }}>
          {score.A} – {score.B}
        </div>
        <div className="text-sm text-muted">{teams[winner].name} wins</div>
        <Btn variant="ghost" size="md" onClick={onBack}>Back to games</Btn>
      </div>
    </div>
  )
}
