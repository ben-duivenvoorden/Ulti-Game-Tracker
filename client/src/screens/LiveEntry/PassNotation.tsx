import { useLayoutEffect, useRef, useState } from 'react'
import { UNKNOWN_PLAYER_ID, type VisLogEntry, type Player, type TeamId } from '@/core/types'
import { inkOn } from '@/core/contrast'

interface PassNotationProps {
  visLog: VisLogEntry[]
  players: Player[]
  /** Total number of flex rows in the PlayerColumn — players PLUS the
   *  always-present Unknown-Player tile and any running-start `+` / filler
   *  slots. Circle Y-centres divide the column height by THIS (not
   *  players.length), so they land on the real player-tile centres; the tiles
   *  shrink and rise as slots are added. Matches the SankeyBridge geometry. */
  slotCount: number
  activeTeam: TeamId
  /** Active team's brand colour. Drives the contrast pick (light circles
   *  + lines on dark team colours, dark on light team colours) so the
   *  notation reads against whichever pill colour sits underneath. */
  teamColor: string
  /** When false, render nothing (matches the `Passes` recording toggle). */
  passesEnabled: boolean
  /** Which side of the centre gap the player column sits on. Circles hug
   *  the centre-facing edge of each pill; lines bow into/out of the gap. */
  playersOn: 'left' | 'right'
}

// Always show the last two passes. The chain holds (VISIBLE_PASSES + 1)
// nodes — the active holder plus up to two prior passers.
const VISIBLE_PASSES = 2

// Layout constants — kept in sync with PlayerColumn so circle Y centres
// land exactly on pill mid-heights.
const COL_PAD     = 12   // matches PlayerColumn p-3
const ROW_GAP     = 16   // matches PlayerColumn gap-4
const EDGE_INSET  = 11   // px inward from the pill's centre-facing edge to the circle's centre
const CIRCLE_R    = 5    // px
const CIRCLE_SW   = 1.5  // stroke width for empty (prior) circles
const LINE_SW     = 1.5  // stroke width for connecting lines
const OLDER_DASH  = '4 4'  // dash pattern for lines older than the newest visible
const CURVE_MAG   = 12   // px control-point offset perpendicular to the line
// Halo width — extra stroke beyond the main element, drawn first in the
// OPPOSITE ink so the notation reads against both the bright player pills
// AND the dark sankey wash behind the active player. 1 px per side.
const HALO_W      = 2

// Ink colours fed to `inkOn`. Explicit hex so SVG stroke/fill attributes
// don't have to resolve CSS vars (they would, in modern browsers, but
// raw hex side-steps any quirks under HMR / printing / older engines).
// The dark ink matches --color-bg (#111) so the notation aligns with
// the rest of the on-light-fill ink picks across the app.
const INK_LIGHT   = '#ffffff'
const INK_DARK    = '#111111'

// Lightweight chain-of-circles + curved-lines overlay that sits on top of
// the PlayerColumn pills. Solid circle = current disc holder. Empty
// circles = the last (VISIBLE_PASSES) prior passers. Lines connect
// consecutive chain nodes with alternating curve direction so each new
// pass introduces a distinct bow.
export function PassNotation({ visLog, players, slotCount, activeTeam, teamColor, passesEnabled, playersOn }: PassNotationProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    if (!ref.current) return
    const update = () => {
      const el = ref.current
      if (!el) return
      setSize({ w: el.clientWidth, h: el.clientHeight })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])

  if (!passesEnabled) {
    return <div ref={ref} className="absolute inset-0 pointer-events-none" aria-hidden />
  }

  const chain = deriveChain(visLog, activeTeam, players, VISIBLE_PASSES)
  // Same contrast pick the player-pill text uses, so the notation
  // automatically inverts for light team colours (e.g. white kits).
  const notationColor = inkOn(teamColor, INK_LIGHT, INK_DARK)
  // Halo is the opposite ink — drawn under the notation so the line +
  // circles read against the dark sankey wash AND the bright pills.
  const haloColor = notationColor === INK_LIGHT ? INK_DARK : INK_LIGHT

  // Circle X — hug the centre-facing edge of the pill. The pill spans
  // [COL_PAD, W - COL_PAD]; circles sit EDGE_INSET inward from whichever
  // end faces the centre gap.
  const circleX = playersOn === 'left'
    ? size.w - COL_PAD - EDGE_INSET
    : COL_PAD + EDGE_INSET

  // Sign that points AWAY from the players (into the centre gap).
  // Multiplied with the per-arrow alternation sign so "outward" curves
  // are visually consistent across team-side swaps.
  const outwardSign = playersOn === 'left' ? +1 : -1

  // The active node (last in chain) anchors the same-row dedup: any
  // earlier node sharing that row drops its circle but keeps its line
  // endpoint.
  const activeIdx = chain.length > 0 ? chain[chain.length - 1].playerIdx : -1

  return (
    <div ref={ref} className="absolute inset-0 pointer-events-none" aria-hidden>
      {size.w > 0 && size.h > 0 && chain.length > 0 && (
        <svg width={size.w} height={size.h} style={{ display: 'block' }}>
          {/* Lines first so circles render on top. The newest visible line
              (the one terminating at the active circle) renders solid;
              older visible lines render dashed so the chain reads
              newest → oldest at a glance. */}
          {chain.slice(1).map((dst, i, lines) => {
            const src = chain[i]
            const isNewest = i === lines.length - 1
            // Curve direction derives from this arrow's absolute chain
            // index so it stays stable across re-renders. The freshly
            // recorded pass introduces the next chainIdx, which is by
            // construction opposite the previous one.
            const sign = (dst.chainIdx % 2 === 0) ? +1 : -1
            const y1 = rowCenter(src.playerIdx, slotCount, size.h)
            const y2 = rowCenter(dst.playerIdx, slotCount, size.h)
            const ctrlX = circleX + outwardSign * sign * CURVE_MAG
            const ctrlY = (y1 + y2) / 2
            const d = `M ${circleX} ${y1} Q ${ctrlX} ${ctrlY} ${circleX} ${y2}`
            const dash = isNewest ? undefined : OLDER_DASH
            return (
              <g key={`line-${dst.chainIdx}`}>
                <path
                  d={d}
                  stroke={haloColor}
                  strokeWidth={LINE_SW + HALO_W}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={dash}
                />
                <path
                  d={d}
                  stroke={notationColor}
                  strokeWidth={LINE_SW}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={dash}
                />
              </g>
            )
          })}
          {/* Circles. Active = solid; prior = outlined; prior dropped if
              it shares a row with the active node (line still terminates
              at that row). */}
          {chain.map((node, i) => {
            const isActive = i === chain.length - 1
            if (!isActive && node.playerIdx === activeIdx) return null
            const cy = rowCenter(node.playerIdx, slotCount, size.h)
            return isActive ? (
              // Active (solid) circle: paint-order draws the halo stroke
              // first, then the fill on top — leaving a HALO_W/2 ring of
              // halo colour visible around the fill.
              <circle
                key={`c-${node.chainIdx}`}
                cx={circleX}
                cy={cy}
                r={CIRCLE_R}
                fill={notationColor}
                stroke={haloColor}
                strokeWidth={HALO_W}
                style={{ paintOrder: 'stroke fill' }}
              />
            ) : (
              // Empty (outlined) circle: render a wider halo-stroked
              // backing circle, then the visible outline on top — gives
              // a halo ring on both inner and outer sides of the outline.
              <g key={`c-${node.chainIdx}`}>
                <circle
                  cx={circleX}
                  cy={cy}
                  r={CIRCLE_R}
                  fill="none"
                  stroke={haloColor}
                  strokeWidth={CIRCLE_SW + HALO_W}
                />
                <circle
                  cx={circleX}
                  cy={cy}
                  r={CIRCLE_R}
                  fill="none"
                  stroke={notationColor}
                  strokeWidth={CIRCLE_SW}
                />
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

interface ChainNode {
  /** Row index in the active-team player list. */
  playerIdx: number
  /** Absolute index in the chain (0 at chain start). Drives stable curve sign. */
  chainIdx: number
}

// Walks backward through visLog and collects the active team's current
// possession chain:
//   - `possession`  — standard passes (and the pickup that follows a
//                     pull / turnover / block dead-disc state)
//   - `intercept`   — interceptor caught the disc cleanly, so they're
//                     the first node on the new chain
// `block` is NOT included because the blocker hasn't actually possessed
// the disc yet (dead-disc state until the next `possession` event
// records whoever picks up). Stops at any other event type (goal /
// turnover / pull / block / etc.). Returns the trailing
// (maxArrows + 1) nodes, each tagged with its absolute chain position
// so the line-curve sign stays stable as new passes land.
function deriveChain(
  visLog: VisLogEntry[],
  teamId: TeamId,
  players: Player[],
  maxArrows: number,
): ChainNode[] {
  const raw: number[] = []  // playerIds, in reverse encounter order
  for (let i = visLog.length - 1; i >= 0; i--) {
    const e = visLog[i]
    if ((e.type === 'possession' || e.type === 'intercept') && e.teamId === teamId) {
      raw.push(e.playerId)
    } else {
      break
    }
  }
  raw.reverse()

  const nodes: ChainNode[] = []
  for (let i = 0; i < raw.length; i++) {
    // The Unknown-Player sentinel isn't a line member; it renders in the row
    // directly after the roster, so map it to `players.length`.
    const idx = raw[i] === UNKNOWN_PLAYER_ID ? players.length : players.findIndex(p => p.id === raw[i])
    if (idx >= 0) nodes.push({ playerIdx: idx, chainIdx: i })
  }
  return nodes.slice(-(maxArrows + 1))
}

// Y-centre of pill `idx` in measured pixels. Mirrors PlayerColumn's
// flex-1 rows + p-3 padding + gap-2 — so circles land precisely on the
// vertical centre of each player button.
function rowCenter(idx: number, n: number, heightPx: number): number {
  if (n <= 0 || heightPx <= 0) return heightPx / 2
  const available = Math.max(0, heightPx - 2 * COL_PAD - (n - 1) * ROW_GAP)
  const perRow = available / n
  return COL_PAD + idx * (perRow + ROW_GAP) + perRow / 2
}
