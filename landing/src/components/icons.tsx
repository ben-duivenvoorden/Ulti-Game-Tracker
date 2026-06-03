// Small inline SVG icon set — no icon dependency. Each takes a className so
// callers control size/color via Tailwind (stroke/fill = currentColor).

type IconProps = { className?: string }

export function GitHubIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.54-.01 2.79-.01 3.17 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  )
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  )
}

export function BoltIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" />
    </svg>
  )
}

export function CloudOffIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.5 19a4.5 4.5 0 0 0 .9-8.91 6 6 0 0 0-9.6-3.32" />
      <path d="M6.5 9A4.5 4.5 0 0 0 7 18h9.5" />
      <path d="m3 3 18 18" />
    </svg>
  )
}

export function DatabaseIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  )
}

export function ChartIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v18h18" />
      <rect x="7" y="11" width="3" height="6" rx="0.5" />
      <rect x="12.5" y="7" width="3" height="10" rx="0.5" />
      <rect x="18" y="13" width="3" height="4" rx="0.5" />
    </svg>
  )
}

export function AppleIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.36 12.78c-.02-2.05 1.67-3.03 1.75-3.08-.95-1.4-2.43-1.59-2.96-1.61-1.26-.13-2.46.74-3.1.74-.64 0-1.62-.72-2.67-.7-1.37.02-2.64.8-3.34 2.03-1.43 2.48-.37 6.15 1.02 8.16.68.98 1.49 2.08 2.55 2.04 1.02-.04 1.41-.66 2.65-.66 1.23 0 1.58.66 2.66.64 1.1-.02 1.8-1 2.47-1.99.78-1.14 1.1-2.25 1.12-2.31-.02-.01-2.15-.83-2.17-3.29ZM14.3 6.6c.56-.69.94-1.63.84-2.6-.81.03-1.81.54-2.4 1.22-.52.6-.98 1.58-.86 2.51.9.07 1.85-.46 2.42-1.13Z" />
    </svg>
  )
}

export function AndroidIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.6 9.48 19 7.05a.4.4 0 0 0-.69-.4L16.9 9.1a8.6 8.6 0 0 0-9.8 0L5.69 6.65a.4.4 0 1 0-.69.4l1.4 2.43A8.13 8.13 0 0 0 2 16.1h20a8.13 8.13 0 0 0-4.4-6.62ZM7.5 13.6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm9 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
    </svg>
  )
}

export function GlobeIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  )
}
