import type { VisLogEntry, Player, TeamId } from '@/core/types'

interface PassLaneProps {
  visLog: VisLogEntry[]
  players: Player[]
  activeTeam: TeamId
  teamColor: string
}

// Thin vertical pane between PlayerColumn and EventColumn. The last three
// passes render as rounded right-angle brackets: each one leaves the
// sender's row horizontally to the right, travels vertically alongside
// a shared "left plane", then re-enters the receiver's row from the
// right horizontally.
//
// Geometry: cubic bezier with BOTH control points at the same x (the
// curve's "reach"). That forces horizontal tangents at the start and
// end — the curve flares out, runs parallel to the left plane, and
// flares back in. Reads as a flowchart bracket rather than a skewed
// loop.
//
// Three arrows are distinguished by reach depth alone (oldest tightest,
// newest furthest right). They never overlap because their reaches
// differ. Newest also draws thicker + at full opacity.

const MAX_ARROWS    = 3
const LANE_WIDTH    = 72
const LEFT_ANCHOR_X = 4    // px in from the lane's left edge
const VIEW_H        = 100  // viewBox vertical units

// Reach (in viewBox X units) per arrow, oldest → newest. Tuned so the
// three brackets sit visibly inside each other without crowding.
const REACHES = [LANE_WIDTH * 0.32, LANE_WIDTH * 0.58, LANE_WIDTH * 0.85] as const

export function PassLane({ visLog, players, activeTeam, teamColor }: PassLaneProps) {
  const arrows = derivePassArrows(visLog, activeTeam, players, MAX_ARROWS)
  const N = players.length

  return (
    <svg
      className="h-full"
      style={{ width: LANE_WIDTH, display: 'block' }}
      viewBox={`0 0 ${LANE_WIDTH} ${VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {/* Vertical "left plane" — arrows anchor here. Faint so the empty-
          lane state still reads as a deliberate column. */}
      <line
        x1={LEFT_ANCHOR_X} x2={LEFT_ANCHOR_X}
        y1={4} y2={VIEW_H - 4}
        stroke="var(--color-border)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />

      {arrows.map((a, i) => {
        const newest  = i === arrows.length - 1
        const opacity = newest ? 1 : 0.5
        const stroke  = newest ? 2 : 1.4
        const reach   = REACHES[i] ?? REACHES[REACHES.length - 1]

        const fromY = rowCenter(a.fromIdx, N)
        const toY   = rowCenter(a.toIdx,   N)

        // Cubic with both control points at x = LEFT_ANCHOR_X + reach:
        //   start at (left, fromY) → goes horizontally right
        //   c1 = (left + reach, fromY) → vertical motion begins
        //   c2 = (left + reach, toY)   → vertical motion ends
        //   end at (left, toY) → returns horizontally
        const cx = LEFT_ANCHOR_X + reach

        // Arrowhead points left (back toward the player column) at
        // (LEFT_ANCHOR_X, toY). Truncate the path at the arrowhead's
        // base so the stroke doesn't peek out.
        const ah = 5         // arrowhead length (viewBox X units)
        const aw = 2.6       // arrowhead half-width (viewBox Y units)
        const tipX  = LEFT_ANCHOR_X
        const tipY  = toY
        const baseX = LEFT_ANCHOR_X + ah
        const baseY = toY
        const wingX = baseX
        const wingY1 = baseY - aw
        const wingY2 = baseY + aw

        return (
          <g key={i} opacity={opacity}>
            <path
              d={`M ${LEFT_ANCHOR_X} ${fromY} C ${cx} ${fromY}, ${cx} ${toY}, ${baseX} ${baseY}`}
              stroke={teamColor}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <polygon
              points={`${tipX},${tipY} ${wingX},${wingY1} ${wingX},${wingY2}`}
              fill={teamColor}
            />
          </g>
        )
      })}
    </svg>
  )
}

interface PassArrow { fromIdx: number; toIdx: number }

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

// Y-centre of row `idx` within the viewBox, accounting for the
// PlayerColumn's vertical padding (p-1.5 → ~6 px ≈ 4 viewBox units).
function rowCenter(idx: number, n: number): number {
  if (n <= 0) return VIEW_H / 2
  const top = 4
  const bot = 4
  const usable = VIEW_H - top - bot
  return top + ((idx + 0.5) / n) * usable
}
