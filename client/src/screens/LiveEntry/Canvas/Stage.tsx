import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Player, PlayerId, TeamId } from '@/core/types'
import { useGameStore } from '@/core/store'
import { TAP_THRESH, HH, PILL_SCALE_FACTORS, SLOT_HIT_PADDING, type PillSize } from './constants'
import {
  pillHalfWidth, slotPositions, eventXY, computeArrowPath,
  type Vec,
} from './physics'
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
  /** Pill that should render with thick-border / filled-bg holder styling. */
  holderId: PlayerId | null
  /** Pill highlighted as the selected puller (only relevant in awaiting-pull). */
  pullerId: PlayerId | null
  /** Pills that can't be tapped (rendered at low opacity). */
  ineligibleIds: PlayerId[]

  /** Per-device pill-size preference (sm / md / lg). Scales pill dimensions
   *  in lockstep with the slot hit-test half-height. */
  pillSize: PillSize

  /** Pass arrows to render on this stage; from/to indices match `players`. */
  arrows: PassArrowSpec[]

  /** Logical canvas bounds. Slot positions are derived from bounds via
   *  SLOT_POSITIONS. */
  bounds: { w: number; h: number }

  /** Tap on a pill. Engine decides what to do (puller select / possession /
   *  pick-mode dispatch) based on game state. */
  onPillTap: (player: Player) => void
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

  const [dragIdx, setDragIdx] = useState(-1)
  const stateRef = useRef({ dragIdx: -1 })
  stateRef.current.dragIdx = dragIdx

  const dragInfo = useRef({ idx: -1, offX: 0, offY: 0, startX: 0, startY: 0, moved: false })

  // Pill-size scale (per-device preference). Drives both the rendered pill
  // dimensions in PlayerNode and the half-height used for slot hit-testing.
  const scale = PILL_SCALE_FACTORS[props.pillSize]
  const scaledHalfHeight = HH * scale

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
  // pass arrows + DOM transforms.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const ctx = tickCtx.current
      const slots = slotPositions(ctx.bounds)
      const drag = stateRef.current.dragIdx
      const arr = posRef.current
      for (let i = 0; i < arr.length; i++) {
        if (i === drag) continue
        const slot = slots[i]
        if (!slot) continue
        arr[i].x = slot.x
        arr[i].y = slot.y
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
        // doesn't immediately register as a tap.
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
      props.onPillTap(player)
    }
  }

  function onBackgroundClick() {
    if (dragInfo.current.moved) return
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
        const dragging = i === dragIdx
        const ineligible = props.ineligibleIds.includes(p.id)

        return (
          <PlayerNode
            key={p.id}
            ref={(el) => { nodeRefs.current[i] = el }}
            name={p.name}
            teamColor={props.teamColor}
            scale={scale}
            isHolder={isHolder}
            isPuller={isPuller}
            dragging={dragging}
            ineligible={ineligible}
            onMouseDown={(e) => { if (!ineligible) beginDrag(i, e) }}
            onTouchStart={(e) => { if (!ineligible) beginDrag(i, e) }}
            onClick={onPillClick(i)}
            onMeasureWidth={(hw) => { halfWidthsRef.current[i] = hw }}
          />
        )
      })}
    </div>
  )
}
