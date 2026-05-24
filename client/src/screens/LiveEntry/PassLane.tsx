import type { VisLogEntry, Player, TeamId } from '@/core/types'

interface PassLaneProps {
  visLog: VisLogEntry[]
  players: Player[]
  activeTeam: TeamId
  teamColor: string
}

// Thin vertical pane between PlayerColumn and EventColumn. The last two
// passes are drawn as curves that BOTH start and end on a single vertical
// "left plane" — the line nearest the PlayerColumn — and bow out to the
// right of the lane. The newer pass bows further (more prominent); the
// older pass is a tighter curve closer to the plane.
//
// Why the shared-left-plane layout: every arrow's endpoint sits next to
// its player's row in the PlayerColumn. That makes "where did the disc
// come from / go to" unambiguous — the reader's eye runs along the left
// plane to find the row, then follows the curve to read sender vs
// receiver. No two arrows ever overlap because their bow depths differ.

const MAX_ARROWS = 2
const LANE_WIDTH = 56          // px — wider than before so curves have room to bow
const LEFT_ANCHOR_X = 3        // px in from the lane's left edge; arrows pin here
const VIEW_H = 100             // viewBox vertical units (paths use this same scale)

// Bow depths (in viewBox X units) per arrow, oldest first. The newer
// arrow gets the larger bow so it reads as the dominant curve.
const BOW_DEPTHS = [LANE_WIDTH * 0.45, LANE_WIDTH * 0.78] as const

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
      {/* Vertical "left plane" — the spine that arrows pin to. Faint so
          empty-lane states still read as a deliberate area. */}
      <line
        x1={LEFT_ANCHOR_X} x2={LEFT_ANCHOR_X}
        y1={4} y2={VIEW_H - 4}
        stroke="var(--color-border)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />

      {arrows.map((a, i) => {
        const newest = i === arrows.length - 1
        const opacity = newest ? 1 : 0.55
        const stroke  = newest ? 2 : 1.4
        const bow     = BOW_DEPTHS[i] ?? BOW_DEPTHS[BOW_DEPTHS.length - 1]

        const fromY = rowCenter(a.fromIdx, N)
        const toY   = rowCenter(a.toIdx,   N)
        const midY  = (fromY + toY) / 2

        // Control point bowed to the right. Same x for both endpoints
        // anchors them on the left plane; the bezier passes through a
        // point further right at midY.
        const cx = LEFT_ANCHOR_X + bow

        // Arrowhead at the receiver end, pointing back toward the
        // control point (i.e. along the curve's exit tangent).
        const ah = 5  // arrowhead length (in viewBox X units)
        const aw = 2.5
        // Approximate end-tangent direction: from cx,midY toward
        // LEFT_ANCHOR_X,toY. The arrowhead sits along that direction
        // so the tip is at (LEFT_ANCHOR_X, toY).
        const tdx = LEFT_ANCHOR_X - cx
        const tdy = toY - midY
        const tlen = Math.hypot(tdx, tdy) || 1
        const tx = tdx / tlen
        const ty = tdy / tlen
        // Tip:
        const tipX = LEFT_ANCHOR_X
        const tipY = toY
        // Base centre (back along the tangent from the tip):
        const baseX = tipX - tx * ah
        const baseY = tipY - ty * ah
        // Perpendicular (-ty, tx) for the base wings:
        const lX = baseX + (-ty) * aw
        const lY = baseY +   tx  * aw
        const rX = baseX -  (-ty) * aw
        const rY = baseY -    tx  * aw

        // Truncate the path so the curve ends at the arrowhead's base
        // rather than the player's row centre — keeps the line from
        // peeking out of the arrowhead.
        const pathEndX = baseX
        const pathEndY = baseY

        return (
          <g key={i} opacity={opacity}>
            <path
              d={`M ${LEFT_ANCHOR_X} ${fromY} Q ${cx} ${midY} ${pathEndX} ${pathEndY}`}
              stroke={teamColor}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <polygon
              points={`${tipX},${tipY} ${lX},${lY} ${rX},${rY}`}
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
