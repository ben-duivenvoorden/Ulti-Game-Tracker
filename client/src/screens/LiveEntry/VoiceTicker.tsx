import { classifyWords, type WordKind } from '@/core/voice/parse'
import { transcriptWords } from '@/core/voice/segments'
import type { PlayerMatcher } from '@/core/voice/match'

// One-line strip directly under LogPeek — everything the voice model hears,
// with only our context lit up: player names and grammar keywords bold,
// filler dim, words that match nothing amber. Newest words stay visible
// (content right-aligned inside an overflow-hidden row — zero scroll code);
// a fade mask hints at the clipped history on the left. Mounted permanently
// so the max-height transition animates both the slide-in and the collapse.

const WORD_STYLE: Record<WordKind, { color: string; fontWeight: number }> = {
  player:  { color: 'var(--color-content)', fontWeight: 700 },
  keyword: { color: 'var(--color-team-a)',  fontWeight: 700 },
  noise:   { color: 'var(--color-dim)',     fontWeight: 400 },
  unknown: { color: 'var(--color-warn)',    fontWeight: 400 },
}

export function VoiceTicker({ active, transcript, matcher, stopping }: {
  /** Capture live (listening or tail decode) — collapsed otherwise. */
  active:     boolean
  /** Aggregate transcript of the current capture. */
  transcript: string
  matcher:    PlayerMatcher
  /** Stop tapped, tail decode in flight. */
  stopping:   boolean
}) {
  const classified = active ? classifyWords(transcriptWords(transcript), matcher) : []
  return (
    <div
      className="flex-shrink-0 w-full overflow-hidden"
      style={{
        maxHeight:  active ? 28 : 0,
        opacity:    active ? 1 : 0,
        transition: 'max-height 200ms ease, opacity 200ms ease',
        background: 'var(--color-surf)',
        borderBottom: active ? '1px solid var(--color-border)' : 'none',
      }}
      aria-live="polite"
    >
      {/* Content only while active — a collapsed strip must not leave
          "Listening…" in the accessibility tree / page text. */}
      {active && <div className="h-7 flex items-center gap-2 px-3">
        <span
          className="flex-shrink-0 w-2 h-2 rounded-full animate-pulse"
          style={{ background: stopping ? 'var(--color-muted)' : 'var(--color-danger)' }}
          aria-hidden
        />
        <div className="flex-1 min-w-0 relative overflow-hidden">
          <div className="flex justify-end whitespace-nowrap text-xs font-mono leading-none">
            {classified.length === 0 ? (
              <span style={{ color: 'var(--color-muted)' }}>
                {stopping ? 'Transcribing…' : 'Listening…'}
              </span>
            ) : (
              <>
                {classified.map((c, i) => (
                  <span key={i} style={WORD_STYLE[c.kind]}>{c.word}&nbsp;</span>
                ))}
                {stopping && (
                  <span className="animate-pulse" style={{ color: 'var(--color-muted)' }}>…</span>
                )}
              </>
            )}
          </div>
          {/* Clipped-history hint. */}
          <div
            className="absolute inset-y-0 left-0 w-8 pointer-events-none"
            style={{ background: 'linear-gradient(to right, var(--color-surf), transparent)' }}
            aria-hidden
          />
        </div>
      </div>}
    </div>
  )
}
