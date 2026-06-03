// Optional one-way sync of session.rawLog -> API. Strict noop when
// VITE_API_BASE_URL is unset (local-only mode preserves existing behaviour).
//
// Design:
//   - Store is the source of truth. We watch session.rawLog for new entries
//     (events with id > lastSentId for that segment) and POST each to /api/events.
//   - One cursor per segment_id, persisted to localStorage. Survives reloads.
//     (Event ids restart at 1 in every segment, so the cursor must key on the
//     segment, not the game — otherwise a new segment's events would look
//     already-sent against a higher game-level cursor.)
//   - On network failure we stop, leave the cursor unchanged, retry on the
//     next store change or the periodic tick. No backoff math — failures here
//     are rare and the user has to keep tapping for new events anyway.
//   - Structural events (undo / amend / truncate / splice-block) ARE sent —
//     the dbt pipeline filters them out at stg_events. Faithful server log,
//     filtered analytics layer.

import type { GameSession, RawEvent } from './types'
import { useGameStore } from './store'

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '')
const CURSOR_KEY = 'ugt-sync-cursor'
const RETRY_INTERVAL_MS = 30_000

interface SyncCursor { [segmentId: string]: number }

function loadCursor(): SyncCursor {
  try {
    const raw = localStorage.getItem(CURSOR_KEY)
    return raw ? JSON.parse(raw) as SyncCursor : {}
  } catch {
    return {}
  }
}

function saveCursor(c: SyncCursor): void {
  try { localStorage.setItem(CURSOR_KEY, JSON.stringify(c)) }
  catch { /* quota or private-mode — best effort */ }
}

/** Strip the fields that go in their own CSV columns; everything else lands
 *  in the JSON `payload` column. Mirrors api/src/shared/csv.ts column split. */
function eventToPayload(e: RawEvent): Record<string, unknown> {
  const { id: _id, timestamp: _ts, pointIndex: _pi, type: _t, ...rest } = e as Record<string, unknown> & RawEvent
  void _id; void _ts; void _pi; void _t
  return rest
}

async function postBody(body: Record<string, unknown>): Promise<void> {
  const resp = await fetch(`${API_BASE}/api/events`, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!resp.ok) throw new Error(`POST /events -> ${resp.status}`)
}

async function postEvent(e: RawEvent, gameId: number, session: GameSession): Promise<void> {
  await postBody({
    event_id:     e.id,
    game_id:      gameId,
    segment_id:   session.segment.segmentId,
    scorer_id:    session.segment.scorerId,
    device_id:    session.segment.deviceId,
    timestamp_ms: e.timestamp,
    point_index:  e.pointIndex,
    type:         e.type,
    payload:      eventToPayload(e),
  })
}

// An anchored segment's A–B start score lives in SegmentMeta.anchor, NOT in the
// rawLog — so peers can't reconstruct it from events alone. Transmit it once as a
// synthetic wire-only row (event_id 0, type 'segment-anchor', sorting before real
// ids which start at 1). See core/serverLog.ts (the read side) + wire-protocol.md.
async function postAnchor(gameId: number, session: GameSession): Promise<void> {
  const a = session.segment.anchor
  if (!a) return
  await postBody({
    event_id:     0,
    game_id:      gameId,
    segment_id:   session.segment.segmentId,
    scorer_id:    session.segment.scorerId,
    device_id:    session.segment.deviceId,
    timestamp_ms: session.segment.createdAt,
    point_index:  a.scoreA + a.scoreB,
    type:         'segment-anchor',
    payload:      { scoreA: a.scoreA, scoreB: a.scoreB, offence: a.offence },
  })
}

let syncing = false
async function syncSession(session: GameSession): Promise<void> {
  if (syncing) return
  syncing = true
  try {
    const cursor = loadCursor()
    const gameId = session.gameConfig.id
    const { segmentId, anchor } = session.segment

    // Send the anchor once, before any events, so the menu shows the seeded
    // score immediately even before the first point is recorded. The `:anchor`
    // cursor marker keeps it idempotent across reconnects.
    const anchorKey = `${segmentId}:anchor`
    if (anchor && !cursor[anchorKey]) {
      try {
        await postAnchor(gameId, session)
      } catch (err) {
        console.warn('[sync] anchor post failed, will retry', { gameId, segmentId, err })
        return
      }
      cursor[anchorKey] = 1
      saveCursor(cursor)
    }

    const lastSent = cursor[segmentId] ?? 0
    const pending = session.rawLog.filter(e => e.id > lastSent)
    if (pending.length === 0) return
    for (const e of pending) {
      try {
        await postEvent(e, gameId, session)
      } catch (err) {
        console.warn('[sync] post failed, will retry', { eventId: e.id, gameId, segmentId, err })
        return
      }
      cursor[segmentId] = e.id
      saveCursor(cursor)
    }
  } finally {
    syncing = false
  }
}

/** Wire the store -> API one-way pipe. Idempotent — safe to call once at
 *  app boot. Noops if VITE_API_BASE_URL is unset. */
export function startSync(): void {
  if (!API_BASE) {
    console.info('[sync] disabled (VITE_API_BASE_URL unset)')
    return
  }
  console.info('[sync] enabled, base =', API_BASE)

  // Watch for rawLog changes by reference. Zustand replaces the rawLog array
  // on every append, so identity equality is enough — no deep-compare.
  let lastRawLogRef: RawEvent[] | null = useGameStore.getState().session?.rawLog ?? null
  useGameStore.subscribe(state => {
    const next = state.session?.rawLog ?? null
    if (next === lastRawLogRef) return
    lastRawLogRef = next
    if (state.session) void syncSession(state.session)
  })

  // Periodic retry for the offline case. Cheap when there's nothing to send.
  setInterval(() => {
    const session = useGameStore.getState().session
    if (session) void syncSession(session)
  }, RETRY_INTERVAL_MS)

  // Initial flush in case the persisted session has unsent events from a
  // previous run (e.g. user was offline, refreshed before sync caught up).
  const initial = useGameStore.getState().session
  if (initial) void syncSession(initial)
}
