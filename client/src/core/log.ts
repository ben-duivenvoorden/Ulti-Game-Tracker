// ─── Append-only log helpers ──────────────────────────────────────────────────
// Shared by the teams + scheduled-games logs; `engine.appendEvents` wraps the
// same stamp for the game rawLog. Events carry monotonic ids starting at 1 and
// a shared wall-clock timestamp; logs are never mutated in place.

export interface StampedEvent {
  id:        number
  timestamp: number
}

/** Stamp `inputs` with the next monotonic ids + a shared timestamp, then
 *  append. `TInput` is the event shape minus `id`/`timestamp` (the caller's
 *  distributed-Omit input union — TS can't relate that back to `TEvent`
 *  generically, hence the cast). */
export function stampAndAppend<TEvent extends StampedEvent, TInput extends object>(
  log: TEvent[],
  inputs: TInput[],
): TEvent[] {
  const startId = log.length === 0 ? 1 : log[log.length - 1].id + 1
  const ts = Date.now()
  const stamped = inputs.map((e, i) => ({ ...e, id: startId + i, timestamp: ts }) as unknown as TEvent)
  return [...log, ...stamped]
}

/** Next globally-unique entity id: one past the max id `pick` extracts across
 *  the whole log — including soft-deleted entities, since ids are never
 *  reused. `pick` returns null for events that don't allocate an id. */
export function nextIdFrom<T>(log: T[], pick: (e: T) => number | null): number {
  let max = 0
  for (const e of log) {
    const v = pick(e)
    if (v !== null && v > max) max = v
  }
  return max + 1
}
