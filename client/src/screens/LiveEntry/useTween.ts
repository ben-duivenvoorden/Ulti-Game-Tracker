import { useEffect, useRef, useState } from 'react'

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

// Animate a number toward `target` whenever it changes, via requestAnimationFrame.
// Returns the current animated value. Dependency-free and works on every browser
// (no CSS `transition: d` path-morph, which Safari/Firefox don't support). On a
// retarget mid-flight it hands off smoothly from the current value, and it
// cancels its frame on unmount.
export function useTween(
  target: number,
  { ms = 260, easing = easeOutCubic }: { ms?: number; easing?: (t: number) => number } = {},
): number {
  const [value, setValue] = useState(target)
  const fromRef  = useRef(target)   // tracks the live animated value
  const rafRef   = useRef<number | null>(null)
  const startRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    if (from === target) return
    startRef.current = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / ms)
      const v = from + (target - from) * easing(t)
      fromRef.current = v
      setValue(v)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = target
        setValue(target)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [target, ms, easing])

  return value
}
