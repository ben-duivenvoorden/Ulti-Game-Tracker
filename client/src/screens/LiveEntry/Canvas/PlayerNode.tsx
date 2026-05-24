import { forwardRef, useEffect, useRef } from 'react'
import { PILL_H, PILL_FONT_SIZE, PILL_PADDING_X } from './constants'
import { pillLabel } from './physics'

interface PlayerNodeProps {
  name: string
  teamColor: string
  /** Multiplier on the base pill dimensions (height, font, padding). */
  scale: number
  isHolder: boolean
  isPuller: boolean
  dragging: boolean
  ineligible: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onTouchStart: (e: React.TouchEvent) => void
  onClick: (e: React.MouseEvent) => void
  /** Reports the rendered pill's half-width so physics can use real metrics
   *  rather than a font-based heuristic. */
  onMeasureWidth: (halfWidth: number) => void
}

interface PillVisualState {
  teamColor:  string
  isHolder:   boolean
  isPuller:   boolean
  dragging:   boolean
  ineligible: boolean
}

interface PillVisuals {
  bg:          string
  borderColor: string
  borderWidth: number
  boxShadow:   string
}

// Maps pill state → the four visual properties that vary across states.
function pillVisuals({ teamColor, isHolder, isPuller, dragging, ineligible }: PillVisualState): PillVisuals {
  const bg =
    ineligible           ? 'var(--color-surf-2)' :
    isHolder             ? `${teamColor}28` :
    isPuller             ? `${teamColor}18` :
                           `${teamColor}08`

  const borderColor = ineligible ? 'var(--color-border)' : teamColor
  const borderWidth = isHolder ? 2.5 : isPuller ? 2 : 1.5

  const boxShadow =
    dragging                  ? `0 0 0 2px ${teamColor}4d, 0 8px 22px rgba(0,0,0,0.55), 0 0 22px ${teamColor}55` :
    isPuller && !isHolder     ? `0 0 0 3px ${teamColor}3d, 0 0 28px ${teamColor}99` :
    isHolder                  ? `0 0 12px ${teamColor}33` :
                                '0 0 0 0 transparent'

  return { bg, borderColor, borderWidth, boxShadow }
}

export const PlayerNode = forwardRef<HTMLDivElement, PlayerNodeProps>(function PlayerNode(
  { name, teamColor, scale, isHolder, isPuller, dragging, ineligible,
    onMouseDown, onTouchStart, onClick, onMeasureWidth }, ref,
) {
  const display = pillLabel(name)
  const pillRef = useRef<HTMLDivElement | null>(null)

  // Measure the rendered pill width and report up. Using useEffect (not
  // useLayoutEffect) avoids a layout thrash; physics tolerates a one-frame
  // delay before the measured width replaces the heuristic.
  useEffect(() => {
    if (!pillRef.current) return
    const measure = () => {
      const el = pillRef.current
      if (!el) return
      const w = el.offsetWidth
      if (w > 0) onMeasureWidth(w / 2)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(pillRef.current)
    return () => ro.disconnect()
  }, [name, onMeasureWidth])

  const { bg, borderColor, borderWidth, boxShadow } = pillVisuals({
    teamColor, isHolder, isPuller, dragging, ineligible,
  })

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute', left: 0, top: 0,
        transform: 'translate3d(0,0,0)',
        willChange: 'transform',
        zIndex: dragging ? 5 : 2,
        opacity: ineligible ? 0.4 : 1,
        pointerEvents: ineligible ? 'none' : 'auto',
      }}
    >
      <div
        ref={pillRef}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onClick={onClick}
        style={{
          height: PILL_H * scale,
          padding: `0 ${PILL_PADDING_X * scale}px`,
          boxSizing: 'border-box',
          borderRadius: 9999,
          border: `${borderWidth}px solid ${borderColor}`,
          background: bg,
          color: ineligible ? 'var(--color-dim)' : 'var(--color-content)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 'max-content',
          position: 'absolute', left: 0, top: 0,
          transform: dragging
            ? 'translate(-50%, -50%) scale(1.06)'
            : 'translate(-50%, -50%) scale(1)',
          fontFamily: 'var(--font-sans)',
          fontSize: PILL_FONT_SIZE * scale, fontWeight: 600, letterSpacing: 0.2,
          whiteSpace: 'nowrap',
          userSelect: 'none', WebkitUserSelect: 'none',
          cursor: ineligible ? 'default' : (dragging ? 'grabbing' : 'grab'),
          touchAction: 'none',
          boxShadow,
          transition: 'box-shadow 160ms ease, background 160ms ease, transform 140ms ease, border-color 160ms ease',
        }}
      >
        {display}
      </div>
    </div>
  )
})
