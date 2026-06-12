import { useLayoutEffect, useRef, useState } from 'react'
import { useTween } from './useTween'

// Sankey-style ribbon that wraps the active player tile, the bridge,
// and the action-button region of the event column as ONE outlined
// shape. No internal sub-borders — the active player tile and the
// event column themselves render without borders so the only outline
// visible is this combined wrap. Inside the wrap, a faint team-colour
// wash fills the whole region; action buttons retain their own solid
// colours (Goal green, Throw away red, etc.) and sit on top.
//
// Pixel positions are approximated from the player count + active row
// index plus the known centre-spacer width and column padding. The SVG
// sizes itself from a ResizeObserver on its wrapper so the path stays
// in real pixels regardless of viewport scale.
//
// The shape's vertical extent on the events side covers only the
// action-button stack (NOT the gap below or the More button) — so
// More sits outside the encompass.
export function SankeyBridge({
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
  // player instead of hard-cutting. Render-phase adjustment (the sanctioned
  // "previous render" pattern) rather than a ref so the read stays pure.
  const [lastValidIdx, setLastValidIdx] = useState(activeIdx >= 0 ? activeIdx : 0)
  if (activeIdx >= 0 && activeIdx !== lastValidIdx) setLastValidIdx(activeIdx)
  const animIdx = useTween(activeIdx >= 0 ? activeIdx : lastValidIdx, { ms: 240 })
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
