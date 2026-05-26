// Optional one-way sync of session.rawLog -> API. Strict noop when
// VITE_API_BASE_URL is unset (local-only mode preserves existing behaviour).
//
// Design:
//   - Store is the source of truth. We watch session.rawLog for new entries
//     (events with id > lastSentId for that game) and POST each to /api/events.
//   - One cursor per game_id, persisted to localStorage. Survives reloads.
//   - On network failure we stop, leave the cursor unchanged, retry on the
//     next store change or the periodic tick. No backoff math — failures here
//     are rare and the user has to keep tapping for new events anyway.
//   - Structural events (undo / amend / truncate / splice-block) ARE sent —
//     the dbt pipeline filters them out at stg_events. Faithful server log,
//     filtered analytics layer.

import type { GameSession, RawEvent } from './types'
import { useGameStore } from './store'

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '')
const CURSOR_KEY = 'ust-sync-cursor'
const RETRY_INTERVAL_MS = 30_000

interface SyncCursor { [gameId: number]: number }

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

async function postEvent(e: RawEvent, gameId: number): Promise<void> {
  const body = {
    event_id:     e.id,
    game_id:      gameId,
    timestamp_ms: e.timestamp,
    point_index:  e.pointIndex,
    type:         e.type,
    payload:      eventToPayload(e),
  }
  const resp = await fetch(`${API_BASE}/api/events`, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!resp.ok) throw new Error(`POST /events -> ${resp.status}`)
}

let syncing = false
async function syncSession(session: GameSession): Promise<void> {
  if (syncing) return
  syncing = true
  try {
    const cursor = loadCursor()
    const gameId = session.gameConfig.id
    const lastSent = cursor[gameId] ?? 0
    const pending = session.rawLog.filter(e => e.id > lastSent)
    if (pending.length === 0) return
    for (const e of pending) {
      try {
        await postEvent(e, gameId)
      } catch (err) {
        console.warn('[sync] post failed, will retry', { eventId: e.id, gameId, err })
        return
      }
      cursor[gameId] = e.id
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
