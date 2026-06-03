// Atmospheric backdrop for the "moment" screens (PointSummary, GameOver) —
// the only places the app pauses, so they can afford depth that live-entry
// can't. Four cheap layers, no image assets:
//   1. a team-tinted glow bleeding down from the top,
//   2. two faint endzone lines (the ultimate-field motif) in the tint,
//   3. a radial vignette darkening the edges,
//   4. a whisper of SVG-noise grain so the flat #111 stops reading as a void.
//
// Absolutely positioned + pointer-events-none; render it as the first child of
// a `relative` container and give the foreground content `relative z-10`.

// Fractal-noise grain as an inline SVG data-URI (no network / asset needed).
const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

export function MomentBackdrop({ tint = '#ffffff' }: { tint?: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden style={{ zIndex: 0 }}>
      {/* 1 — tinted glow from the top */}
      <div
        className="absolute inset-x-0 top-0 h-2/3"
        style={{ background: `radial-gradient(120% 90% at 50% 0%, ${tint}26, transparent 65%)` }}
      />
      {/* 2 — endzone lines */}
      <div className="absolute inset-x-0" style={{ top: '22%', height: 1, background: `${tint}2e` }} />
      <div className="absolute inset-x-0" style={{ bottom: '22%', height: 1, background: `${tint}2e` }} />
      {/* 3 — vignette */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(125% 95% at 50% 42%, transparent 38%, rgba(0,0,0,0.6) 100%)' }}
      />
      {/* 4 — grain */}
      <div
        className="absolute inset-0"
        style={{ backgroundImage: GRAIN_URI, backgroundRepeat: 'repeat', opacity: 0.05, mixBlendMode: 'overlay' }}
      />
    </div>
  )
}
