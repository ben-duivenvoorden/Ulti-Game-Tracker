import { useState } from 'react'
import { ModalScrim } from '@/components/ModalScrim'
import { Btn } from '@/components/ui/Btn'
import { CloseIcon, MicIcon, WarnIcon } from '@/components/ui/Icons'
import { getVisLogColor } from '@/core/format'
import { AUTO_CONFIDENCE } from '@/core/voice/match'
import type { ParsedNarration, VoiceEvent } from '@/core/voice/parse'

// "Here's the point I heard" — the non-negotiable review gate between a voice
// narration and the append-only rawLog (misheard names must die here, not in
// the log). Rows can be removed; low-confidence matches are amber; Apply
// routes the batch through recordVoiceEvents, which re-validates every event
// with canRecord before anything commits. Source-agnostic: a future cloud
// transcript feeds the same sheet.

export const EVENT_LABEL: Record<string, string> = {
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

/** Live caption strip shown WHILE the scorer holds the PTT: the pause-
 *  segmented transcript as it lands, plus the events it currently parses to.
 *  Preview only — the review sheet stays the single gate to the log. */
export function VoiceLiveCaption({ caption, parsed }: {
  caption: string
  parsed:  ParsedNarration | null
}) {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 px-3 py-2 flex flex-col gap-1.5 pointer-events-none"
      style={{
        background: 'color-mix(in srgb, var(--color-bg) 92%, transparent)',
        borderTop:  '1px solid var(--color-border)',
      }}
    >
      {parsed && parsed.events.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {parsed.events.map((e, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
              style={{
                background: 'var(--color-surf-2)',
                border:     `1px solid ${e.confidence < AUTO_CONFIDENCE ? 'var(--color-warn)' : 'var(--color-border-2)'}`,
                color:      'var(--color-content)',
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: e.input.type === 'undo'
                    ? 'var(--color-warn)'
                    : getVisLogColor(e.input.type as Parameters<typeof getVisLogColor>[0]),
                }}
              />
              {EVENT_LABEL[e.input.type] ?? e.input.type}{e.playerName ? ` — ${e.playerName}` : ''}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 text-[11px] font-mono" style={{ color: 'var(--color-muted)' }}>
        <MicIcon size={12} />
        <span className="truncate">{caption.length > 0 ? caption : 'Listening…'}</span>
      </div>
    </div>
  )
}

export function VoiceReviewSheet({ parsed, onApply, onClose }: {
  parsed:  ParsedNarration
  /** Returns false when the batch fails canRecord validation. */
  onApply: (events: VoiceEvent[]) => boolean
  onClose: () => void
}) {
  const [events, setEvents] = useState<VoiceEvent[]>(parsed.events)
  const [applyError, setApplyError] = useState(false)

  const removeAt = (i: number) => {
    setApplyError(false)
    setEvents(events.filter((_, idx) => idx !== i))
  }

  const apply = () => {
    if (onApply(events)) onClose()
    else setApplyError(true)
  }

  return (
    <ModalScrim
      onDismiss={onClose}
      align="bottom"
      variant="bare"
      z={30}
      panelClassName="w-full flex flex-col"
      panelStyle={{ background: 'var(--color-bg)', borderTop: '2px solid var(--color-team-a)', maxHeight: '80%' }}
    >
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <span className="flex items-center gap-2 text-xs font-mono tracking-widest" style={{ color: 'var(--color-muted)' }}>
          <MicIcon size={15} /> HEARD THIS — CONFIRM TO RECORD
        </span>
        <button onClick={onClose} className="cursor-pointer text-muted hover:text-content flex items-center" title="Discard">
          <CloseIcon size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5">
        {parsed.issues.map((issue, i) => (
          <div
            key={`issue-${i}`}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-[11px] font-mono"
            style={{ background: 'var(--color-warn-bg)', color: 'var(--color-warn)', border: '1px solid var(--color-warn)' }}
          >
            <WarnIcon size={13} /> <span className="min-w-0">{issue}</span>
          </div>
        ))}

        {events.length === 0 ? (
          <div className="text-center py-6 text-sm" style={{ color: 'var(--color-muted)' }}>
            Nothing recognisable — try again, or tap it in.
          </div>
        ) : events.map((e, i) => {
          const lowConf = e.confidence < AUTO_CONFIDENCE
          return (
            <div
              key={i}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md border"
              style={{
                background:  'var(--color-surf)',
                borderColor: lowConf ? 'var(--color-warn)' : 'var(--color-border)',
              }}
            >
              <span
                className="flex-shrink-0 w-2 h-2 rounded-full"
                style={{
                  // `undo` never reaches the visible log, so it has no vis-log
                  // colour — mark it warn-yellow here.
                  background: e.input.type === 'undo'
                    ? 'var(--color-warn)'
                    : getVisLogColor(e.input.type as Parameters<typeof getVisLogColor>[0]),
                }}
              />
              <span className="flex-1 min-w-0 text-sm text-content truncate">
                <span className="font-semibold">{EVENT_LABEL[e.input.type] ?? e.input.type}</span>
                {e.playerName && <span> — {e.playerName}</span>}
              </span>
              {lowConf && (
                <span className="flex-shrink-0 text-[10px] font-mono" style={{ color: 'var(--color-warn)' }} title="Low-confidence match">
                  ?
                </span>
              )}
              <button
                onClick={() => removeAt(i)}
                className="flex-shrink-0 cursor-pointer text-muted hover:text-content flex items-center"
                title="Remove this event"
              >
                <CloseIcon size={15} />
              </button>
            </div>
          )
        })}

        {applyError && (
          <div
            className="px-3 py-2 rounded-md text-[11px] font-mono"
            style={{ background: 'var(--color-warn-bg)', color: 'var(--color-danger)', border: '1px solid var(--color-danger)' }}
          >
            The sequence isn't recordable from the current game state — remove the broken step or cancel.
          </div>
        )}
      </div>

      <div className="flex-shrink-0 flex gap-2 p-3" style={{ borderTop: '1px solid var(--color-border)' }}>
        <Btn variant="ghost" size="md" full onClick={onClose}>Discard</Btn>
        <Btn variant="primary" size="md" full disabled={events.length === 0} onClick={apply}>
          Record {events.length} event{events.length === 1 ? '' : 's'}
        </Btn>
      </div>
    </ModalScrim>
  )
}
