# Architecture
## Ultimate Stat Tracker

**Version:** 0.4 (resync — current state vs target state distinction)
**Last Updated:** 2026-05-24
**Status:** 🟡 In Progress

---

## Current state (as built)

> **No server exists.** The app is entirely client-side — React + Vite, with state persisted via Zustand's `persist` middleware to `localStorage`. The "WebSockets to a server" sections below describe the **target** architecture; today's implementation is single-device, single-recorder.

### Three append-only event logs

State on the client is structured as three independent append-only event logs, each with a paired derivation function that produces the current derived state:

| Log | Type | Derivation | Stored at |
|---|---|---|---|
| `rawLog` | `RawEvent[]` | `deriveGameState(session)` + `computeVisLog(rawLog)` | Inside `session: GameSession` |
| `teamsLog` | `TeamEvent[]` | `deriveTeamsState(teamsLog)` | Top-level on the store |
| `scheduledGamesLog` | `ScheduledGameEvent[]` | `deriveScheduledGamesState(log)` | Top-level on the store |

Each log is **append-only** — no mutation, no deletion. Edits to derived state happen by appending new events (`undo`, `amend`, `truncate`, `splice-block` on `rawLog`; `team-edit`, `team-archive`, `player-remove` etc. on `teamsLog`; analogous on `scheduledGamesLog`).

### Persistence

- All three logs persist to `localStorage` via Zustand's `persist` middleware.
- Versioned migrations (currently `v10`); pre-`v5` sessions are dropped on upgrade.
- A defensive `merge` hook falls back to the seeded `INITIAL_SEED` if `localStorage` returns malformed or empty payloads.
- Per-device UI preferences (`swapSides`, `pillSize`, `screen`, `uiMode`, `selPuller`, `recordingOptions`) are also persisted but are not part of any of the event logs.

### Single-recorder model

- One game session is active at a time (`session: GameSession | null`).
- The recorder is the sole writer. There's no concept of identity, auth, or multi-user yet.
- Resume vs fresh-start is determined by whether `localStorage` holds a session matching the picked game id.

### UST clipboard envelope

Copy / paste between games (or simply between points in the same game) uses a JSON envelope serialised to the system clipboard:

```ts
interface USTEnvelope {
  gameId: GameId
  fromEventId: EventId
  toEventId: EventId
  events: RawEvent[]   // structural events stripped at envelope-build
}
```

The envelope is the de facto sync unit even in the absence of a server — the recorder can hand off a slice of work between devices by copy-paste. Validation rules match the server-bound `splice-block` validation (see [validation-rules.md](validation-rules.md#splice-block-validation)).

### Game roster mutations *(planned)*

The current model resolves `GameConfig.rosters` from `teamsLog` at session creation. The planned game-roster feature (per [league scoping L9c](../feedback/2026-05-24-league-layer-scoping.md)) adds scorer-mutable per-game roster events on `rawLog` (`game-roster-add-player` / `-remove-player` / `-edit-player`), keeping the durable team roster untouched.

---

## Target state — server-backed sync

When a server lands, the existing client-side model slots in naturally because the rawLog shape is already designed for it. The client doesn't change to a server-backed architecture; it gains a sync partner.

### Protocol Decision

**WebSockets for transport. The client stays offline-first.**

Every interaction — setup, roster loading, live events, amendments, export — is a WebSocket message. One protocol, one connection, consistent pattern throughout. The client does not block on connectivity: events are written to the local rawLog (and the local outbound queue) and flushed over the WebSocket whenever a connection is available.

```
┌─────────────────────┐                        ┌──────────────────────┐
│  Client (offline-   │  WebSocket (all comms) │  Server              │
│  first)             │  ←──────────────────→  │  - Roster store      │
│                     │                        │  - Event log         │
│  - Three logs       │                        │  - Game state derive │
│  - Outbound queue   │                        │  - Export            │
│  - Per-device UI    │                        │                      │
└─────────────────────┘                        └──────────────────────┘
```

### WebSocket message types *(target)*

See [wire-protocol.md](../design/wire-protocol.md) for the locked contract. Summary:

| Direction | Message | Description |
|---|---|---|
| Client → Server | `JOIN_GAME` | Connect to a game session by id |
| Server → Client | `RosterManifestMessage` | Game config + rosters snapshot |
| Bi-directional | `EventStreamMessage` | Range of events, cursor-based |
| Client → Server | `REQUEST_EXPORT` | Request final stats export |
| Server → Client | `EXPORT_DATA` | Final per-player stats payload |

### Offline & queueing

- **Local queue:** Every recordable event (anything on `rawLog`) is written to the local rawLog (and queued for transmit) before any network attempt. The UI reflects local state immediately.
- **Background flush:** When the WebSocket is connected, queued entries are sent in insertion order and removed from the queue on server ack. While disconnected, the queue accumulates.
- **Reconnect:** On reconnect, the client sends its current `logCursor(rawLog)` as `fromEventId` and the server replies with everything past that. Then the client flushes its own pending tail.
- **Fully offline mode:** The recorder can deliberately complete an entire game offline. The full session is uploaded on next connection and marked as an "offline-recorded" session.
- **Conflict handling:** Append-only semantics make ingestion itself conflict-free per session. Cross-scorer conflicts are resolved post-ingestion (per [Myall #13](../feedback/2026-05-24-myall-responses.md)) — admin-visible, never silently auto-resolved.

### Session model *(target)*

- One persistent game session per game, identified by a game id.
- Any recorder can connect or reconnect at any time using the game id (subject to access rules — see Auth).
- On `JOIN_GAME`, the server sends the full current `RosterManifestMessage` + `EventStreamMessage` to the new client.
- All clients receive all subsequent events in real time as `EventStreamMessage`s.
- One active editor at a time; viewer connections are read-only (per F6 in features.md).

### Authentication

Deferred — design TBA. Leading direction: QR-based Competition access with email-verify + admin-approval (per A3). Once Competition + role system lands, scorer / viewer / admin identity hangs off there.

---

## Competition layer *(planned)*

Adds a **fourth append-only event log** (`competitionsLog`) above the existing three, with events like `competition-add`, `competition-edit`, `competition-archive`, `competition-add-team`, `competition-remove-team`, `competition-update-setting`, plus role-grant events (`competition-add-admin` / `-add-scorer` / `-remove-*`).

`teamsLog` and `scheduledGamesLog` become Competition-scoped (either nested under a Competition or carrying a `competitionId` discriminator) — see [league scoping L8](../feedback/2026-05-24-league-layer-scoping.md). Concrete shape decided in the implementation pass.

---

## Open Questions

- [x] ~~How is multi-user write conflict handled? (two recorders submit simultaneously)~~ Deferred until multi-scorer is actually built. Principle locked: every submission goes into the rawLog; auto-resolution applies post-ingestion; conflicts remain admin-visible. First-write-wins with sequence numbers is the leading candidate for the auto layer. See [Myall #13](../feedback/2026-05-24-myall-responses.md).
- [~] What is the authentication/access model for joining a game session? **Deferred — design TBA.** Likely direction: QR-based access (open join, or email-verify + admin approval). Per-event emailed passwords ruled out as too heavy. See A3.
- [ ] Server technology — Node, Python, Go — TBD.
- [ ] Competition-scoped logs — separate `teamsLog` per Competition, or one global log with `competitionId` on each event? See [league scoping L8](../feedback/2026-05-24-league-layer-scoping.md).
