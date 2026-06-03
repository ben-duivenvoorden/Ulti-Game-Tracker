// ─── Wire format ──────────────────────────────────────────────────────────────
// What flows over the network when sessions sync between scorers / server.
// Companion doc: docs/design/wire-protocol.md
//
// Two message kinds:
//   1. RosterManifestMessage — the static-ish lookup table (sent once per session
//      at hand-off, references player names / portraits by surrogate id).
//   2. EventStreamMessage — the append-only rawLog itself, transmitted as a
//      contiguous slice from a cursor onwards.
//
// The recipient applies (manifest + events) to reconstruct the same in-memory
// session. Because rawLog is append-only and event ids are monotonic, sync is
// just "send me everything since N".

import type { GameId, GameConfig, Player, RawEvent, EventId, TeamId, GameSession, ScorerId, DeviceId } from './types'
import { appendEvents, type RawEventInput } from './engine'
import { newSegmentId, newScorerId, newDeviceId } from './ids'

// ─── Messages ─────────────────────────────────────────────────────────────────

/** Sent once when a peer joins / resyncs. The manifest is stable for the
 *  lifetime of the game session — there is no "roster-update" message in v1. */
export interface RosterManifestMessage {
  kind: 'roster-manifest'
  gameId: GameId
  manifest: SessionManifest
}

/** A contiguous slice of the rawLog. `events` are ordered ascending by `id`,
 *  and `events[0].id === fromEventId + 1`. Recipients append in order. */
export interface EventStreamMessage {
  kind: 'events'
  gameId: GameId
  fromEventId: EventId   // exclusive cursor (0 means "from the start")
  events: RawEvent[]
}

export type WireMessage = RosterManifestMessage | EventStreamMessage

/** Self-contained roster + game-config payload. Everything a peer needs to
 *  resolve player ids, format the visible log, and run the engine. */
export interface SessionManifest {
  gameConfig: GameConfig
  gameStartPullingTeam: TeamId
  rosters: Record<TeamId, Player[]>
}

// ─── Serialisation ────────────────────────────────────────────────────────────

/** Build the manifest message a peer needs before it can apply events. */
export function serializeManifest(
  gameId: GameId,
  gameConfig: GameConfig,
  gameStartPullingTeam: TeamId,
): RosterManifestMessage {
  return {
    kind: 'roster-manifest',
    gameId,
    manifest: {
      gameConfig,
      gameStartPullingTeam,
      rosters: gameConfig.rosters,
    },
  }
}

/** Build an event-stream message starting just after `fromEventId`. */
export function serializeEvents(
  gameId: GameId,
  rawLog: RawEvent[],
  fromEventId: EventId = 0,
): EventStreamMessage {
  return {
    kind: 'events',
    gameId,
    fromEventId,
    events: rawLog.filter(e => e.id > fromEventId),
  }
}

// ─── Application (replay) ─────────────────────────────────────────────────────

/** Reconstruct a starting session from a manifest message. The session has an
 *  empty rawLog; pair this with `applyEventStream` to fast-forward. A peer
 *  applying a manifest opens its *own* segment — pass the local `scorerId` /
 *  `deviceId` so the recording is attributed to this device (fresh ones are
 *  minted if the caller has none yet). */
export function sessionFromManifest(
  msg: RosterManifestMessage,
  scorerId: ScorerId = newScorerId(),
  deviceId: DeviceId = newDeviceId(),
): GameSession {
  return {
    gameConfig: msg.manifest.gameConfig,
    gameStartPullingTeam: msg.manifest.gameStartPullingTeam,
    segment: { segmentId: newSegmentId(), scorerId, deviceId, createdAt: Date.now() },
    rawLog: [],
  }
}

/** Idempotent event application. Drops any event whose id is ≤ the recipient's
 *  current head — useful when a re-broadcast overlaps with what we already have. */
export function applyEventStream(session: GameSession, events: RawEvent[]): GameSession {
  if (events.length === 0) return session
  const headId = session.rawLog.length === 0 ? 0 : session.rawLog[session.rawLog.length - 1].id
  const fresh = events.filter(e => e.id > headId)
  if (fresh.length === 0) return session
  // Strip id/timestamp so appendEvents re-stamps them in our local sequence.
  // (Server-authoritative deployments can swap this for a verbatim merge.)
  const inputs: RawEventInput[] = fresh.map(({ id: _id, timestamp: _ts, ...rest }) => rest as RawEventInput)
  return appendEvents(session, inputs)
}

// ─── Cursors ──────────────────────────────────────────────────────────────────

/** Where the recipient is up to — used as `fromEventId` in the next pull. */
export function logCursor(rawLog: RawEvent[]): EventId {
  return rawLog.length === 0 ? 0 : rawLog[rawLog.length - 1].id
}
