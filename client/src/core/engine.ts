import type {
  RawEvent,
  RawEventType,
  VisLogEntry,
  GameSession,
  DerivedGameState,
  EventId,
  PlayerId,
  Player,
} from './types'
import { otherTeam } from './types'
import { stampAndAppend } from './log'

// ─── Append-only event log ────────────────────────────────────────────────────
// The rawLog is *only* appended to. EventIds are monotonic per game, assigned
// here when events are stamped onto the log. Callers pass the bare event shape
// (everything but `id` and `timestamp`); we attach those.

/** Bare event input — `id` and `timestamp` are stamped on by `appendEvents`.
 *  The `T extends T` distributes over the union so each member retains its
 *  discriminating `type` field rather than collapsing into a single object. */
export type RawEventInput = RawEvent extends infer T ? (T extends RawEvent ? Omit<T, 'id' | 'timestamp'> : never) : never

// ─── Raw-log resolution ───────────────────────────────────────────────────────
// One walker, two consumers: the visible event log (`computeVisLog`) and
// game-state derivation (`deriveGameState`). Both fold the same resolved list.

export type Resolved = Exclude<RawEvent, StructuralOnly>

function resolveRawLog(rawLog: RawEvent[]): Resolved[] {
  const out: Resolved[] = []
  for (const event of rawLog) {
    if (event.type === 'undo')     { popLastVisible(out); continue }
    if (event.type === 'truncate') { dropAfter(out, event.truncateAfterId); continue }
    out.push(event)
  }
  return out
}

// Undoing structural events would corrupt phase tracking, so they're skipped:
// point-start / half-time / end-game anchor the timeline.
function popLastVisible(entries: Resolved[]): void {
  for (let i = entries.length - 1; i >= 0; i--) {
    const t = entries[i].type
    if (t !== 'point-start' && t !== 'half-time' && t !== 'end-game') {
      entries.splice(i, 1)
      return
    }
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

// ─── ABBA gender-ratio prescription (WFDF Ratio Rule A) ──────────────────────
// Mixed division: after the opening flip, a second flip decides the gender
// ratio for point 1 (ratio A). The prescription then alternates every two
// points — A B B A A B B A … — and half-time does NOT reset the pattern.
// `pointIndex` (total goals so far) is the 0-based index of the point about
// to be played, so the sequence is a pure function of it.

/** True when the given point plays ratio A (the point-1 ratio):
 *  points 0, 3, 4, 7, 8, … */
export const isAPoint = (pointIndex: number): boolean =>
  (((pointIndex + 1) >> 1) & 1) === 0

/** Effective MMP/FMP target for a point under ABBA. `majority` is the
 *  matching division holding the majority on the A (point-1) ratio; the
 *  magnitudes come from `lineRatio` (e.g. 4/3) regardless of which division
 *  they were configured against. */
export function ratioForPoint(
  pointIndex: number,
  majority: 'M' | 'F',
  lineRatio: { M: number; F: number },
): { M: number; F: number } {
  const hi = Math.max(lineRatio.M, lineRatio.F)
  const lo = Math.min(lineRatio.M, lineRatio.F)
  const maj = isAPoint(pointIndex) ? majority : (majority === 'M' ? 'F' : 'M')
  return maj === 'M' ? { M: hi, F: lo } : { M: lo, F: hi }
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
 *  first stepped event overwrites. */
function initialState(session: GameSession, hasEvents: boolean): DerivedGameState {
  const anchor  = session.segment.anchor
  const offence = anchor ? anchor.offence : otherTeam(session.gameStartPullingTeam)
  return {
    gamePhase:  hasEvents ? 'awaiting-pull' : 'pre-game',
    score:      anchor ? { A: anchor.scoreA, B: anchor.scoreB } : { A: 0, B: 0 },
    possession: offence,
    attackLeft: offence,
    discHolder: null,
    deadDiscPending: false,
    holderFromDeadDisc: false,
    pointIndex: anchor ? anchor.scoreA + anchor.scoreB : 0,
    activeLine: { A: [], B: [] },
  }
}

export function deriveGameState(session: GameSession): DerivedGameState {
  const events = resolveRawLog(session.rawLog)
  const state = initialState(session, events.length > 0)

  for (const event of events) step(state, event, session)

  return state
}

// Single source of truth for state transitions on a resolved event —
// deriveGameState's inner walk.
function step(state: DerivedGameState, event: Resolved, session: GameSession): void {
  switch (event.type) {
    case 'point-start':
      state.gamePhase = 'awaiting-pull'
      state.discHolder = null
      state.deadDiscPending = false
      state.holderFromDeadDisc = false
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
      // The disc is dead and the receiving team's first touch will be a
      // pull-catch — flag it so the next `possession` is marked
      // `holderFromDeadDisc` (no goal off the pull until a pass is completed).
      state.deadDiscPending = true
      state.holderFromDeadDisc = false
      // possession is already the receiving team — none of these change it.
      // (A brick goes out of bounds; the receiving team takes possession at
      // the brick mark, so the receiving-team assignment from point-start
      // still stands.)
      break

    case 'possession':
      state.discHolder = event.playerId
      state.possession = event.teamId
      // A possession that consumes a pending dead disc is the pickup (off a
      // pull, turnover, or block) — flag the holder so a goal is blocked until
      // they complete a pass. Any later possession is that completed pass and
      // clears the flag.
      state.holderFromDeadDisc = state.deadDiscPending
      state.deadDiscPending = false
      break

    case 'turnover-throw-away':
    case 'turnover-receiver-error':
    case 'turnover-stall':
    case 'turnover-unknown':
      // Disc turned over — it's now dead on the ground. Whoever picks it up is
      // a dead-disc pickup (no goal off that pickup until a pass completes).
      state.possession = otherTeam(state.possession)
      state.discHolder = null
      state.deadDiscPending = true
      state.holderFromDeadDisc = false
      break

    case 'block':
      // Disc is knocked down, not caught — the defending team gets
      // possession but there's no holder yet, and the disc is dead. The next
      // event is a `possession` recording whoever picks it up; that pickup
      // can't score directly (no goal off a block until a pass completes).
      state.possession = event.teamId
      state.discHolder = null
      state.deadDiscPending = true
      state.holderFromDeadDisc = false
      break

    case 'intercept':
      // Defender catches the disc cleanly — they're the new holder
      // immediately, no follow-up possession event needed. An intercept is a
      // LIVE catch (not a dead-disc pickup), so a Callahan off an intercept
      // stays allowed.
      state.possession = event.teamId
      state.discHolder = event.playerId
      state.deadDiscPending = false
      state.holderFromDeadDisc = false
      break

    case 'goal':
      state.score = { ...state.score, [event.teamId]: state.score[event.teamId] + 1 }
      state.pointIndex++
      state.gamePhase = 'point-over'
      state.discHolder = null
      state.deadDiscPending = false
      state.holderFromDeadDisc = false
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
      state.discHolder = null
      state.deadDiscPending = false
      state.holderFromDeadDisc = false
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
      state.deadDiscPending = false
      state.holderFromDeadDisc = false
      state.possession = event.offenceTeam
      state.attackLeft = event.offenceTeam
      break

    case 'foul':
    case 'pick':
    case 'timeout':
      // Stoppages — no state change.
      break
  }
}

type StructuralOnly = Extract<RawEvent, { type: 'undo' | 'truncate' }>

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
      return state.gamePhase === 'in-play' && state.discHolder !== null

    case 'goal':
      // No goal off a dead-disc pickup. After a pull, a turnover, or a block the
      // disc is dead; whoever picks it up must complete ≥1 pass before scoring
      // (you can't score straight off the pickup). `holderFromDeadDisc` is true
      // only on that first pickup. An intercept is a LIVE catch (it sets the
      // holder directly, never flagging this), so a Callahan off an intercept
      // is still allowed.
      return state.gamePhase === 'in-play'
          && state.discHolder !== null
          && !state.holderFromDeadDisc

    case 'turnover-unknown':
      // No holder requirement — the whole point is to mark a turnover when we
      // couldn't track who had the disc. Allowed any time the disc is live.
      return state.gamePhase === 'in-play'

    case 'block':
    case 'intercept':
      // Require a disc holder — there's no thrown disc to block / intercept
      // until the offence has picked it up. This also forbids a block /
      // intercept immediately following a pull (dead disc, no holder).
      return state.gamePhase === 'in-play' && state.discHolder !== null

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

    case 'undo':
    case 'truncate':
      return true
  }
}

// ─── Append helpers ───────────────────────────────────────────────────────────

/** Append-only writer. Stamps each input event with the next monotonic id and a
    shared timestamp, then appends to the rawLog. The only mutation path. */
export function appendEvents(session: GameSession, events: RawEventInput[]): GameSession {
  return { ...session, rawLog: stampAndAppend<RawEvent, RawEventInput>(session.rawLog, events) }
}

/** A session that looks as if it ended at the cursor (null = live). Drives both
 *  the record decision (`recordVia`) and the on-screen state (`useDerivedState`)
 *  so the tap-to-truncate preview and recording agree on what "now" is. */
export function effectiveSession(session: GameSession, cursor: EventId | null): GameSession {
  return cursor === null ? session : { ...session, rawLog: session.rawLog.filter(e => e.id <= cursor) }
}
