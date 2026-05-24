import type { VisLogEntry, Player, TeamId } from '@/core/types'

interface PassLaneProps {
  visLog: VisLogEntry[]
  players: Player[]
  activeTeam: TeamId
  teamColor: string
  /** Cap how many recent passes are shown — older ones get earlier lanes. */
  maxArrows?: number
}

// Thin vertical pane between PlayerColumn and EventColumn. Each recent
// pass gets its OWN horizontal track so the start and end of each arrow
// are unambiguous — never overlapping. Arrows curve slightly so the
// reader's eye can follow them as discrete strokes rather than a stacked
// pile of lines.
//
// Layout: the lane has N tracks side-by-side (one per arrow). Tracks
// are ordered oldest-leftmost → newest-rightmost so the most recent
// pass sits closest to the EventColumn. Each track contains:
//   - a curved SVG path from sender's row-centre to receiver's row-centre
//   - a small arrowhead at the receiver end
//
// SVG here is unavoidable for the curve — but the curves are small and
// deterministic so this isn't the canvas-style physics rendering we
// retired.
const TRACK_WIDTH = 18  // px per arrow track
const PAD_TOP     = 6   // px — matches PlayerColumn's p-1.5
const PAD_BOT     = 6

export function PassLane({ visLog, players, activeTeam, teamColor, maxArrows = 3 }: PassLaneProps) {
  const arrows = derivePassArrows(visLog, activeTeam, players, maxArrows)
  const N = players.length

  if (arrows.length === 0) {
    return (
      <div
        className="relative h-full"
        style={{ width: TRACK_WIDTH }}
        aria-hidden
      >
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{ top: PAD_TOP, bottom: PAD_BOT, width: 1, background: 'var(--color-border)' }}
        />
      </div>
    )
  }

  const laneWidth = TRACK_WIDTH * arrows.length

  return (
    <svg
      className="h-full"
      style={{ width: laneWidth, display: 'block' }}
      viewBox={`0 0 ${laneWidth} 100`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {arrows.map((a, i) => {
        const isMostRecent = i === arrows.length - 1
        const opacity      = isMostRecent ? 1 : 0.55 - (arrows.length - 1 - i) * 0.18
        const trackX       = (i + 0.5) * TRACK_WIDTH
        const fromY        = rowCenter(a.fromIdx, N)
        const toY          = rowCenter(a.toIdx,   N)

        // Curve: bow the path outward by ~45% of the track width so
        // adjacent tracks don't visually merge. Direction of bow
        // alternates per track to spread them visually.
        const bow = (i % 2 === 0 ? 1 : -1) * TRACK_WIDTH * 0.45
        const cx = trackX + bow

        // Arrowhead at the receiver — small triangle aligned to the
        // tangent. For a quadratic curve P0→C→P1 the end tangent is
        // (P1 - C); approximated for the head orientation.
        const ah = 4 // arrowhead half-length in y (small)
        const aw = 3 // arrowhead half-width
        const downward = toY > fromY
        const headTipY  = toY
        const headBaseY = toY + (downward ? -ah * 2 : ah * 2)

        return (
          <g key={i} opacity={opacity}>
            <path
              d={`M ${trackX} ${fromY} Q ${cx} ${(fromY + toY) / 2} ${trackX} ${headBaseY}`}
              stroke={teamColor}
              strokeWidth={isMostRecent ? 1.8 : 1.3}
              fill="none"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <polygon
              points={`${trackX},${headTipY} ${trackX - aw},${headBaseY} ${trackX + aw},${headBaseY}`}
              fill={teamColor}
            />
          </g>
        )
      })}
    </svg>
  )
}

interface PassArrow { fromIdx: number; toIdx: number }

// Walk visLog backwards collecting consecutive possession events for
// the active team. Returns arrows oldest-first (so caller can render
// oldest on the left, newest on the right).
function derivePassArrows(
  visLog: VisLogEntry[],
  teamId: TeamId,
  players: Player[],
  maxArrows: number,
): PassArrow[] {
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

  const arrows: PassArrow[] = []
  for (let i = 1; i < chain.length; i++) {
    const fromIdx = players.findIndex(p => p.id === chain[i - 1].playerId)
    const toIdx   = players.findIndex(p => p.id === chain[i].playerId)
    if (fromIdx >= 0 && toIdx >= 0) arrows.push({ fromIdx, toIdx })
  }
  return arrows.slice(-maxArrows)
}

// Y-centre of row idx, in the SVG's 0-100 viewBox space, accounting
// for the PlayerColumn's top/bottom padding. The lane visually mirrors
// the PlayerColumn's row layout one-to-one.
function rowCenter(idx: number, n: number): number {
  if (n <= 0) return 50
  // PlayerColumn uses p-1.5 (6px). At viewBox height 100 the padding
  // proportionally is small but we still bias the rows slightly inset.
  const top = 4
  const bot = 4
  const usable = 100 - top - bot
  return top + ((idx + 0.5) / n) * usable
}
