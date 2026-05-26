import type { RawEvent, GameId, EventId } from './types'

// ─── Clipboard envelope ───────────────────────────────────────────────────────
// Wire format for copy/paste of a contiguous slice of the event log.
// Same-game enforced via gameId match at paste time.
//
// Source ids are decorative — they make the payload debuggable and feed the
// success banner ("from #5–#7") but never reach the destination rawLog. The
// paste action allocates fresh ids.
//
// Structural events (undo / amend / truncate / splice-block) reference ids
// that won't survive renumbering; v1 strips them at copy time.

export interface ClipboardEnvelope {
  app:         'UGT'
  v:           1
  kind:        'log-slice'
  gameId:      GameId
  fromEventId: EventId
  toEventId:   EventId
  copiedAt:    number
  events:      RawEvent[]
}

const NON_STRUCTURAL = (e: RawEvent): boolean =>
  e.type !== 'undo' && e.type !== 'amend' && e.type !== 'truncate' && e.type !== 'splice-block'

/** Build an envelope from a contiguous slice of session.rawLog. Strips any
 *  structural events that snuck into the slice. */
export function buildEnvelope(
  gameId: GameId,
  rawLogSlice: RawEvent[],
): ClipboardEnvelope {
  const events = rawLogSlice.filter(NON_STRUCTURAL)
  const fromEventId = rawLogSlice.length === 0 ? 0 : rawLogSlice[0].id
  const toEventId   = rawLogSlice.length === 0 ? 0 : rawLogSlice[rawLogSlice.length - 1].id
  return {
    app: 'UGT',
    v: 1,
    kind: 'log-slice',
    gameId,
    fromEventId,
    toEventId,
    copiedAt: Date.now(),
    events,
  }
}

export function serialize(env: ClipboardEnvelope): string {
  return JSON.stringify(env)
}

/** Reject silently on malformed JSON, missing magic fields, or wrong
 *  app/v/kind. Cross-game rejection happens later in the store action. */
export function tryParse(text: string): ClipboardEnvelope | null {
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  if (o.app !== 'UGT') return null
  if (o.v !== 1) return null
  if (o.kind !== 'log-slice') return null
  if (typeof o.gameId !== 'number') return null
  if (typeof o.fromEventId !== 'number') return null
  if (typeof o.toEventId !== 'number') return null
  if (typeof o.copiedAt !== 'number') return null
  if (!Array.isArray(o.events)) return null
  // Trust the event shapes — they came from a sibling install. Re-stamping at
  // paste time will catch anything truly bogus via the validator.
  return o as unknown as ClipboardEnvelope
}
