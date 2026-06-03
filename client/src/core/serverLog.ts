// ─── Server log → high-water summary ──────────────────────────────────────────
// The read half of multi-scorer sync. The backend stays dumb (it serves CSV
// rows); ALL derivation happens here, reusing the one engine (`deriveGameState`).
//
//   GET /api/game/{id}  →  parseEventsCsv  →  rowsToSegments  →  summariseGame
//
// A game holds many segments (one per scorer/device). The game-menu score is the
// HIGH-WATER MARK: the furthest point position any segment reached, and the score
// at that point. It's a `max` reduction over the union of segments keyed on the
// game-global `point_index` — a scorer rewinding to edit the past never drags it
// down. See docs/design/wire-protocol.md and the 2026-06-03 sync decision.

import type {
  GameId, GameConfig, GameSession, RawEvent, SegmentAnchor, TeamId, Score, DeviceId,
} from './types'
import { deriveGameState } from './engine'

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '')

// ─── Parsing ──────────────────────────────────────────────────────────────────

/** One parsed row of the raw events CSV. Mirrors api/src/shared/csv.ts. */
export interface ServerRow {
  event_id:     number
  game_id:      number
  segment_id:   string
  scorer_id:    string
  device_id:    string
  timestamp_ms: number
  point_index:  number
  type:         string
  payload:      Record<string, unknown>
  /** 0-based position among data rows in the returned CSV. This IS the append
   *  order — the only cross-device-stable ordering (client clocks skew). Used
   *  for the high-water tiebreak. */
  rowIndex:     number
}

// The leading eight columns are comma-free by contract (ids are validated
// comma-free, the rest are integers / an event-type token). Only the trailing
// `payload` column holds commas, inside its quoted JSON — so split on the first
// eight commas and treat the remainder as the payload verbatim.
const LEADING_COLS = 8

function splitRow(row: string): { fields: string[]; payload: string } {
  const fields: string[] = []
  let start = 0
  for (let i = 0; i < LEADING_COLS; i++) {
    const next = row.indexOf(',', start)
    if (next === -1) { fields.push(row.slice(start)); return { fields, payload: '' } }
    fields.push(row.slice(start, next))
    start = next + 1
  }
  return { fields, payload: row.slice(start) }
}

/** Inverse of api `eventToCsvRow`'s payload column: strip the surrounding
 *  quotes and un-double the inner `""` → `"`, then JSON.parse. */
function parsePayload(raw: string): Record<string, unknown> {
  let s = raw.trim()  // also drops any trailing \r from CRLF
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1)
  s = s.replaceAll('""', '"')
  if (!s) return {}
  try {
    const parsed = JSON.parse(s)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

/** Parse the CSV body returned by `GET /api/game/{id}` into rows. The first
 *  line is always the header and is skipped. */
export function parseEventsCsv(text: string): ServerRow[] {
  const lines = text.split('\n')
  const out: ServerRow[] = []
  for (let i = 1; i < lines.length; i++) {   // skip header row
    const line = lines[i]
    if (!line || !line.trim()) continue
    const { fields, payload } = splitRow(line)
    if (fields.length < LEADING_COLS) continue
    out.push({
      event_id:     Number(fields[0]),
      game_id:      Number(fields[1]),
      segment_id:   fields[2],
      scorer_id:    fields[3],
      device_id:    fields[4],
      timestamp_ms: Number(fields[5]),
      point_index:  Number(fields[6]),
      type:         fields[7],
      payload:      parsePayload(payload),
      rowIndex:     out.length,
    })
  }
  return out
}

// ─── Rows → segments ────────────────────────────────────────────────────────────

/** One segment reconstructed from server rows: its writer identity, the anchor
 *  (lifted from the synthetic `segment-anchor` row, if any), and its events. */
export interface SegmentRows {
  segmentId:    string
  scorerId:     string
  deviceId:     string
  anchor?:      SegmentAnchor
  events:       RawEvent[]
  /** Append-order position of this segment's last row (for the tiebreak). */
  lastRowIndex: number
}

/** The synthetic anchor row is wire-only: `event_id = 0`, `type =
 *  'segment-anchor'`, never a real `RawEvent`. It carries the anchored
 *  segment's A–B start score so peers can reconstruct it (the anchor isn't in
 *  the local rawLog). */
const ANCHOR_TYPE = 'segment-anchor'

function rowToRawEvent(r: ServerRow): RawEvent {
  return { id: r.event_id, timestamp: r.timestamp_ms, pointIndex: r.point_index, type: r.type, ...r.payload } as RawEvent
}

/** Group a game's rows into segments, lifting the anchor row out of the event
 *  stream and ordering each segment's events ascending by id. */
export function rowsToSegments(rows: ServerRow[], gameId: GameId): SegmentRows[] {
  const bySeg = new Map<string, SegmentRows>()
  for (const r of rows) {
    if (r.game_id !== gameId) continue
    let seg = bySeg.get(r.segment_id)
    if (!seg) {
      seg = { segmentId: r.segment_id, scorerId: r.scorer_id, deviceId: r.device_id, events: [], lastRowIndex: r.rowIndex }
      bySeg.set(r.segment_id, seg)
    }
    if (r.rowIndex > seg.lastRowIndex) seg.lastRowIndex = r.rowIndex

    if (r.event_id === 0 && r.type === ANCHOR_TYPE) {
      const p = r.payload as { scoreA?: unknown; scoreB?: unknown; offence?: unknown }
      if (typeof p.scoreA === 'number' && typeof p.scoreB === 'number' && (p.offence === 'A' || p.offence === 'B')) {
        seg.anchor = { scoreA: p.scoreA, scoreB: p.scoreB, offence: p.offence }
      }
      continue
    }
    seg.events.push(rowToRawEvent(r))
  }
  for (const seg of bySeg.values()) seg.events.sort((a, b) => a.id - b.id)
  return [...bySeg.values()]
}

// ─── Segments → high-water summary ──────────────────────────────────────────────

export interface SegmentSummary {
  segmentId:      string
  scorerId:       string
  deviceId:       string
  score:          Score
  pointIndex:     number
  possession:     TeamId
  eventCount:     number
  lastActivityMs: number
  anchored:       boolean
}

export interface GameSummary {
  gameId:             GameId
  /** High-water score — the score at the furthest point any segment reached. */
  score:              Score
  pointIndex:         number
  /** Possession at the high-water point (who would receive next) — seeds pick-up. */
  possession:         TeamId
  /** The segment that holds the high-water (the menu's "canonical" for display). */
  canonicalSegmentId: string
  scorerId:           string
  deviceId:           string
  segmentCount:       number
  segments:           SegmentSummary[]
}

/** Derive each segment's tail state via the shared engine, then reduce to the
 *  high-water: `max(pointIndex)`, tiebreak by append order then segmentId.
 *  `config` comes from the LOCAL roster/schedule (every device has it) —
 *  `gameStartPullingTeam` isn't transmitted, but it doesn't affect the score or
 *  the possession at any non-trivial high-water, so a placeholder is fine. */
export function summariseGame(gameId: GameId, rows: ServerRow[], config: GameConfig): GameSummary | null {
  const segs = rowsToSegments(rows, gameId)
  if (segs.length === 0) return null

  const summaries = segs.map(seg => {
    const session: GameSession = {
      gameConfig:           config,
      gameStartPullingTeam: 'A',
      segment: {
        segmentId: seg.segmentId, scorerId: seg.scorerId, deviceId: seg.deviceId, createdAt: 0,
        ...(seg.anchor ? { anchor: seg.anchor } : {}),
      },
      rawLog: seg.events,
    }
    const st = deriveGameState(session)
    const lastActivityMs = seg.events.reduce((m, e) => Math.max(m, e.timestamp), 0)
    return {
      summary: {
        segmentId: seg.segmentId, scorerId: seg.scorerId, deviceId: seg.deviceId,
        score: st.score, pointIndex: st.pointIndex, possession: st.possession,
        eventCount: seg.events.length, lastActivityMs, anchored: !!seg.anchor,
      } as SegmentSummary,
      lastRowIndex: seg.lastRowIndex,
    }
  })

  // High-water: furthest point wins; ties broken by append order (the later
  // row in the blob), then deterministically by segmentId.
  const hw = summaries.reduce((best, cur) => {
    if (cur.summary.pointIndex > best.summary.pointIndex) return cur
    if (cur.summary.pointIndex === best.summary.pointIndex) {
      if (cur.lastRowIndex > best.lastRowIndex) return cur
      if (cur.lastRowIndex === best.lastRowIndex && cur.summary.segmentId > best.summary.segmentId) return cur
    }
    return best
  })

  return {
    gameId,
    score:              hw.summary.score,
    pointIndex:         hw.summary.pointIndex,
    possession:         hw.summary.possession,
    canonicalSegmentId: hw.summary.segmentId,
    scorerId:           hw.summary.scorerId,
    deviceId:           hw.summary.deviceId,
    segmentCount:       summaries.length,
    segments:           summaries.map(s => s.summary),
  }
}

// ─── Pick-up: continue vs fork ──────────────────────────────────────────────────
// When opening a game that already has server segments, decide whether to keep
// appending to THIS device's own segment or to seed a fresh one from the
// high-water. The rule (2026-06-03 sync decision §5): continue the same segment
// iff same device AND still at/ahead of the high-water (no one passed me) AND no
// edit. Otherwise fork — a new anchored segment seeded from the high-water.

export type ResumeDecision =
  /** Resume this device's existing local segment in place (same segment id). */
  | { kind: 'continue' }
  /** Start a fresh anchored segment seeded from the high-water. */
  | { kind: 'fork'; scoreA: number; scoreB: number; offence: TeamId }

export function decideResume(
  local: GameSession | null,
  summary: GameSummary,
  thisDeviceId: DeviceId,
): ResumeDecision {
  if (local && local.segment.deviceId === thisDeviceId) {
    // My own segment is still the furthest (or tied / ahead via unsynced
    // events) → continuing keeps appending to my tail.
    if (deriveGameState(local).pointIndex >= summary.pointIndex) return { kind: 'continue' }
  }
  // Different device advanced past me (or I have no local segment) → fork from
  // the high-water so the new segment carries on from the furthest point.
  return { kind: 'fork', scoreA: summary.score.A, scoreB: summary.score.B, offence: summary.possession }
}

// ─── Fetch ──────────────────────────────────────────────────────────────────────

/** Fetch + summarise one game's server-side high-water. Returns null when the
 *  API is unconfigured, the game has no rows, or the network is unavailable —
 *  callers fall back to local state. Offline-tolerant by design. */
export async function fetchGameSummary(gameId: GameId, config: GameConfig): Promise<GameSummary | null> {
  if (!API_BASE) return null
  try {
    const resp = await fetch(`${API_BASE}/api/game/${gameId}`)
    if (!resp.ok) return null
    const rows = parseEventsCsv(await resp.text())
    return summariseGame(gameId, rows, config)
  } catch {
    return null
  }
}
