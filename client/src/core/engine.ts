import type {
  RawEvent,
  RawEventType,
  VisLogEntry,
  GameSession,
  DerivedGameState,
  PlayerId,
  Player,
  AmendRawEvent,
  SpliceBlockRawEvent,
} from './types'
import { otherTeam } from './types'

// ─── Append-only event log ────────────────────────────────────────────────────
// The rawLog is *only* appended to. EventIds are monotonic per game, assigned
// here when events are stamped onto the log. Callers pass the bare event shape
// (everything but `id` and `timestamp`); we attach those.

/** Bare event input — `id` and `timestamp` are stamped on by `appendEvents`.
 *  The `T extends T` distributes over the union so each member retains its
 *  discriminating `type` field rather than collapsing into a single object. */
export type RawEventInput = RawEvent extends infer T ? (T extends RawEvent ? Omit<T, 'id' | 'timestamp'> : never) : never

export function nextEventId(session: GameSession): number {
  if (session.rawLog.length === 0) return 1
  return session.rawLog[session.rawLog.length - 1].id + 1
}

// ─── Raw-log resolution ───────────────────────────────────────────────────────
// One walker, two consumers: the visible event log and game-state derivation.
// Both produce the same output; the two named exports below preserve intent
// at call sites.

export type Resolved = Exclude<RawEvent, StructuralOnly>

function resolveRawLog(rawLog: RawEvent[]): Resolved[] {
  const out: Resolved[] = []
  for (const event of rawLog) {
    if (event.type === 'undo')         { popLastVisible(out); continue }
    if (event.type === 'amend')        { applyAmend(out, event); continue }
    if (event.type === 'truncate')     { dropAfter(out, event.truncateAfterId); continue }
    if (event.type === 'splice-block') { applySplice(out, event); continue }
    out.push(event)
  }
  return out
}

// One splice call covers insert / replace / delete. Removal is by id-range
// so the operation is identical regardless of inner-event composition.
function applySplice(entries: Resolved[], event: SpliceBlockRawEvent): void {
  const idx = entries.findIndex(e => e.id === event.afterEventId)
  if (idx === -1) return
  let removeCount = 0
  if (event.removeFromId !== null && event.removeToId !== null) {
    const lo = event.removeFromId
    const hi = event.removeToId
    while (idx + 1 + removeCount < entries.length) {
      const candidate = entries[idx + 1 + removeCount]
      if (candidate.id < lo) break  // shouldn't happen — anchor precedes range
      if (candidate.id > hi) break
      removeCount++
    }
  }
  // Strip structural events from the inner payload — they don't belong in
  // the resolved log directly.
  const inner = event.events.filter((e): e is Resolved =>
    e.type !== 'undo' && e.type !== 'amend' && e.type !== 'truncate'
    && e.type !== 'splice-block')
  entries.splice(idx + 1, removeCount, ...inner)
}

// Undoing structural events would corrupt phase tracking, so they're skipped:
// point-start / half-time / end-game / system anchor the timeline.
function popLastVisible(entries: Resolved[]): void {
  for (let i = entries.length - 1; i >= 0; i--) {
    const t = entries[i].type
    if (t !== 'system' && t !== 'point-start' && t !== 'half-time' && t !== 'end-game') {
      entries.splice(i, 1)
      return
    }
  }
}

function applyAmend(entries: Resolved[], event: AmendRawEvent): void {
  const idx = entries.findIndex(e => e.id === event.targetEventId)
  if (idx === -1) return
  if (event.replacement === null) {
    entries.splice(idx, 1)
    return
  }
  const r = event.replacement
  if (r.type !== 'undo' && r.type !== 'amend' && r.type !== 'truncate' && r.type !== 'splice-block') {
    entries[idx] = r
  }
}

// Drop everything past the cursor. Walk from the end so the loop short-circuits
// the moment it hits an entry that survives.
function dropAfter(entries: Resolved[], truncateAfterId: number): void {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].id > truncateAfterId) entries.splice(i, 1)
    else break
  }
}

// ─── Visual log derivation ────────────────────────────────────────────────────

export function computeVisLog(rawLog: RawEvent[]): VisLogEntry[] {
  return resolveRawLog(rawLog) as VisLogEntry[]
}

// ─── Display orientation derivation ──────────────────────────────────────────
// `endsSwapped` controls header chip order, grid column order, and line-tab
// order. It's derived from a manual baseline (set by the scorer's swap
// button) plus the visible log:
//
//   - Each `goal` flips orientation once (teams switch ends every point).
//   - Each `half-time` adds one extra flip when the goal count BEFORE that
//     half-time event is even — second-half ends are the opposite of the
//     game-start ends, so when N is even we're back at start and need to
//     flip; when N is odd we're already at NOT(start) so no extra flip.
//
// Deriving from the log gives us undo-for-free: pop the goal, the count
// drops, orientation recomputes.
export function deriveEndsSwapped(baseline: boolean, visLog: VisLogEntry[]): boolean {
  let swapped = baseline
  let goalsSoFar = 0
  for (const e of visLog) {
    if (e.type === 'goal') {
      swapped = !swapped
      goalsSoFar++
    } else if (e.type === 'half-time') {
      if (goalsSoFar % 2 === 0) swapped = !swapped
    }
  }
  return swapped
}

// ─── Derived game state ───────────────────────────────────────────────────────
// Pure function: walks the rawLog (after undo/amend resolution) and computes
// everything. This is the ONLY place game state is computed. The store holds
// rawLog + UI; everything else flows from here.

/** Resolve a list of player-ids to Player records via the team roster. Unknown
 *  ids drop out — useful if a manifest is mid-edit. Tolerates `undefined`
 *  inputs (e.g. from a stale persisted event predating the field). */
function resolveLine(ids: PlayerId[] | undefined, roster: Player[]): Player[] {
  if (!ids || !Array.isArray(ids)) return []
  const byId = new Map(roster.map(p => [p.id, p]))
  const out: Player[] = []
  for (const id of ids) {
    const p = byId.get(id)
    if (p) out.push(p)
  }
  return out
}

/** Seed the fold's starting state. An *anchored* segment (one started mid-game
 *  from a known score) begins at its anchor: the recorded score, the offence
 *  team in possession to receive, and a `pointIndex` equal to the points already
 *  played. A from-the-start segment begins at 0–0 with the receiving team on
 *  offence. `hasEvents` only governs the transient initial phase, which the
 *  first stepped event overwrites. Shared by `deriveGameState` and
 *  `validateSpliceBlock` so both fold from the same origin. */
function initialState(session: GameSession, hasEvents: boolean): DerivedGameState {
  const anchor  = session.segment.anchor
  const offence = anchor ? anchor.offence : otherTeam(session.gameStartPullingTeam)
  return {
    gamePhase:  hasEvents ? 'awaiting-pull' : 'pre-game',
    score:      anchor ? { A: anchor.scoreA, B: anchor.scoreB } : { A: 0, B: 0 },
    possession: offence,
    attackLeft: offence,
    discHolder: null,
    pointIndex: anchor ? anchor.scoreA + anchor.scoreB : 0,
    activeLine: { A: [], B: [] },
  }
}

export function deriveGameState(session: GameSession): DerivedGameState {
  const events = resolveLogForDerivation(session.rawLog)
  const state = initialState(session, events.length > 0)

  for (const event of events) step(state, event, session)

  return state
}

// Single source of truth for state transitions on a resolved event. Used by
// deriveGameState's inner walk and by validateSpliceBlock to fold the spliced
// events into a prefix state.
function step(state: DerivedGameState, event: Resolved, session: GameSession): void {
  switch (event.type) {
    case 'point-start':
      state.gamePhase = 'awaiting-pull'
      state.discHolder = null
      state.activeLine = {
        A: resolveLine(event.lineA, session.gameConfig.rosters.A),
        B: resolveLine(event.lineB, session.gameConfig.rosters.B),
      }
      break

    case 'pull':
    case 'pull-bonus':
    case 'brick':
      state.gamePhase = 'in-play'
      state.discHolder = null
      // possession is already the receiving team — none of these change it.
      // (A brick goes out of bounds; the receiving team takes possession at
      // the brick mark, so the receiving-team assignment from point-start
      // still stands.)
      break

    case 'possession':
      state.discHolder = event.playerId
      state.possession = event.teamId
      break

    case 'turnover-throw-away':
    case 'turnover-receiver-error':
    case 'turnover-stall':
    case 'turnover-unknown':
      state.possession = otherTeam(state.possession)
      state.discHolder = null
      break

    case 'block':
      // Disc is knocked down, not caught — the defending team gets
      // possession but there's no holder yet. The next event is a
      // `possession` recording whoever picks up the dead disc.
      state.possession = event.teamId
      state.discHolder = null
      break

    case 'intercept':
      // Defender catches the disc cleanly — they're the new holder
      // immediately, no follow-up possession event needed.
      state.possession = event.teamId
      state.discHolder = event.playerId
      break

    case 'goal':
      state.score = { ...state.score, [event.teamId]: state.score[event.teamId] + 1 }
      state.pointIndex++
      state.gamePhase = 'point-over'
      state.discHolder = null
      state.possession = otherTeam(event.teamId)
      state.attackLeft = otherTeam(event.teamId)
      break

    case 'injury-sub':
      state.activeLine = {
        ...state.activeLine,
        [event.teamId]: resolveLine(event.line, session.gameConfig.rosters[event.teamId]),
      }
      break

    case 'half-time':
      state.gamePhase = 'half-time'
      state.possession = session.gameStartPullingTeam
      state.attackLeft = session.gameStartPullingTeam
      break

    case 'end-game':
      state.gamePhase = 'game-over'
      break

    case 'score-resume':
      // Resync after missed points. Set the score, derive pointIndex from the
      // total, and hand the disc to the offence team (so they receive — the
      // other team pulls the resumed point). Land in 'point-over' so the next
      // step is line selection, exactly like the window after a goal.
      state.score      = { A: event.scoreA, B: event.scoreB }
      state.pointIndex = event.scoreA + event.scoreB
      state.gamePhase  = 'point-over'
      state.discHolder = null
      state.possession = event.offenceTeam
      state.attackLeft = event.offenceTeam
      break

    case 'foul':
    case 'pick':
    case 'timeout':
    case 'system':
      // Stoppages and metadata — no state change.
      break
  }
}

/** Alias for `computeVisLog` shape — kept as a separate export so callers
 *  that want to express "I'm walking the resolved log for state derivation"
 *  can read clearly at the call site, even though the two paths produce
 *  identical output today. */
export function resolveLogForDerivation(rawLog: RawEvent[]): Resolved[] {
  return resolveRawLog(rawLog)
}

type StructuralOnly = Extract<RawEvent, { type: 'undo' | 'amend' | 'truncate' | 'splice-block' }>

// ─── Game status (also derived) ───────────────────────────────────────────────
// status is purely a function of the rawLog — there is no static "this game is
// in-progress" flag on GameConfig. A game is in-progress if any event has been
// recorded; complete once an end-game event lands.

export function deriveGameStatus(session: GameSession | null | undefined): import('./types').GameStatus {
  if (!session || session.rawLog.length === 0) return 'scheduled'
  if (session.rawLog.some(e => e.type === 'end-game')) return 'complete'
  return 'in-progress'
}

// ─── Validation ───────────────────────────────────────────────────────────────
// Single source of truth for "is this event allowed right now".
// UI uses this to enable/disable controls; amend logic uses it to reject invalid
// resulting sequences.

export function canRecord(state: DerivedGameState, eventType: RawEventType): boolean {
  switch (eventType) {
    case 'point-start':
      return state.gamePhase === 'pre-game'
          || state.gamePhase === 'point-over'
          || state.gamePhase === 'half-time'

    case 'pull':
    case 'pull-bonus':
    case 'brick':
      return state.gamePhase === 'awaiting-pull'

    case 'possession':
      return state.gamePhase === 'in-play'

    case 'turnover-throw-away':
    case 'turnover-receiver-error':
    case 'turnover-stall':
    case 'goal':
      return state.gamePhase === 'in-play' && state.discHolder !== null

    case 'turnover-unknown':
      // No holder requirement — the whole point is to mark a turnover when we
      // couldn't track who had the disc. Allowed any time the disc is live.
      return state.gamePhase === 'in-play'

    case 'block':
    case 'intercept':
      return state.gamePhase === 'in-play'

    case 'injury-sub':
      return state.gamePhase === 'in-play' || state.gamePhase === 'awaiting-pull'

    case 'half-time':
      // Allowed any time the game is still live — including the brief
      // `point-over` window between a goal and the next line-confirm
      // (the confirmation prompt fires here when the threshold is met).
      return state.gamePhase === 'in-play'
          || state.gamePhase === 'awaiting-pull'
          || state.gamePhase === 'point-over'

    case 'end-game':
      // End-game is permitted from any active phase (including half-time,
      // since a forfeit or time-limited end can happen between halves).
      return state.gamePhase === 'in-play'
          || state.gamePhase === 'awaiting-pull'
          || state.gamePhase === 'point-over'
          || state.gamePhase === 'half-time'

    case 'score-resume':
      // Resync is a between-points correction — allowed before the first pull
      // and in the windows where a new point would otherwise be selected.
      return state.gamePhase === 'pre-game'
          || state.gamePhase === 'point-over'
          || state.gamePhase === 'half-time'
          || state.gamePhase === 'awaiting-pull'

    case 'foul':
    case 'pick':
    case 'timeout':
      return state.gamePhase === 'in-play' || state.gamePhase === 'awaiting-pull'

    case 'system':
    case 'undo':
    case 'amend':
    case 'truncate':
    case 'splice-block':
      return true
  }
}

// ─── Splice validation ────────────────────────────────────────────────────────
// A splice is valid iff:
//   1. Each inner event is a legal continuation of the prefix state at
//      afterEventId, walked sequentially through canRecord + step.
//   2. When trailing entries remain (events past the splice in the resolved
//      log, after dropping `removeCount`), the first such entry is itself a
//      legal continuation of the post-splice state, with possession-coherent
//      identities (puller is on the other team; possession-event team matches
//      possession; turnovers require a holder).

export type SpliceValidation = { ok: true } | { ok: false; reason: string }

export function validateSpliceBlock(session: GameSession, splice: SpliceBlockRawEvent): SpliceValidation {
  const resolved = resolveLogForDerivation(session.rawLog)
  const idx = resolved.findIndex(e => e.id === splice.afterEventId)
  if (idx === -1) return { ok: false, reason: `Anchor event #${splice.afterEventId} not found` }
  let removeCount = 0
  if (splice.removeFromId !== null && splice.removeToId !== null) {
    const lo = splice.removeFromId
    const hi = splice.removeToId
    if (lo > hi) return { ok: false, reason: 'removeFromId must be ≤ removeToId' }
    while (idx + 1 + removeCount < resolved.length) {
      const candidate = resolved[idx + 1 + removeCount]
      if (candidate.id < lo) break
      if (candidate.id > hi) break
      removeCount++
    }
  }

  // 1. Prefix state — fold everything up through and including afterEventId.
  const state = initialState(session, resolved.length > 0)
  for (let i = 0; i <= idx; i++) step(state, resolved[i], session)

  // 2. Inner walk — each event must be a legal continuation.
  for (let i = 0; i < splice.events.length; i++) {
    const e = splice.events[i]
    if (e.type === 'undo' || e.type === 'amend' || e.type === 'truncate' || e.type === 'splice-block') {
      return { ok: false, reason: `Pasted #${i + 1}: structural events are not allowed in a splice` }
    }
    if (!canRecord(state, e.type)) {
      return { ok: false, reason: `Pasted #${i + 1}: cannot record ${e.type} in phase ${state.gamePhase}` }
    }
    // Identity coherence on the pasted event itself.
    if (e.type === 'pull' || e.type === 'pull-bonus' || e.type === 'brick') {
      if (e.teamId !== otherTeam(state.possession)) {
        return { ok: false, reason: `Pasted #${i + 1}: pulling team mismatch — expected ${otherTeam(state.possession)}, got ${e.teamId}` }
      }
    } else if (e.type === 'possession') {
      if (e.teamId !== state.possession) {
        return { ok: false, reason: `Pasted #${i + 1}: possession team mismatch — expected ${state.possession}, got ${e.teamId}` }
      }
    } else if (e.type === 'turnover-throw-away' || e.type === 'turnover-receiver-error' || e.type === 'turnover-stall' || e.type === 'goal') {
      if (state.discHolder === null) {
        return { ok: false, reason: `Pasted #${i + 1}: ${e.type} requires a disc holder` }
      }
    }
    step(state, e as Resolved, session)
  }

  // 3. Trailing edge — first resolved entry beyond the removed slice (if any).
  const tail = resolved[idx + 1 + removeCount]
  if (!tail) return { ok: true }
  if (!canRecord(state, tail.type)) {
    return { ok: false, reason: `Trailing #${tail.id}: cannot continue with ${tail.type} in phase ${state.gamePhase}` }
  }
  if (tail.type === 'pull' || tail.type === 'pull-bonus' || tail.type === 'brick') {
    if (tail.teamId !== otherTeam(state.possession)) {
      return { ok: false, reason: `Trailing pull at #${tail.id}: pulling team mismatch — expected ${otherTeam(state.possession)}, got ${tail.teamId}` }
    }
  } else if (tail.type === 'possession') {
    if (tail.teamId !== state.possession) {
      return { ok: false, reason: `Trailing #${tail.id}: possession team mismatch — expected ${state.possession}, got ${tail.teamId}` }
    }
  } else if (tail.type === 'turnover-throw-away' || tail.type === 'turnover-receiver-error' || tail.type === 'turnover-stall' || tail.type === 'goal') {
    if (state.discHolder === null) {
      return { ok: false, reason: `Trailing #${tail.id}: ${tail.type} requires a disc holder` }
    }
  }
  return { ok: true }
}

// ─── Append helpers ───────────────────────────────────────────────────────────

/** Append-only writer. Stamps each input event with the next monotonic id and a
    shared timestamp, then appends to the rawLog. The only mutation path. */
export function appendEvents(session: GameSession, events: RawEventInput[]): GameSession {
  const startId = nextEventId(session)
  const ts = Date.now()
  const stamped: RawEvent[] = events.map((e, i) => ({ ...e, id: startId + i, timestamp: ts } as RawEvent))
  return { ...session, rawLog: [...session.rawLog, ...stamped] }
}
