// Header for the raw events CSV. Must stay in lock-step with
// dbt/models/raw/raw_events.sql.

export const CSV_HEADER = 'event_id,game_id,timestamp_ms,point_index,type,payload'

export interface IncomingEvent {
  event_id:     number
  game_id:      number
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
    e.timestamp_ms,
    e.point_index,
    e.type,
    `"${payloadJson}"`,
  ].join(',')
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
  if (typeof e.type !== 'string' || !e.type.length) {
    throw new Error('type must be a non-empty string')
  }
  if (!e.payload || typeof e.payload !== 'object') {
    throw new Error('payload must be an object')
  }
}
