import { useEffect, useState } from 'react'
import { Btn } from '@/components/ui/Btn'
import { CloseIcon, MicIcon, WarnIcon } from '@/components/ui/Icons'
import { getVisLogColor } from '@/core/format'
import { AUTO_CONFIDENCE } from '@/core/voice/match'
import type { PlayerMatcher } from '@/core/voice/match'
import { classifyWords } from '@/core/voice/parse'
import type { ParsedNarration, VoiceEvent, WordKind } from '@/core/voice/parse'

// The voice surface, folded into the live screen (no modal). Two modes on
// one strip anchored above the voice footer:
//  - LIVE (holding / tail decoding): the pause-segmented transcript at the
//    top with matched words highlighted, the events it parses to beneath —
//    read-only while the narration is still assembling.
//  - CONFIRM (result in): same strip, but every event row grows a remove (×)
//    and the Discard / Record buttons appear. Misheard names still die here,
//    never in the log — recordVoiceEvents re-validates with canRecord.

const EVENT_LABEL: Record<string, string> = {
  'possession':              'Pass',
  'goal':                    'Goal',
  'turnover-receiver-error': 'Receiver Error',
  'turnover-throw-away':     'Throw Away',
  'turnover-stall':          'Stall',
  'block':                   'Block',
  'intercept':               'Intercept',
  'pull':                    'Pull',
  'pull-bonus':              'Pull Distance Bonus',
  'brick':                   'Brick',
  'foul':                    'Foul',
  'pick':                    'Pick',
  'timeout':                 'Timeout',
  'undo':                    'Undo',
}

const WORD_STYLE: Record<WordKind, { color: string; fontWeight: number }> = {
  player:  { color: 'var(--color-content)', fontWeight: 700 },
  keyword: { color: 'var(--color-team-a)',  fontWeight: 700 },
  noise:   { color: 'var(--color-dim)',     fontWeight: 400 },
  unknown: { color: 'var(--color-muted)',   fontWeight: 400 },
}

const eventDotColor = (type: string): string =>
  type === 'undo'
    ? 'var(--color-warn)'
    : getVisLogColor(type as Parameters<typeof getVisLogColor>[0])

export function VoiceLivePanel({ caption, busy, matcher, preview, parsed, onApply, onDiscard }: {
  /** Transcript so far (aggregate while listening; final on confirm). */
  caption: string
  /** Released, tail still decoding — result is on its way. */
  busy:    boolean
  matcher: PlayerMatcher
  /** Listening-mode parse of the caption (read-only chips). */
  preview: ParsedNarration | null
  /** Non-null = confirm mode. */
  parsed:  ParsedNarration | null
  /** Returns false when the batch fails canRecord validation. */
  onApply:   (events: VoiceEvent[]) => boolean
  onDiscard: () => void
}) {
  const confirm = parsed !== null
  const [events, setEvents] = useState<VoiceEvent[]>([])
  const [applyError, setApplyError] = useState(false)

  useEffect(() => {
    setEvents(parsed?.events ?? [])
    setApplyError(false)
  }, [parsed])

  const shown  = confirm ? events : (preview?.events ?? [])
  const issues = confirm ? parsed.issues : []

  const removeAt = (i: number) => {
    setApplyError(false)
    setEvents(events.filter((_, idx) => idx !== i))
  }

  const words = caption.split(/[\s,.!?]+/).filter(w => w.length > 0)
  const classified = classifyWords(words, matcher)

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 z-20 flex flex-col ${confirm ? '' : 'pointer-events-none'}`}
      style={{
        background: 'color-mix(in srgb, var(--color-bg) 94%, transparent)',
        borderTop:  `1px solid ${confirm ? 'var(--color-team-a)' : 'var(--color-border)'}`,
        maxHeight:  '60%',
      }}
    >
      {/* Transcript — matched words lit up. */}
      <div className="flex-shrink-0 flex items-start gap-2 px-3 pt-2 pb-1.5">
        <span className="flex-shrink-0 mt-0.5" style={{ color: busy || !confirm ? 'var(--color-danger)' : 'var(--color-muted)' }}>
          <MicIcon size={13} />
        </span>
        <div className="min-w-0 text-xs font-mono leading-relaxed">
          {classified.length === 0 ? (
            <span style={{ color: 'var(--color-muted)' }}>{busy ? 'Transcribing…' : 'Listening…'}</span>
          ) : (
            <>
              {classified.map((c, i) => (
                <span key={i} style={WORD_STYLE[c.kind]}>{c.word}{' '}</span>
              ))}
              {busy && <span className="animate-pulse" style={{ color: 'var(--color-muted)' }}>…</span>}
            </>
          )}
        </div>
      </div>

      {/* Parsed events + issues — scrolls when a long point piles up. */}
      <div className="overflow-y-auto px-3 pb-2 flex flex-col gap-1">
        {issues.map((issue, i) => (
          <div
            key={`issue-${i}`}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-mono"
            style={{ background: 'var(--color-warn-bg)', color: 'var(--color-warn)', border: '1px solid var(--color-warn)' }}
          >
            <WarnIcon size={12} /> <span className="min-w-0">{issue}</span>
          </div>
        ))}

        {confirm && shown.length === 0 && issues.length === 0 ? (
          <div className="text-center py-2 text-sm" style={{ color: 'var(--color-muted)' }}>
            Nothing recognisable — try again, or tap it in.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {shown.map((e, i) => {
              const lowConf = e.confidence < AUTO_CONFIDENCE
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-full text-[11px] font-semibold"
                  style={{
                    background: 'var(--color-surf-2)',
                    border:     `1px solid ${lowConf ? 'var(--color-warn)' : 'var(--color-border-2)'}`,
                    color:      'var(--color-content)',
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: eventDotColor(e.input.type) }} />
                  {EVENT_LABEL[e.input.type] ?? e.input.type}{e.playerName ? ` — ${e.playerName}` : ''}
                  {confirm ? (
                    <button
                      onClick={() => removeAt(i)}
                      className="cursor-pointer flex items-center text-muted hover:text-content"
                      title="Remove this event"
                    >
                      <CloseIcon size={13} />
                    </button>
                  ) : (
                    <span className="w-0.5" aria-hidden />
                  )}
                </span>
              )
            })}
          </div>
        )}

        {applyError && (
          <div
            className="px-2.5 py-1.5 rounded-md text-[11px] font-mono"
            style={{ background: 'var(--color-warn-bg)', color: 'var(--color-danger)', border: '1px solid var(--color-danger)' }}
          >
            The sequence isn't recordable from the current game state — remove the broken step or discard.
          </div>
        )}
      </div>

      {confirm && (
        <div className="flex-shrink-0 flex gap-2 px-3 pb-2">
          <Btn variant="ghost" size="md" full onClick={onDiscard}>Discard</Btn>
          <Btn
            variant="primary"
            size="md"
            full
            disabled={events.length === 0}
            onClick={() => { if (!onApply(events)) setApplyError(true) }}
          >
            Record {events.length} event{events.length === 1 ? '' : 's'}
          </Btn>
        </div>
      )}
    </div>
  )
}
