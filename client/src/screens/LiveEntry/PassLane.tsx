import { useLayoutEffect, useRef, useState } from 'react'
import type { VisLogEntry, Player, TeamId } from '@/core/types'

interface PassLaneProps {
  visLog: VisLogEntry[]
  players: Player[]
  activeTeam: TeamId
  /** How many recent passes to render. Clamped to [0, MAX_ARROWS_HARD]. */
  maxArrows: number
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

// Hard cap — three styled tracks (oldest / middle / newest) exist in
// the emphasis arrays below, so anything higher just degrades to the
// newest treatment. The configurable user setting clamps to this.
export const MAX_PASS_ARROWS_HARD = 3
const LANE_WIDTH         = 48   // px
const LEFT_ANCHOR_X      = 3    // px in from the lane's left edge — where arrowhead tips land
const LINE_START_INSET   = 2    // px past LEFT_ANCHOR_X where the SENDING line starts (small visual inset; head/tail separation comes from the Y-offset below)
const CORNER_R_MAX       = 12   // px — generous rounding; per-arrow R is clamped down when reach is tight
const ARROW_AH           = 14   // px — arrowhead length (toward the tip)
const ARROW_AW           = 8    // px — arrowhead half-width

// Vertical split of each player row, indexed oldest → newest (matches
// the other emphasis arrays). Senders attach at row-centre + offset,
// receivers at row-centre − offset, so even within the same row a
// receiver tip and an outgoing tail never share a Y position.
//
// The offset also varies *per arrow age* — newer arrows are closer to
// the row centre (anchored tight to the player's name), older arrows
// fan further out. Combined with the per-arrow REACH this means
// chains that revisit a player (A → B → A → B) get visually distinct
// endpoints even when the same role attaches to the same row across
// multiple arrows.
const ENDPOINT_OFFSETS   = [16, 12, 8] as const  // oldest → newest, px

// Colour for the pass arrows. White (rather than team colour) so the
// arrows always read against any team's brand colour underneath and
// don't compete with the team-coloured Pull / Brick buttons or the
// solid team-colour player highlight.
const ARROW_COLOUR       = '#ffffff'

// All four emphasis arrays are indexed oldest → newest (last slot =
// newest). Right-aligned lookup below means a fresh run with fewer
// arrows still treats the latest arrow as the newest.
//
// Reach decreases newest → oldest so the solid, prominent recent
// arrow sits CLOSEST to the player names; the faintest, most-dashed
// older arrows fan out further to the right.
const REACHES       = [40, 30, 22]     as const
const DASH_PATTERNS = ['3 5', '6 4', undefined] as const
const OPACITIES     = [0.42, 0.7, 1]   as const
const STROKE_WIDTHS = [1.6, 2, 2.4]    as const

export function PassLane({ visLog, players, activeTeam, maxArrows }: PassLaneProps) {
  const clampedMax = Math.max(0, Math.min(MAX_PASS_ARROWS_HARD, maxArrows))
  const arrows = derivePassArrows(visLog, activeTeam, players, clampedMax)
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
            const emphasisIdx = MAX_PASS_ARROWS_HARD - arrows.length + i
            const opacity = OPACITIES[emphasisIdx]
            const stroke  = STROKE_WIDTHS[emphasisIdx]
            const dash    = DASH_PATTERNS[emphasisIdx]
            const reach   = REACHES[emphasisIdx]

            // Senders sit in the row's lower half, receivers in the
            // upper half. Offset varies by recency too so chains that
            // revisit a player (A → B → A → B) get visibly different
            // tap points for each arrow's start/end on the same row.
            const yOffset = ENDPOINT_OFFSETS[emphasisIdx]
            const fromY = rowCenter(a.fromIdx, N, height) + yOffset
            const toY   = rowCenter(a.toIdx,   N, height) - yOffset
            const downward = toY > fromY
            const sweep    = downward ? 1 : 0

            const lineStartX  = LEFT_ANCHOR_X + LINE_START_INSET
            const lineEndX    = LEFT_ANCHOR_X + ARROW_AH            // line ends at arrowhead base
            const cornerX     = LEFT_ANCHOR_X + reach

            // Adaptive corner radius: aim for CORNER_R_MAX, but clamp
            // so neither the sending nor receiving horizontal segment
            // is consumed by the corner arc. Vertical rows that are
            // close together also restrict R (half the vertical span).
            const vertSpan = Math.abs(toY - fromY)
            const cornerR = Math.max(
              2,
              Math.min(
                CORNER_R_MAX,
                cornerX - lineStartX,
                cornerX - lineEndX,
                vertSpan / 2,
              ),
            )

            const horizEndX  = cornerX - cornerR
            const vertStartY = fromY + (downward ? cornerR : -cornerR)
            const vertEndY   = toY   + (downward ? -cornerR : cornerR)

            // Three segments + two arcs: horizontal right, rounded
            // corner, vertical, rounded corner, horizontal back to the
            // arrowhead's base.
            const d = [
              `M ${lineStartX} ${fromY}`,
              `L ${horizEndX} ${fromY}`,
              `A ${cornerR} ${cornerR} 0 0 ${sweep} ${cornerX} ${vertStartY}`,
              `L ${cornerX} ${vertEndY}`,
              `A ${cornerR} ${cornerR} 0 0 ${sweep} ${horizEndX} ${toY}`,
              `L ${lineEndX} ${toY}`,
            ].join(' ')

            // Swept-back ("feathered") arrowhead. Tip on the left plane,
            // back wings flared at x = LEFT_ANCHOR_X + ARROW_AH, with a
            // concave indent halfway along that makes the back read as
            // a dart rather than a plain triangle.
            const tipX        = LEFT_ANCHOR_X
            const tipY        = toY
            const backX       = LEFT_ANCHOR_X + ARROW_AH
            const concaveX    = LEFT_ANCHOR_X + ARROW_AH * 0.55  // depth of the indent
            const wingY1      = toY - ARROW_AW
            const wingY2      = toY + ARROW_AW

            return (
              <g key={i} opacity={opacity}>
                <path
                  d={d}
                  stroke={ARROW_COLOUR}
                  strokeWidth={stroke}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={dash}
                />
                <path
                  d={`M ${tipX} ${tipY}
                      L ${backX} ${wingY1}
                      Q ${concaveX} ${tipY} ${backX} ${wingY2}
                      Z`}
                  fill={ARROW_COLOUR}
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
