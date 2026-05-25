import { useRef } from 'react'
import type { Player, PlayerId } from '@/core/types'
import { inkOn } from '@/core/contrast'

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
}

const LONG_PRESS_MS = 450

// Vertical stack of player buttons — one row per active-line player.
// Tap to record a possession; long-press a player to enter Move mode,
// then tap another player to swap their positions.
export function PlayerColumn(props: PlayerColumnProps) {
  const { players, teamColor, holderId, pullerId, ineligibleIds, onTap, onLongPress, moveSelectedId } = props
  const timerRef    = useRef<number | null>(null)
  const triggeredRef = useRef(false)
  const downIdRef   = useRef<PlayerId | null>(null)
  const inMoveMode = moveSelectedId !== null && moveSelectedId !== undefined

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
            className="flex-1 min-h-0 rounded-xl border cursor-pointer transition-all select-none flex flex-col items-center justify-center px-2"
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
          </button>
        )
      })}
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
