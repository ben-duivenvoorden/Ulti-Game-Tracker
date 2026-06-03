import { useEffect, useRef, useState } from 'react'
import { APP_URL } from '../constants'

// Desktop-only modal: renders the live app (same-origin /app/) inside a phone
// bezel over an opaque backdrop that fully blocks the landing page. On phones
// the CTA navigates straight to the app instead of opening this (see
// PreviewProvider). Closes on backdrop click, the X, or ESC; locks body scroll
// while open and restores focus to the trigger on close. Fades in AND out.
type Props = { open: boolean; onClose: () => void }

const ANIM_MS = 300

export default function PhonePreview({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<Element | null>(null)
  // `render` keeps the node mounted through the exit animation; `visible`
  // drives the CSS transition (off → on after mount, on → off before unmount).
  const [render, setRender] = useState(open)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setRender(true)
      const id = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(id)
    }
    setVisible(false)
    const t = setTimeout(() => setRender(false), ANIM_MS)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    triggerRef.current = document.activeElement
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus()
    }
  }, [open, onClose])

  if (!render) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ulti Game Tracker web app preview"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      onClick={onClose}
    >
      {/* Opaque backdrop — fully blocks the landing page; fades in first. */}
      <div
        className={`absolute inset-0 bg-bg transition-opacity duration-[350ms] ease-out ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden
      />

      <button
        ref={closeRef}
        onClick={onClose}
        aria-label="Close preview"
        className={`absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-2 bg-surf/80 text-muted backdrop-blur transition-all duration-300 hover:bg-surf-2 hover:text-content ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      {/* Phone frame — revealed just after the backdrop blocks out the page
          (enter is staggered ~120ms; exit is immediate). Stop propagation so
          clicking the device doesn't close the modal. */}
      <div
        className={`relative z-[1] transition-all duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-4 scale-95 opacity-0'
        }`}
        style={{
          height: 'min(84vh, 860px)',
          aspectRatio: '390 / 844',
          transitionDelay: visible ? '120ms' : '0ms',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Android-style body: slim uniform bezel, modest corner radius. */}
        <div className="relative h-full w-full rounded-[2.1rem] border-2 border-border-2 bg-black p-1.5 shadow-2xl shadow-black/60 ring-1 ring-white/5">
          {/* Screen */}
          <div className="relative h-full w-full overflow-hidden rounded-[1.7rem] bg-bg">
            <iframe
              src={APP_URL}
              title="Ulti Game Tracker — live app preview"
              className="h-full w-full border-0"
            />
            {/* Centered hole-punch camera (no notch) */}
            <div className="pointer-events-none absolute left-1/2 top-2 z-10 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-black ring-1 ring-white/15" />
          </div>
        </div>
      </div>
    </div>
  )
}
