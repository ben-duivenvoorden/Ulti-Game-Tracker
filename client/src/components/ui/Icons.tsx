import type { ButtonHTMLAttributes, ReactNode } from 'react'

// Large icon button — 44 px tap target with a 24 px SVG inside. Used at
// the top of screens where the recorder reaches for global affordances
// (Settings, Teams Manager). Matches Material-style top-app-bar icons.

interface IconBtnProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode
  active?: boolean
}

export function IconBtn({ children, active, className = '', ...rest }: IconBtnProps) {
  return (
    <button
      {...rest}
      className={[
        'flex items-center justify-center rounded-lg cursor-pointer transition-colors',
        'w-11 h-11',  // 44 px tap target
        active ? 'text-content bg-surf-2' : 'text-muted hover:text-content hover:bg-surf-2',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function SettingsIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export function InfoIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  )
}

export function TeamsIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

// ── Stroked line icons — replace the scattered emoji glyphs (← ✕ ↶ ⚠ ✓)
//    with a consistent SVG set. All share the SettingsIcon stroke language
//    (currentColor, 1.8 weight, round caps) so they tint via `color` and sit
//    inline in buttons. `strokeWidth` scales with size to stay crisp when small.
function Glyph({ size, sw = 2, children }: { size: number; sw?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    >
      {children}
    </svg>
  )
}

export function BackIcon({ size = 20 }: { size?: number }) {
  return <Glyph size={size}><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></Glyph>
}

export function CloseIcon({ size = 18 }: { size?: number }) {
  return <Glyph size={size}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Glyph>
}

export function UndoIcon({ size = 16 }: { size?: number }) {
  return <Glyph size={size}><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></Glyph>
}

export function WarnIcon({ size = 18 }: { size?: number }) {
  return (
    <Glyph size={size} sw={1.9}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Glyph>
  )
}

export function CheckIcon({ size = 14 }: { size?: number }) {
  return <Glyph size={size} sw={3}><path d="M20 6 9 17l-5-5" /></Glyph>
}

export function MicIcon({ size = 24 }: { size?: number }) {
  return (
    <Glyph size={size} sw={1.8}>
      <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <path d="M12 18v4" />
    </Glyph>
  )
}

// Small filled play-triangle — the truncate-cursor marker (▶) in the log.
export function CursorIcon({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}
