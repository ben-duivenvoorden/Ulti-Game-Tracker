import { useLayoutEffect, useRef, useState } from 'react'
import type { VisLogEntry, Player, TeamId } from '@/core/types'

interface PassLaneProps {
  visLog: VisLogEntry[]
  players: Player[]
  activeTeam: TeamId
  teamColor: string
}

// Thin vertical pane between PlayerColumn and EventColumn. The last
// three passes render as right-angle paths with small rounded corners:
//   sender's row ─┐
//                 │   (vertical run, parallel to the left plane)
//                 │
//   receiver's row ←─┘
//
// The SVG sizes itself to its container in real pixels (via ResizeObserver
// — no viewBox stretching) so the arrowhead stays a proper triangle and
// the corner arcs are real circular quarter-arcs, not ellipses.
//
// Three arrows differentiated by REACH (how far right the bracket extends)
// — oldest tightest, newest furthest. Newer arrows also draw thicker and
// at full opacity; older fade.

const MAX_ARROWS    = 3
const LANE_WIDTH    = 32   // px
const LEFT_ANCHOR_X = 3    // px in from the lane's left edge
const CORNER_R      = 4    // px — corner-rounding radius
const ARROW_AH      = 7    // px — arrowhead length (toward the tip)
const ARROW_AW      = 4    // px — arrowhead half-width

// Reach (in px) per arrow, oldest → newest. Sits inside LANE_WIDTH after
// allowing for the corner radius + arrowhead.
const REACHES = [9, 16, 23] as const

// Per-arrow visual emphasis. Indexed oldest → newest so the newest arrow
// (last index) is solid + full opacity + thicker; older arrows progress
// to dashed + faded + thinner. Three independent cues stack so each
// arrow is unambiguous even at a glance.
const DASH_PATTERNS = ['2 4', '5 3', undefined] as const
const OPACITIES     = [0.42, 0.7, 1] as const
const STROKE_WIDTHS = [1.3, 1.6, 2] as const

export function PassLane({ visLog, players, activeTeam, teamColor }: PassLaneProps) {
  const arrows = derivePassArrows(visLog, activeTeam, players, MAX_ARROWS)
  const N = players.length

  // Measure the container in real pixels so SVG coords stay 1-to-1 and
  // the arrowhead / corner arcs don't distort under aspect-ratio stretching.
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  useLayoutEffect(() => {
    if (!ref.current) return
    const update = () => setHeight(ref.current?.clientHeight ?? 0)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} className="relative h-full" style={{ width: LANE_WIDTH }} aria-hidden>
      {/* Vertical "left plane" — the line every arrow pins to. Faint so
          the empty-lane state still reads as a deliberate column. */}
      <div
        className="absolute"
        style={{
          left: LEFT_ANCHOR_X - 0.5,
          top:  4,
          bottom: 4,
          width: 1,
          background: 'var(--color-border)',
        }}
      />

      {height > 0 && (
        <svg
          width={LANE_WIDTH}
          height={height}
          style={{ position: 'absolute', inset: 0, display: 'block' }}
        >
          {arrows.map((a, i) => {
            // Map this arrow's position (0..arrows.length-1, oldest →
            // newest) onto the emphasis arrays (oldest → newest of the
            // full three-slot scale). When there are fewer than three
            // arrows, we align to the right so the latest arrow always
            // gets the newest treatment.
            const emphasisIdx = MAX_ARROWS - arrows.length + i
            const opacity = OPACITIES[emphasisIdx]
            const stroke  = STROKE_WIDTHS[emphasisIdx]
            const dash    = DASH_PATTERNS[emphasisIdx]
            const reach   = REACHES[i] ?? REACHES[REACHES.length - 1]

            const fromY = rowCenter(a.fromIdx, N, height)
            const toY   = rowCenter(a.toIdx,   N, height)
            const downward = toY > fromY
            const sweep    = downward ? 1 : 0

            const cornerX     = LEFT_ANCHOR_X + reach
            const horizEndX   = cornerX - CORNER_R
            const vertStartY  = fromY + (downward ? CORNER_R : -CORNER_R)
            const vertEndY    = toY   + (downward ? -CORNER_R : CORNER_R)
            const pathEndX    = LEFT_ANCHOR_X + ARROW_AH  // stop at arrowhead base

            // Three segments + two arcs: horizontal right, ⌐ arc down,
            // vertical, ⌐ arc left, horizontal back.
            const d = [
              `M ${LEFT_ANCHOR_X} ${fromY}`,
              `L ${horizEndX} ${fromY}`,
              `A ${CORNER_R} ${CORNER_R} 0 0 ${sweep} ${cornerX} ${vertStartY}`,
              `L ${cornerX} ${vertEndY}`,
              `A ${CORNER_R} ${CORNER_R} 0 0 ${sweep} ${horizEndX} ${toY}`,
              `L ${pathEndX} ${toY}`,
            ].join(' ')

            // Arrowhead at receiver's row, tip on the left plane,
            // pointing horizontally left.
            const tipX  = LEFT_ANCHOR_X
            const baseX = LEFT_ANCHOR_X + ARROW_AH
            const wingY1 = toY - ARROW_AW
            const wingY2 = toY + ARROW_AW

            return (
              <g key={i} opacity={opacity}>
                <path
                  d={d}
                  stroke={teamColor}
                  strokeWidth={stroke}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={dash}
                />
                <polygon
                  points={`${tipX},${toY} ${baseX},${wingY1} ${baseX},${wingY2}`}
                  fill={teamColor}
                />
              </g>
            )
          })}
        </svg>
      )}
    </div>
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

// Y-centre of row `idx` in the measured pixel space. Mirrors the
// PlayerColumn's flex-1 rows + p-1.5 (≈6 px top/bottom padding).
function rowCenter(idx: number, n: number, heightPx: number): number {
  if (n <= 0 || heightPx <= 0) return heightPx / 2
  const top = 6
  const bot = 6
  const usable = Math.max(0, heightPx - top - bot)
  return top + ((idx + 0.5) / n) * usable
}
