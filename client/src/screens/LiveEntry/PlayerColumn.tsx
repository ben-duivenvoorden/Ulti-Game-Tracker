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
}

// Vertical stack of player buttons — one row per active-line player. Tap
// to record a possession (or to enter the equivalent pick-mode action
// during a pick state). Names render on two centred lines: first name on
// top, surname (or remaining tokens) on the bottom. Visual states:
// holder / puller / ineligible / default — communicated via borders +
// tinted backgrounds.
export function PlayerColumn(props: PlayerColumnProps) {
  const { players, teamColor, holderId, pullerId, ineligibleIds, onTap } = props
  return (
    <div className="flex flex-col gap-1.5 p-1.5 h-full overflow-y-auto">
      {players.map(p => {
        const isHolder = p.id === holderId
        const isPuller = p.id === pullerId
        const isActive = isHolder || isPuller
        const ineligible = ineligibleIds.includes(p.id)
        const [first, rest] = splitName(p.name)
        return (
          <button
            key={p.id}
            disabled={ineligible}
            onClick={() => onTap(p)}
            className="flex-1 min-h-0 rounded-lg border cursor-pointer transition-all select-none flex flex-col items-center justify-center px-2"
            style={{
              background:    ineligible ? 'var(--color-surf-2)'
                            : isActive  ? teamColor
                            : `${teamColor}14`,
              color:         ineligible ? 'var(--color-dim)'
                            : isActive  ? inkOn(teamColor)
                            : 'var(--color-content)',
              borderColor:   ineligible ? 'var(--color-border)'
                            : isActive  ? teamColor
                            : `${teamColor}55`,
              borderWidth:   isActive ? 2 : 1.5,
              opacity:       ineligible ? 0.45 : 1,
              fontWeight:    isActive ? 700 : 600,
              letterSpacing: 0.2,
              lineHeight:    1.1,
              boxShadow:     isActive ? `0 0 14px ${teamColor}66` : 'none',
            }}
          >
            <span className="block w-full text-center truncate" style={{ fontSize: 19 }}>{first}</span>
            {rest && (
              <span className="block w-full text-center truncate" style={{ fontSize: 17, opacity: 0.85 }}>
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
