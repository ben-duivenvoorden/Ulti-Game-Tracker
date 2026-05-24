import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Player, PlayerId, TeamId } from '@/core/types'
import { useGameStore } from '@/core/store'
import { TAP_THRESH, HH, PILL_SCALE_FACTORS, SLOT_HIT_PADDING, type PillSize } from './constants'
import {
  pillHalfWidth, pillRect, slotPositions, eventXY, computeArrowPath,
  chipRect, rectsIntersect,
  type ChipSpec, type Rect, type Vec,
} from './physics'
import { buildActions, chipAction, type ChipAction, type ChipId, type Placement } from './layout'
type DisabledChipIds = ReadonlySet<ChipId>
import { PlayerNode } from './PlayerNode'
import { PassArrowLayer, type PassArrowSpec, type ArrowNodeRefs } from './PassArrowLayer'

export type StageMode = 'in-play' | 'awaiting-pull' | 'pick'

export interface StageProps {
  /** Active team id. Used both as a stable key by the parent (a team swap
   *  remounts the stage) and as the target of the swap-line-slots action. */
  teamId: TeamId
  players: Player[]
  teamColor: string

  mode: StageMode
  /** Pill that should render with thick-border / filled-bg holder styling.
   *  In awaiting-pull, the engine-set discHolder is null, so this is null. */
  holderId: PlayerId | null
  /** Pill highlighted as the selected puller (only relevant in awaiting-pull). */
  pullerId: PlayerId | null
  /** Pills that can't be tapped (rendered at low opacity). */
  ineligibleIds: PlayerId[]

  /** Recording-options-driven chip toggles. */
  stallShown: boolean
  bonusShown: boolean
  brickShown: boolean

  /** Per-device pill-size preference (sm / md / lg). Scales pill dimensions
   *  in lockstep with the slot hit-test half-height. */
  pillSize: PillSize

  /** Chip ids that should render dimmed + un-tappable (e.g. Goal / Receiver
   *  Error during a fresh possession run before any pass has been made). */
  disabledChipIds: DisabledChipIds

  /** Pass arrows to render on this stage; from/to indices match `players`. */
  arrows: PassArrowSpec[]

  /** Logical canvas centre + bounds. Centre is informational only — slot
   *  positions are derived from bounds via SLOT_POSITIONS. */
  centre: { x: number; y: number }
  bounds: { w: number; h: number }

  /** Tap on a pill that doesn't open chips (defender / teammate / puller). */
  onPillTap: (player: Player) => void
  /** Tap on an action chip emitted by an opened pill. */
  onChipTap: (player: Player, action: ChipAction) => void
  /** Tap on the empty canvas background (used to cancel pick mode). */
  onBackgroundTap: () => void
}

export function Stage(props: StageProps) {
  const N = props.players.length
  const posRef = useRef<Vec[]>([])
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([])
  if (nodeRefs.current.length !== N) {
    nodeRefs.current = Array.from({ length: N }, () => null)
  }

  // Per-pill measured half-width (px). Seeded with the heuristic so the slot
  // hit-test works on the first frame; PlayerNode replaces these via
  // onMeasureWidth.
  const halfWidthsRef = useRef<number[]>([])
  if (halfWidthsRef.current.length !== N) {
    halfWidthsRef.current = props.players.map(p => pillHalfWidth(p.name))
  }

  const swapLineSlots = useGameStore(s => s.swapLineSlots)

  // Initial positions on mount / when team-id changes (parent re-keys Stage).
  // Positions snap to slot coords; halfWidths reseed off the new roster.
  useLayoutEffect(() => {
    const slots = slotPositions(props.bounds)
    posRef.current = Array.from({ length: N }, (_, i) => ({
      x: slots[i]?.x ?? props.bounds.w / 2,
      y: slots[i]?.y ?? props.bounds.h / 2,
    }))
    halfWidthsRef.current = props.players.map(p => pillHalfWidth(p.name))
    applyDOM()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [N, props.teamId])

  const [openIdx, setOpenIdx] = useState(-1)
  const [dragIdx, setDragIdx] = useState(-1)
  const stateRef = useRef({ openIdx: -1, dragIdx: -1 })
  stateRef.current.openIdx = openIdx
  stateRef.current.dragIdx = dragIdx

  // Auto-open the action chips on whichever pill is the current holder
  // (in-play) or selected puller (awaiting-pull). This makes the chips
  // "explode" immediately upon selection — the user doesn't need a second
  // tap to access actions. If the role becomes null (dead disc / no puller
  // selected) or the mode changes (e.g. entering pick mode), close the chips.
  useEffect(() => {
    let idx = -1
    if (props.mode === 'in-play' && props.holderId !== null) {
      idx = props.players.findIndex(p => p.id === props.holderId)
    } else if (props.mode === 'awaiting-pull' && props.pullerId !== null) {
      idx = props.players.findIndex(p => p.id === props.pullerId)
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenIdx(idx)
  }, [props.mode, props.holderId, props.pullerId, props.players])

  const dragInfo = useRef({ idx: -1, offX: 0, offY: 0, startX: 0, startY: 0, moved: false })

  // Pill-size scale (per-device preference). Drives both the rendered pill
  // dimensions in PlayerNode and the half-height used for slot hit-testing.
  const scale = PILL_SCALE_FACTORS[props.pillSize]
  const scaledHalfHeight = HH * scale

  // Build a Placement for the pill at active-line index `idx`. Anchors the
  // chip rosette at the pill's slot (not its drag-offset position) and
  // exposes every *other* pill's slot rect so the repair pass in
  // buildActions() can keep chips clear of teammates.
  const placementFor = (idx: number): Placement | undefined => {
    if (idx < 0) return undefined
    const slots = slotPositions(props.bounds)
    const slot = slots[idx]
    if (!slot) return undefined
    const others: Rect[] = []
    for (let j = 0; j < props.players.length; j++) {
      if (j === idx) continue
      const s = slots[j]
      if (!s) continue
      const hw = halfWidthsRef.current[j] ?? pillHalfWidth(props.players[j]?.name ?? '')
      others.push(pillRect(s.x, s.y, hw, scaledHalfHeight))
    }
    return { pill: { x: slot.x, y: slot.y }, bounds: props.bounds, others }
  }

  // Compute the chip set per pill. Always non-empty for pills that *could*
  // be opened (holder in in-play, puller in awaiting-pull) so the chips are
  // already mounted (invisible) and can transition in when isOpen flips.
  const chipsForPlayer = (player: Player): ChipSpec[] => {
    if (props.mode === 'pick') return []
    const idx = props.players.indexOf(player)
    const HW = idx >= 0 ? halfWidthsRef.current[idx] : pillHalfWidth(player.name)
    const placement = placementFor(idx)
    if (props.mode === 'awaiting-pull') {
      if (player.id !== props.pullerId) return []
      return buildActions(HW, {
        phase: 'awaiting-pull',
        bonusShown: props.bonusShown,
        brickShown: props.brickShown,
      }, placement)
    }
    if (player.id !== props.holderId) return []
    return buildActions(HW, { phase: 'in-play', stallShown: props.stallShown }, placement)
  }

  // Latest-props ref so the rAF loop sees current bounds/arrows without
  // restarting.
  const tickCtx = useRef({
    bounds: props.bounds,
    arrows: props.arrows,
    halfHeight: scaledHalfHeight,
  })
  tickCtx.current = {
    bounds: props.bounds,
    arrows: props.arrows,
    halfHeight: scaledHalfHeight,
  }

  // Open pill's chip rects, in canvas-space. Used by the rAF tick to push
  // surrounding pills out of the way when their slot rect overlaps a chip's
  // footprint — keeps chips readable even when the rosette is wider than the
  // available gap between teammates.
  //
  // Recomputed whenever the open pill, its chips, or the bounds change.
  // Half-width changes (measured by ResizeObserver) don't trigger this — the
  // initial heuristic is close enough, and the rosette re-lays once the
  // measured width feeds back via the next prop tick.
  const openChipRectsRef = useRef<Rect[]>([])
  useEffect(() => {
    if (openIdx < 0) { openChipRectsRef.current = []; return }
    const slots = slotPositions(props.bounds)
    const openSlot = slots[openIdx]
    const openPlayer = props.players[openIdx]
    if (!openSlot || !openPlayer) { openChipRectsRef.current = []; return }
    const chips = chipsForPlayer(openPlayer)
    openChipRectsRef.current = chips.map(c => chipRect(openSlot.x, openSlot.y, c))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openIdx, props.holderId, props.pullerId, props.mode, props.players, props.bounds,
      props.stallShown, props.bonusShown, props.brickShown, scale])

  function applyDOM() {
    const arr = posRef.current
    for (let i = 0; i < arr.length; i++) {
      const el = nodeRefs.current[i]
      if (!el) continue
      el.style.transform = `translate3d(${arr[i].x}px, ${arr[i].y}px, 0)`
    }
  }

  // Arrow node refs — mutated each frame from the rAF tick.
  const arrowRefs = useRef<ArrowNodeRefs[]>([{ path: null, head: null }, { path: null, head: null }])

  // rAF loop — runs once per Stage instance (per team). Each frame, write the
  // home-slot coords into posRef for every non-dragging pill, then update the
  // pass arrows + DOM transforms. The dragged pill (if any) is positioned by
  // the drag handler's onMove, not by this loop.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const ctx = tickCtx.current
      const slots = slotPositions(ctx.bounds)
      const drag = stateRef.current.dragIdx
      const openIdxNow = stateRef.current.openIdx
      const arr = posRef.current
      for (let i = 0; i < arr.length; i++) {
        if (i === drag) continue
        const slot = slots[i]
        if (!slot) continue
        arr[i].x = slot.x
        arr[i].y = slot.y
      }

      // Push-out pass — when a pill is open, any teammate whose slot rect
      // overlaps a chip rect (inflated by CHIP_HALO_PX for comfort) is
      // shifted just far enough to clear. The repair pass in layout.ts
      // already avoids chip-chip overlap; pill-vs-chip overlap is fixed
      // here, per-frame, so the displacement reverses the instant the open
      // pill closes (next tick snaps everyone back).
      //
      // Inflating the chip rect with a halo means neighbours land with
      // comfortable visual clearance, not just barely-non-overlapping. 12 px
      // is roughly the same as the connector-line gap between pill and chip
      // (CHIP_GAP in layout.ts), so the visual rhythm reads consistently.
      //
      // Up to 4 iterations: a pill caught between two adjacent chips may
      // have its first axis-resolution put it back into a sibling chip, so
      // we keep nudging until stable (capped to bound the work).
      const CHIP_HALO_PX = 12
      const chipRects = openChipRectsRef.current
      if (openIdxNow >= 0 && chipRects.length > 0) {
        for (let i = 0; i < arr.length; i++) {
          if (i === drag || i === openIdxNow) continue
          const hw = halfWidthsRef.current[i]
          if (!hw) continue
          let px = arr[i].x, py = arr[i].y
          for (let pass = 0; pass < 4; pass++) {
            let moved = false
            for (const cr of chipRects) {
              // Inflated rect — testing against this evicts the pill so the
              // chip ends up with HALO clearance on every side, not zero.
              const halo: Rect = {
                l: cr.l - CHIP_HALO_PX, r: cr.r + CHIP_HALO_PX,
                t: cr.t - CHIP_HALO_PX, b: cr.b + CHIP_HALO_PX,
              }
              const r = pillRect(px, py, hw, ctx.halfHeight)
              if (!rectsIntersect(r, halo)) continue
              const ccx = (halo.l + halo.r) / 2
              const ccy = (halo.t + halo.b) / 2
              const halfW = (halo.r - halo.l) / 2 + hw
              const halfH = (halo.b - halo.t) / 2 + ctx.halfHeight
              const overlapX = halfW - Math.abs(px - ccx)
              const overlapY = halfH - Math.abs(py - ccy)
              if (overlapX <= 0 || overlapY <= 0) continue
              // Resolve along the shorter axis with a small additional gap
              // so the next iteration doesn't ping-pong on rounding.
              const GAP = 2
              if (overlapX < overlapY) {
                px += (px >= ccx ? 1 : -1) * (overlapX + GAP)
              } else {
                py += (py >= ccy ? 1 : -1) * (overlapY + GAP)
              }
              moved = true
            }
            if (!moved) break
          }
          arr[i].x = px
          arr[i].y = py
        }
      }

      // Update pass arrows (recent at slot 0, previous at slot 1).
      for (let k = 0; k < 2; k++) {
        const slotRef = arrowRefs.current[k]
        if (!slotRef?.path || !slotRef?.head) continue
        const passIdx = ctx.arrows.length - 1 - k
        const pass = ctx.arrows[passIdx]
        if (!pass || pass.fromIdx < 0 || pass.toIdx < 0
                  || pass.fromIdx >= arr.length
                  || pass.toIdx   >= arr.length) {
          slotRef.path.setAttribute('opacity', '0')
          slotRef.head.setAttribute('opacity', '0')
          continue
        }
        const a = arr[pass.fromIdx]
        const b = arr[pass.toIdx]
        if (!a || !b) continue
        const halfA = { hw: halfWidthsRef.current[pass.fromIdx], hh: ctx.halfHeight }
        const halfB = { hw: halfWidthsRef.current[pass.toIdx],   hh: ctx.halfHeight }
        const geom = computeArrowPath(a.x, a.y, b.x, b.y, halfA, halfB)
        slotRef.path.setAttribute('d', geom.d)
        slotRef.path.setAttribute('opacity', k === 0 ? '1' : '0.35')
        slotRef.head.setAttribute('points', geom.head)
        slotRef.head.setAttribute('opacity', k === 0 ? '1' : '0.35')
      }

      applyDOM()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [N])

  // ─── Drag handlers ───
  function beginDrag(i: number, e: React.MouseEvent | React.TouchEvent) {
    e.stopPropagation()
    e.preventDefault()
    const xy = eventXY(e.nativeEvent as MouseEvent | TouchEvent)
    const p = posRef.current[i]
    dragInfo.current = {
      idx: i, offX: xy.x - p.x, offY: xy.y - p.y,
      startX: xy.x, startY: xy.y, moved: false,
    }
    setDragIdx(i)

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const idx = dragInfo.current.idx
      if (idx < 0) return
      const m = eventXY(ev)
      if (!dragInfo.current.moved) {
        const dist = Math.hypot(m.x - dragInfo.current.startX, m.y - dragInfo.current.startY)
        if (dist > TAP_THRESH) dragInfo.current.moved = true
      }
      const pp = posRef.current[idx]
      pp.x = m.x - dragInfo.current.offX
      pp.y = m.y - dragInfo.current.offY
      const el = nodeRefs.current[idx]
      if (el) el.style.transform = `translate3d(${pp.x}px, ${pp.y}px, 0)`
      ev.preventDefault?.()
    }

    const onEnd = () => {
      const wasDrag = dragInfo.current.moved
      const draggedIdx = dragInfo.current.idx
      dragInfo.current.idx = -1
      setDragIdx(-1)

      if (wasDrag && draggedIdx >= 0) {
        // Hit-test the dragged pill's current centre against every other
        // pill's slot rect. A drop within SLOT_HIT_PADDING of another slot
        // counts as a swap; empty-space drops fall through and the pill
        // snaps back to its slot via the next rAF tick.
        const slots = slotPositions(tickCtx.current.bounds)
        const halfH = tickCtx.current.halfHeight
        const dragged = posRef.current[draggedIdx]
        let target = -1
        for (let j = 0; j < slots.length; j++) {
          if (j === draggedIdx) continue
          const slot = slots[j]
          if (!slot) continue
          const hw = halfWidthsRef.current[j] ?? pillHalfWidth(props.players[j]?.name ?? '')
          const dx = Math.abs(dragged.x - slot.x)
          const dy = Math.abs(dragged.y - slot.y)
          if (dx <= hw + SLOT_HIT_PADDING && dy <= halfH + SLOT_HIT_PADDING) {
            target = j
            break
          }
        }

        if (target >= 0) {
          swapLineSlots(props.teamId, draggedIdx, target)
        }

        // Swallow the synthetic click that follows mouseup so the drop site
        // doesn't immediately register as a tap. If no click fires (release
        // on a non-clickable area), tear the listener down on a short timer
        // so the *next* genuine tap isn't eaten.
        let removed = false
        const cleanup = () => {
          if (removed) return
          removed = true
          document.removeEventListener('click', swallow, true)
        }
        const swallow = (cev: Event) => {
          cev.stopPropagation()
          cev.preventDefault()
          cleanup()
        }
        document.addEventListener('click', swallow, true)
        setTimeout(cleanup, 200)
      }

      document.removeEventListener('mousemove',  onMove, true)
      document.removeEventListener('mouseup',    onEnd as EventListener,  true)
      document.removeEventListener('touchmove',  onMove as EventListener, true)
      document.removeEventListener('touchend',   onEnd as EventListener,  true)
      document.removeEventListener('touchcancel', onEnd as EventListener, true)
    }

    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('mouseup',   onEnd as EventListener,  true)
    document.addEventListener('touchmove', onMove as EventListener, { capture: true, passive: false })
    document.addEventListener('touchend',  onEnd as EventListener,  true)
    document.addEventListener('touchcancel', onEnd as EventListener, true)
  }

  // ─── Pill tap ───
  function onPillClick(i: number) {
    return (e: React.MouseEvent) => {
      e.stopPropagation()
      if (dragInfo.current.moved) return
      const player = props.players[i]
      if (props.ineligibleIds.includes(player.id)) return

      const canOpen =
        props.mode === 'in-play'       ? player.id === props.holderId :
        props.mode === 'awaiting-pull' ? player.id === props.pullerId :
        false

      if (canOpen) {
        setOpenIdx(prev => prev === i ? -1 : i)
      } else {
        setOpenIdx(-1)
        props.onPillTap(player)
      }
    }
  }

  function onChipTap(player: Player, id: ChipId) {
    if (props.disabledChipIds.has(id)) return
    setOpenIdx(-1)
    props.onChipTap(player, chipAction(id))
  }

  function onBackgroundClick() {
    if (dragInfo.current.moved) return
    setOpenIdx(-1)
    props.onBackgroundTap()
  }

  return (
    <div
      className="absolute inset-0"
      onClick={onBackgroundClick}
      style={{ touchAction: 'none' }}
    >
      <PassArrowLayer teamColor={props.teamColor} refs={arrowRefs} />
      {props.players.map((p, i) => {
        const isHolder = p.id === props.holderId
        const isPuller = p.id === props.pullerId
        const isOpen   = i === openIdx
        const dragging = i === dragIdx
        const ineligible = props.ineligibleIds.includes(p.id)

        return (
          <PlayerNode
            key={p.id}
            ref={(el) => { nodeRefs.current[i] = el }}
            name={p.name}
            teamColor={props.teamColor}
            scale={scale}
            disabledChipIds={props.disabledChipIds}
            isHolder={isHolder}
            isPuller={isPuller}
            isOpen={isOpen}
            dragging={dragging}
            ineligible={ineligible}
            chips={chipsForPlayer(p)}
            onMouseDown={(e) => { if (!ineligible) beginDrag(i, e) }}
            onTouchStart={(e) => { if (!ineligible) beginDrag(i, e) }}
            onClick={onPillClick(i)}
            onChipClick={(id) => onChipTap(p, id)}
            onMeasureWidth={(hw) => { halfWidthsRef.current[i] = hw }}
          />
        )
      })}
    </div>
  )
}
