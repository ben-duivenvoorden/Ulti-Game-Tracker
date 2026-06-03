import { useRef, type CSSProperties } from 'react'
import { UNKNOWN_PLAYER_ID, type Player, type PlayerId } from '@/core/types'
import { inkOn } from '@/core/contrast'

// Shared "dull" tile look for the non-player affordances in the column — the
// `+` add slot and the Unknown-Player tile — matching the event column's
// "Unknown turnover" button: grey surface, dull dotted outline, recessive so
// they don't compete with the solid player pills.
const DULL_TILE_CLASS =
  'flex-1 min-h-0 rounded-xl border-2 cursor-pointer transition-colors select-none flex flex-col items-center justify-center px-2 text-center'
const DULL_TILE_STYLE: CSSProperties = {
  background:    'var(--color-surf-2)',
  color:         'var(--color-dull)',
  borderColor:   'var(--color-dull)',
  borderStyle:   'dotted',
  fontWeight:    700,
  letterSpacing: 0.2,
  lineHeight:    1.15,
}
// Active state for the Unknown-Player tile — it can hold the disc / be the
// puller just like a real player, so it lights up when selected. Mirrors the
// roster-pill active look: transparent fill + white ink, letting the Sankey
// wash (now anchored to its row) show through and read as one group.
const UNKNOWN_ACTIVE_STYLE: CSSProperties = {
  background:    'transparent',
  color:         '#fff',
  borderColor:   'transparent',
  borderStyle:   'solid',
  fontWeight:    700,
  letterSpacing: 0.2,
  lineHeight:    1.15,
}

interface PlayerColumnProps {
  players: Player[]
  teamColor: string
  /** Currently has the disc — strong highlight. */
  holderId: PlayerId | null
  /** Selected as the puller (awaiting-pull only) — strong highlight. */
  pullerId: PlayerId | null
  /** Dimmed and untappable (e.g. thrower during Receiver Error Pick). */
  ineligibleIds: PlayerId[]
  onTap: (player: Player) => void
  /** Long-press a player to enter Move mode with that player selected. */
  onLongPress?: (player: Player) => void
  /** When non-null, Move mode is active and this player is the one
   *  selected to be moved. All other tiles render with a dashed outline
   *  to mark them as swap targets. */
  moveSelectedId?: PlayerId | null
  /** Running-start: total slots the line should hold. When the active line
   *  is shorter than this, empty `+` slots render after the players. */
  lineSize?: number
  /** Tap an empty `+` slot to open the backfill picker. */
  onAddSlot?: () => void
  /** Remove a player from the line (shown as a ✕ badge while in Move mode). */
  onRemove?: (player: Player) => void
  /** Tap the always-present "Unknown Player" tile. Behaves like tapping a real
   *  player tile, but with the Unknown-Player sentinel — selects the puller
   *  (awaiting-pull), records a possession (in-play), or resolves a pick
   *  (block / intercept), for when the recorder missed who it was. */
  onUnknownPlayer?: () => void
}

const LONG_PRESS_MS = 450

// Vertical stack of player buttons — one row per active-line player.
// Tap to record a possession; long-press a player to enter Move mode,
// then tap another player to swap their positions.
export function PlayerColumn(props: PlayerColumnProps) {
  const { players, teamColor, holderId, pullerId, ineligibleIds, onTap, onLongPress, moveSelectedId,
          lineSize, onAddSlot, onRemove, onUnknownPlayer } = props
  const timerRef    = useRef<number | null>(null)
  const triggeredRef = useRef(false)
  const downIdRef   = useRef<PlayerId | null>(null)
  const inMoveMode = moveSelectedId !== null && moveSelectedId !== undefined
  const emptySlots = Math.max(0, (lineSize ?? 0) - players.length)
  // The Unknown-Player tile holds the disc / is the puller exactly like a
  // roster player — light it up when it's the active selection.
  const unknownActive = holderId === UNKNOWN_PLAYER_ID || pullerId === UNKNOWN_PLAYER_ID

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  return (
    <div className="flex flex-col gap-4 p-3 h-full overflow-y-auto">
      {players.map(p => {
        const isHolder = p.id === holderId
        const isPuller = p.id === pullerId
        const isActive = isHolder || isPuller
        const ineligible = ineligibleIds.includes(p.id)
        const isMoveSelected = moveSelectedId === p.id
        const isMoveTarget   = inMoveMode && !isMoveSelected
        const [first, rest] = splitName(p.name)
        return (
          <button
            key={p.id}
            disabled={ineligible}
            onPointerDown={() => {
              triggeredRef.current = false
              downIdRef.current = p.id
              if (onLongPress) {
                timerRef.current = window.setTimeout(() => {
                  triggeredRef.current = true
                  onLongPress(p)
                }, LONG_PRESS_MS)
              }
            }}
            onPointerUp={() => {
              clearTimer()
              if (!triggeredRef.current && downIdRef.current === p.id) {
                onTap(p)
              }
              downIdRef.current = null
            }}
            onPointerLeave={() => {
              clearTimer()
              downIdRef.current = null
            }}
            onPointerCancel={() => {
              clearTimer()
              downIdRef.current = null
            }}
            className="relative flex-1 min-h-0 rounded-xl border cursor-pointer transition-all select-none flex flex-col items-center justify-center px-2"
            style={{
              background:    ineligible       ? 'var(--color-surf-2)'
                            : isMoveSelected ? `${teamColor}66`
                            : isActive       ? 'transparent'
                            : teamColor,
              // When active, the pill is transparent and the dark sankey
              // wash sits behind — so contrast against the team colour
              // (which inkOn assumes) gives unreadable dark text for
              // light team kits. Force light ink in that case.
              color:         ineligible ? 'var(--color-dim)'
                            : isActive  ? '#fff'
                            : inkOn(teamColor),
              borderColor:   ineligible       ? 'var(--color-border)'
                            : isMoveSelected ? teamColor
                            : isMoveTarget   ? teamColor
                            : isActive       ? 'transparent'
                            : teamColor,
              borderStyle:   isMoveTarget ? 'dashed' : 'solid',
              borderWidth:   isMoveSelected ? 3 : 2,
              opacity:       ineligible ? 0.45 : 1,
              fontWeight:    700,
              letterSpacing: 0.2,
              lineHeight:    1.1,
              boxShadow:     !ineligible && !isActive && !inMoveMode
                            ? `0 0 14px ${teamColor}33`
                            : 'none',
            }}
          >
            <span
              className="block w-full text-center truncate"
              style={{ fontSize: 'clamp(14px, 4.5vw, 20px)' }}
            >
              {first}
            </span>
            {rest && (
              <span
                className="block w-full text-center truncate"
                style={{ fontSize: 'clamp(14px, 4.5vw, 20px)' }}
              >
                {rest}
              </span>
            )}
            {/* Remove-from-line badge — only while in Move mode, so it can't
                be hit by accident during normal scoring. */}
            {inMoveMode && onRemove && (
              <span
                role="button"
                aria-label={`Remove ${p.name} from line`}
                title="Remove from line"
                onPointerDown={e => { e.stopPropagation() }}
                onPointerUp={e => { e.stopPropagation() }}
                onClick={e => { e.stopPropagation(); onRemove(p) }}
                className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold cursor-pointer"
                style={{ background: 'var(--color-danger)', color: '#fff', boxShadow: '0 0 0 2px var(--color-bg)' }}
              >
                ✕
              </span>
            )}
          </button>
        )
      })}
      {/* Unknown-player tile — always present, sitting directly beneath the
          roster like another line member. It taps through the same handler as a
          real player (puller / possession / pick), and lights up when it's the
          active selection. Grey + dull + dotted at rest (matching the event
          column's "Unknown turnover" button) so it reads as a fallback. */}
      <button
        type="button"
        onClick={() => onUnknownPlayer?.()}
        className={DULL_TILE_CLASS}
        style={unknownActive ? UNKNOWN_ACTIVE_STYLE : DULL_TILE_STYLE}
        title="Attribute this action to an unidentified player"
      >
        <span className="block w-full text-center truncate" style={{ fontSize: 'clamp(14px, 4.5vw, 20px)' }}>
          Unknown
        </span>
        <span className="block w-full text-center truncate" style={{ fontSize: 'clamp(14px, 4.5vw, 20px)' }}>
          Player
        </span>
      </button>
      {/* Running-start: a single `+` slot to backfill the next player —
          tap to open the picker. Capped at one regardless of how many line
          slots are still empty. Sits below the Unknown-Player tile. */}
      {emptySlots > 0 && (
        <button
          key="slot"
          type="button"
          onClick={() => onAddSlot?.()}
          className={DULL_TILE_CLASS}
          style={DULL_TILE_STYLE}
          title="Add a player to the line"
        >
          <span style={{ fontSize: 'clamp(20px, 6vw, 30px)', lineHeight: 1 }}>+</span>
        </button>
      )}
      {/* Invisible filler rows for the still-empty line slots — placed last so
          the empty slack falls BELOW the Unknown-Player tile. Keeps the column
          at `lineSize + 1` flex children so every tile stays the same height as
          a full line (no stretching) and the Sankey / event-column geometry
          stays aligned. Mirrors EventColumn's fillers. */}
      {Array.from({ length: Math.max(0, emptySlots - 1) }).map((_, i) => (
        <div key={`slot-fill-${i}`} className="flex-1 min-h-0" aria-hidden />
      ))}
    </div>
  )
}

// Split "First Last" / "First Middle Last" into (first, rest). Single-token
// names display on a single line.
function splitName(name: string): [string, string | null] {
  const trimmed = name.trim()
  const firstSpace = trimmed.indexOf(' ')
  if (firstSpace < 0) return [trimmed, null]
  return [trimmed.slice(0, firstSpace), trimmed.slice(firstSpace + 1).trim()]
}
