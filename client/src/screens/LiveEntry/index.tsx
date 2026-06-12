import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  useSession, useDerivedState, useVisLog, useGameActions, useUiState, useRecordingOptions,
  useTruncateCursor, useDisplayEndsSwapped,
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
import { useTween } from './useTween'
import { Btn } from '@/components/ui/Btn'
import { MomentBackdrop } from '@/components/MomentBackdrop'
import { CloseIcon } from '@/components/ui/Icons'

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
            const handleRemove = (player: Player) => {
              actions.editActiveLine(activeTeam, activePlayers.filter(p => p.id !== player.id).map(p => p.id))
              setMoveSelectedId(null)
            }
            const recording = phase === 'in-play' || phase === 'awaiting-pull'
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
          teams={teams}
          onInjurySub={actions.triggerInjurySub}
          onTimeout={actions.recordTimeout}
          onFoul={actions.recordFoul}
          onPick={actions.recordPick}
          onResumeFromScore={actions.resumeFromScore}
        />

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
    <div
      className="absolute inset-0 z-30 flex items-end"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="w-full flex flex-col"
        style={{ background: 'var(--color-bg)', borderTop: `2px solid ${teamColor}`, maxHeight: '70%' }}
        onClick={e => e.stopPropagation()}
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
  activeIdx, playerCount, actionCount, playerLeft, teamColor, awaitingPull,
}: {
  activeIdx:   number
  playerCount: number
  /** Number of action buttons (RE / Throw / Block / Intercept / [Stall] / Goal
   *  on in-play; Pull / Bonus / Brick on awaiting-pull). The encompass
   *  stops at the bottom of these — the More button below is outside. */
  actionCount: number
  playerLeft:  boolean
  teamColor:   string
  /** Awaiting-pull (the Pull / Bonus / Brick stack) gets extra bottom room;
   *  in-play keeps the tighter pad. */
  awaitingPull: boolean
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

  // Animate the ribbon to the active row. When there's no holder (activeIdx < 0,
  // e.g. just after a turnover before the pickup) freeze at the last valid row
  // and fade the whole ribbon out — so a possession change glides to the new
  // player instead of hard-cutting.
  const lastValidRef = useRef(activeIdx >= 0 ? activeIdx : 0)
  useEffect(() => { if (activeIdx >= 0) lastValidRef.current = activeIdx }, [activeIdx])
  const animIdx = useTween(activeIdx >= 0 ? activeIdx : lastValidRef.current, { ms: 240 })
  const visible = activeIdx >= 0

  const LANE_W  = 16   // matches the centre spacer (w-4)
  const COL_PAD = 12   // matches PlayerColumn/EventColumn p-3
  const GAP     = 16   // matches PlayerColumn/EventColumn gap-4
  // ★ TUNE ME ★ RADIUS — how much the sankey wrap's corners are ROUNDED where it
  // surrounds the player tile and the events region (bigger = more rounding that
  // eats into the corner). Shared by both sides; the tiles are rounded-xl = 12.
  const PLAYER_EVT_RADIUS = 12
  const PLAYER_EVT_PAD = 5   // px the encompass extends past the action tiles on all four sides
  const EVT_PAD = PLAYER_EVT_PAD   // px the encompass extends past the action tiles on all four sides
  // The events-side BOTTOM gets extra room below the last action tile — but
  // only for the pull stack (Pull / Bonus / Brick), where it was crowding the
  // Brick edge. In-play keeps the tighter all-sides pad.
  const EVT_PAD_BOTTOM = 0 + (awaitingPull ? EVT_PAD + 6 : EVT_PAD)
  // The outline hugs the active player tile directly (no halo). The active
  // tile renders its own border transparent, so this wrap IS its outline —
  // tracing its top / outer / bottom edges reads cleaner than a spacer around
  // it. The bridge-facing (inner) side isn't traced; the ribbon springs from
  // there toward the events.
  const PLAYER_PAD  = PLAYER_EVT_PAD
  // ★ TUNE ME ★ CURVE OFFSET — where the bridge curve STARTS, i.e. how far in from
  // each region's bridge-facing corner the flat edge ends and the curve springs.
  // Not a radius (the corner rounding is RADIUS above); just a position. Split per
  // side. Larger = longer neck / shorter flat edge; 0 = springs from the corner.
  const SANKEY_PLAYER_RADIUS = PLAYER_EVT_RADIUS
  const EVENT_CURVE_RADIUS  = PLAYER_EVT_RADIUS
  // ★ TUNE ME ★ Bezier handle length along the bridge (0–1). It sets how long
  // each control handle reaches toward the opposite anchor:
  //   1.0  → handles reach the far anchor: flat at the tiles, vertical centre.
  //   0.5  → handles at the midpoint: gentle S, centre angles along the anchors.
  //   ~0.25→ short handles: tighter curve right AT the anchors, straighter middle.
  //   0.0  → straight diagonal line (no curve).
  // Lower = more curve near the anchors.
  const BRIDGE_EASE = 1

  if (size.w === 0 || size.h === 0 || playerCount <= 0 || actionCount <= 0) {
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
  const tileTopRaw    = COL_PAD + animIdx * (tileH + GAP)
  const tileBottomRaw = tileTopRaw + tileH
  const activeTop     = tileTopRaw - PLAYER_PAD
  const activeBottom  = tileBottomRaw + PLAYER_PAD

  // Action-button-region vertical extent (in event column). Stops at the
  // bottom of the last action button; spacer + More live below this.
  // EVT_PAD pushes the outline OUTWARD on all four event-side edges so the
  // encompass visibly surrounds the action tiles without sitting on top of
  // their borders.
  const evtTop    = COL_PAD - EVT_PAD
  const evtBottom = COL_PAD + actionCount * (tileH + GAP) - GAP + EVT_PAD_BOTTOM

  // Active-tile horizontal extent — also pushed out by PLAYER_PAD on
  // both the outer side AND the bridge-facing side.
  const tileR = (playerLeft ? colWidth - COL_PAD : W - COL_PAD)             + PLAYER_PAD
  const tileL = (playerLeft ? COL_PAD            : colWidth + LANE_W + COL_PAD) - PLAYER_PAD

  // Event-region horizontal extent — also pushed out by EVT_PAD.
  const evtL  = playerLeft ? colWidth + LANE_W + COL_PAD - EVT_PAD : COL_PAD - EVT_PAD
  const evtR  = playerLeft ? W - COL_PAD + EVT_PAD          : colWidth - COL_PAD + EVT_PAD

  // Source/target points for the bridge curves — the edges that face each other
  // across the pass lane. Each side is pulled inward from its bridge-facing edge
  // by its own curve offset (player vs events), so the flat top/bottom segment
  // is shorter and the bezier springs earlier. 0 = spring from the very corner.
  const sourceX = playerLeft ? tileR - SANKEY_PLAYER_RADIUS : tileL + SANKEY_PLAYER_RADIUS
  const targetX = playerLeft ? evtL  + EVENT_CURVE_RADIUS  : evtR  - EVENT_CURVE_RADIUS
  // Asymmetric control-point X coords — biased toward the OTHER tile so
  // the bezier eases out of the tile it springs from. Replaces ctrlMid
  // (which sat exactly halfway, causing a sharp bend right at the joint).
  const ctrlPX  = sourceX + (targetX - sourceX) * BRIDGE_EASE
  const ctrlEX  = targetX - (targetX - sourceX) * BRIDGE_EASE

  // Helper: SVG rounded-corner arc. Use the same RADIUS as the player
  // tile rounded-lg so the active-tile portion of the outline matches
  // inactive tile corners.
  const arc = (x: number, y: number) => `A ${PLAYER_EVT_RADIUS} ${PLAYER_EVT_RADIUS} 0 0 1 ${x} ${y}`

  // Build the closed outline tracing clockwise around the combined
  // shape (active tile + bridge + events region). The four "outer"
  // corners get rounded; the bridge attaches to straight edges next to
  // each tile (the bridge-side of the tile has no corner — the bezier
  // curve takes over directly).
  const d = playerLeft
    ? [
        `M ${tileL + PLAYER_EVT_RADIUS} ${activeTop}`,
        `L ${sourceX} ${activeTop}`,
        `C ${ctrlPX} ${activeTop}, ${ctrlEX} ${evtTop}, ${targetX} ${evtTop}`,
        `L ${evtR - PLAYER_EVT_RADIUS} ${evtTop}`,
        arc(evtR, evtTop + PLAYER_EVT_RADIUS),
        `L ${evtR} ${evtBottom - PLAYER_EVT_RADIUS}`,
        arc(evtR - PLAYER_EVT_RADIUS, evtBottom),
        `L ${targetX} ${evtBottom}`,
        `C ${ctrlEX} ${evtBottom}, ${ctrlPX} ${activeBottom}, ${sourceX} ${activeBottom}`,
        `L ${tileL + PLAYER_EVT_RADIUS} ${activeBottom}`,
        `A ${PLAYER_EVT_RADIUS} ${PLAYER_EVT_RADIUS} 0 0 1 ${tileL} ${activeBottom - PLAYER_EVT_RADIUS}`,
        `L ${tileL} ${activeTop + PLAYER_EVT_RADIUS}`,
        `A ${PLAYER_EVT_RADIUS} ${PLAYER_EVT_RADIUS} 0 0 1 ${tileL + PLAYER_EVT_RADIUS} ${activeTop}`,
        'Z',
      ].join(' ')
    : [
        `M ${tileR - PLAYER_EVT_RADIUS} ${activeTop}`,
        `L ${sourceX} ${activeTop}`,
        `C ${ctrlPX} ${activeTop}, ${ctrlEX} ${evtTop}, ${targetX} ${evtTop}`,
        `L ${evtL + PLAYER_EVT_RADIUS} ${evtTop}`,
        `A ${PLAYER_EVT_RADIUS} ${PLAYER_EVT_RADIUS} 0 0 0 ${evtL} ${evtTop + PLAYER_EVT_RADIUS}`,
        `L ${evtL} ${evtBottom - PLAYER_EVT_RADIUS}`,
        `A ${PLAYER_EVT_RADIUS} ${PLAYER_EVT_RADIUS} 0 0 0 ${evtL + PLAYER_EVT_RADIUS} ${evtBottom}`,
        `L ${targetX} ${evtBottom}`,
        `C ${ctrlEX} ${evtBottom}, ${ctrlPX} ${activeBottom}, ${sourceX} ${activeBottom}`,
        `L ${tileR - PLAYER_EVT_RADIUS} ${activeBottom}`,
        `A ${PLAYER_EVT_RADIUS} ${PLAYER_EVT_RADIUS} 0 0 0 ${tileR} ${activeBottom - PLAYER_EVT_RADIUS}`,
        `L ${tileR} ${activeTop + PLAYER_EVT_RADIUS}`,
        `A ${PLAYER_EVT_RADIUS} ${PLAYER_EVT_RADIUS} 0 0 0 ${tileR - PLAYER_EVT_RADIUS} ${activeTop}`,
        'Z',
      ].join(' ')

  return (
    <div
      ref={ref}
      className="absolute inset-0 pointer-events-none"
      aria-hidden
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 200ms ease-out' }}
    >
      <svg width={W} height={H} style={{ display: 'block' }}>
        <path
          d={d}
          fill={`${teamColor}80`}
          stroke="none"
        />
      </svg>
    </div>
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
