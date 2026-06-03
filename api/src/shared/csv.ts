// Header for the raw events CSV. Must stay in lock-step with
// dbt/models/raw/raw_events.sql in the Parity-League-2026 repo
// (the data pipeline that consumes this CSV).

// `segment_id` / `scorer_id` / `device_id` sit right after `game_id`: event_id is
// only unique *within* a segment (every segment's log restarts at 1), so the real
// row key is (game_id, segment_id, event_id). The writer key is (scorer_id,
// device_id) — one login on two devices is two independent segments. All three are
// opaque comma-free tokens, so they keep the comma-free prefix `fieldAt` relies on.
export const CSV_HEADER = 'event_id,game_id,segment_id,scorer_id,device_id,timestamp_ms,point_index,type,payload'

export interface IncomingEvent {
  event_id:     number
  game_id:      number
  /** One scorer's recording of the game. Event ids are unique only per segment. */
  segment_id:   string
  /** Scorer (human / login) identity that owns the segment. */
  scorer_id:    string
  /** Device that produced the segment. Part of the writer key alongside scorer_id. */
  device_id:    string
  timestamp_ms: number
  point_index:  number
  type:         string
  /** Per-type fields. Serialised as a JSON string in the CSV. */
  payload:      Record<string, unknown>
}

/** Serialises one event to a CSV row. Quotes the JSON payload defensively. */
export function eventToCsvRow(e: IncomingEvent): string {
  const payloadJson = JSON.stringify(e.payload).replaceAll('"', '""')
  return [
    e.event_id,
    e.game_id,
    e.segment_id,
    e.scorer_id,
    e.device_id,
    e.timestamp_ms,
    e.point_index,
    e.type,
    `"${payloadJson}"`,
  ].join(',')
}

/** Extract a single field by 0-based column index from a raw CSV row.
 *  Assumes the requested field — and every field before it — contains no
 *  commas. Safe for the integer-only `event_id,game_id,timestamp_ms,
 *  point_index,type` prefix; NOT safe for the trailing quoted JSON payload. */
export function fieldAt(row: string, colIndex: number): string {
  let start = 0
  for (let i = 0; i < colIndex; i++) {
    const next = row.indexOf(',', start)
    if (next === -1) return ''
    start = next + 1
  }
  const end = row.indexOf(',', start)
  return end === -1 ? row.slice(start) : row.slice(start, end)
}

/** Shallow shape check — server-side defensive validation. The real schema
 *  contract lives in client/src/core/types.ts (RawEvent). */
export function validateIncoming(input: unknown): asserts input is IncomingEvent {
  if (!input || typeof input !== 'object') throw new Error('event must be an object')
  const e = input as Record<string, unknown>
  for (const field of ['event_id', 'game_id', 'timestamp_ms', 'point_index'] as const) {
    if (typeof e[field] !== 'number' || !Number.isInteger(e[field])) {
      throw new Error(`${field} must be an integer`)
    }
  }
  for (const field of ['segment_id', 'scorer_id', 'device_id'] as const) {
    if (typeof e[field] !== 'string' || !(e[field] as string).length) {
      throw new Error(`${field} must be a non-empty string`)
    }
    if ((e[field] as string).includes(',')) {
      throw new Error(`${field} must not contain commas`)
    }
  }
  if (typeof e.type !== 'string' || !e.type.length) {
    throw new Error('type must be a non-empty string')
  }
  if (!e.payload || typeof e.payload !== 'object') {
    throw new Error('payload must be an object')
  }
}
