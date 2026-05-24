// ─── Primitives ───────────────────────────────────────────────────────────────

export type TeamId   = 'A' | 'B'
/** Per-game surrogate (auto-assigned when a session is created from a roster). */
export type PlayerId = number
export type GameId   = number
/** Per-game monotonic event id (1, 2, 3 …). Append-only — never reused. */
export type EventId  = number

export const otherTeam = (t: TeamId): TeamId => (t === 'A' ? 'B' : 'A')

// ─── Domain entities ──────────────────────────────────────────────────────────

export interface Team {
  id: TeamId
  name: string
  short: string
  color: string
}

export interface Player {
  id: PlayerId
  name: string
  teamId: TeamId
  /** Matching division: 'M' = male-matching, 'F' = female-matching (mixed-division ultimate). */
  gender: 'M' | 'F'
  jerseyNumber?: number
  photoUrl?: string
}

export interface Score {
  A: number
  B: number
}

// ─── Raw event log ────────────────────────────────────────────────────────────
// Append-only. Never mutated. Single source of truth for game history.

export type RawEventType =
  | 'point-start'              // marks the start of a new point (between goal and pull)
  | 'pull'
  | 'pull-bonus'
  | 'brick'                    // pull went out of bounds — receiving team takes it at the brick mark
  | 'possession'
  | 'turnover-throw-away'
  | 'turnover-receiver-error'
  | 'turnover-stall'
  | 'block'
  | 'intercept'
  | 'timeout'
  | 'goal'
  | 'injury-sub'
  | 'half-time'
  | 'end-game'
  | 'foul'
  | 'pick'
  | 'system'
  | 'undo'
  | 'amend'
  | 'truncate'                 // drops every event with id > truncateAfterId
                               // — used by tap-to-truncate to commit a rewind
  | 'splice-block'             // structural insert/replace/delete in the resolved log

interface BaseRawEvent {
  id: EventId
  timestamp: number
  pointIndex: number
}

// Point-start carries the agreed line-up for both teams. Engine reconstructs
// activeLine on derivation; the line is no longer stored on the session.
export interface PointStartRawEvent extends BaseRawEvent { type: 'point-start'; lineA: PlayerId[]; lineB: PlayerId[] }
export interface PullRawEvent       extends BaseRawEvent { type: 'pull' | 'pull-bonus' | 'brick'; playerId: PlayerId; teamId: TeamId }
export interface PossessionRawEvent extends BaseRawEvent { type: 'possession';          playerId: PlayerId; teamId: TeamId }
export interface TurnoverRawEvent   extends BaseRawEvent { type: 'turnover-throw-away' | 'turnover-receiver-error' | 'turnover-stall'; playerId: PlayerId; teamId: TeamId }
export interface BlockRawEvent      extends BaseRawEvent { type: 'block' | 'intercept'; playerId: PlayerId; teamId: TeamId }
export interface GoalRawEvent       extends BaseRawEvent { type: 'goal';                playerId: PlayerId; teamId: TeamId }
// Injury sub replaces a single team's line with a new ordered list.
export interface InjurySubRawEvent  extends BaseRawEvent { type: 'injury-sub'; teamId: TeamId; line: PlayerId[] }
export interface HalfTimeRawEvent   extends BaseRawEvent { type: 'half-time' }
export interface EndGameRawEvent    extends BaseRawEvent { type: 'end-game' }
export interface TimeoutRawEvent    extends BaseRawEvent { type: 'timeout' }
export interface FoulRawEvent       extends BaseRawEvent { type: 'foul' }
export interface PickRawEvent       extends BaseRawEvent { type: 'pick' }
export interface SystemRawEvent     extends BaseRawEvent { type: 'system'; text: string }
export interface UndoRawEvent       extends BaseRawEvent { type: 'undo' }
export interface AmendRawEvent      extends BaseRawEvent { type: 'amend'; targetEventId: EventId; replacement: RawEvent | null }
// Structural — never appears in the visible log. The engine drops every
// resolved entry whose id > truncateAfterId, then carries on with whatever
// events follow in the rawLog.
export interface TruncateRawEvent   extends BaseRawEvent { type: 'truncate'; truncateAfterId: EventId }
// Structural splice on the resolved log: removes resolved entries whose ids
// fall in [removeFromId..removeToId] and inserts `events` immediately after
// the resolved entry with id === afterEventId.
// - removeFromId/ToId both null, events.length > 0 → insert (paste)
// - removeFromId/ToId set, events.length === N      → replace
// - removeFromId/ToId set, events.length === 0      → delete
// Inner events get fresh ids when the splice is committed via appendEvents.
export interface SpliceBlockRawEvent extends BaseRawEvent {
  type:         'splice-block'
  afterEventId: EventId
  removeFromId: EventId | null
  removeToId:   EventId | null
  events:       RawEvent[]
}

export type RawEvent =
  | PointStartRawEvent
  | PullRawEvent
  | PossessionRawEvent
  | TurnoverRawEvent
  | BlockRawEvent
  | GoalRawEvent
  | InjurySubRawEvent
  | HalfTimeRawEvent
  | EndGameRawEvent
  | TimeoutRawEvent
  | FoulRawEvent
  | PickRawEvent
  | SystemRawEvent
  | UndoRawEvent
  | AmendRawEvent
  | TruncateRawEvent
  | SpliceBlockRawEvent

// ─── Visual log ───────────────────────────────────────────────────────────────
// Same shape as RawEvent minus structural-only entries (undo/amend/truncate/
// splice-block resolve into the visible list rather than appearing in it).
// Structured — no formatted strings. UI layer formats via format.ts.

export type VisLogEntry = Exclude<RawEvent, UndoRawEvent | AmendRawEvent | TruncateRawEvent | SpliceBlockRawEvent>

// ─── Derived game state ───────────────────────────────────────────────────────

export type GamePhase =
  | 'pre-game'        // no events yet (line not confirmed for first point)
  | 'awaiting-pull'   // point-start recorded, waiting for pull
  | 'in-play'         // pull recorded, point in progress
  | 'point-over'      // goal scored mid-game, awaiting next-point line selection
  | 'half-time'       // half-time reached
  | 'game-over'       // end-game

export interface DerivedGameState {
  gamePhase: GamePhase
  score: Score
  possession: TeamId           // team currently entitled to disc (or about to receive)
  attackLeft: TeamId           // team currently attacking left → right (UI orientation)
  discHolder: PlayerId | null  // null between possession events / turnovers
  pointIndex: number           // total goals scored so far
  /** Players on the field for each team, in roster order. Derived from
   *  point-start / injury-sub events. */
  activeLine: ActiveLine
}

// ─── Transient UI state (lives in store, not derived) ─────────────────────────

export type UiMode =
  | 'idle'               // default — no special interaction in progress
  | 'block-pick'         // recorder tapped "Blocked by Defence", picking blocker
  | 'intercept-pick'     // recorder tapped "Intercepted by Defence", picking interceptor
  | 'receiver-error-pick' // recorder tapped "Receiver Error", picking player who had error

export type AppScreen = 'game-setup' | 'game-settings' | 'line-selection' | 'live-entry' | 'teams-manager'

// ─── Transient banner notification ────────────────────────────────────────────
// Shared by copy / paste / edit-commit flows. One banner at a time; tap to
// dismiss. Auto-clears via setTimeout.

export interface Notification {
  kind:      'success' | 'failure'
  message:   string
  detail?:   string
  expiresAt: number
}

// ─── Edit mode (transient — not persisted) ────────────────────────────────────
// Entry: GameOverBanner → "Edit log". The recording UI operates against the
// draftSession via the useSession selector. On Done, the draftEvents collected
// since the range was removed are committed as a splice-block on the
// baselineSession. Cancel discards everything.

export interface EditModeState {
  active:          true
  baselineSession: GameSession    // snapshot at the moment edit-mode opened
  draftSession:    GameSession    // working copy that the recording controls operate on
  removeFromId:    EventId | null // first id of the selected replace range
  removeToId:      EventId | null // last id of the selected replace range
  draftEvents:     RawEvent[]     // events appended to draftSession since the range was removed
}

// ─── Recording options ────────────────────────────────────────────────────────

export type GameMode = 'mixed' | 'open'

export interface RecordingOptions {
  pullBonus: boolean
  brick:     boolean
  foul:      boolean
  pick:      boolean
  stall:     boolean
  /** Default player-tap action: record a possession (pass) event. When
   *  disabled, taps on players in `in-play` are no-ops, no `possession`
   *  events land in the log, and the pass lane draws no arrows. The
   *  awaiting-pull puller select still works either way. */
  passes:    boolean
  /** How many recent passes are drawn in the Pass Lane on Live Entry.
   *  Sub-setting of `passes` — meaningful only when passes is enabled.
   *  Clamped to [0, 3] (the lane has three styled tracks). */
  passArrowsShown: number
  /** 'mixed' = male/female-matching ratio enforced; 'open' = total count only. */
  gameMode:  GameMode
  /** In mixed: M and F counts must match. In open: M+F is the total line size. */
  lineRatio: { M: number; F: number }
}

export const DEFAULT_RECORDING_OPTIONS: RecordingOptions = {
  pullBonus: true,
  brick:     true,
  foul:      false,
  pick:      false,
  stall:     false,
  passes:    true,
  passArrowsShown: 2,
  gameMode:  'mixed',
  lineRatio: { M: 4, F: 3 },
}

// ─── Game config & session ────────────────────────────────────────────────────

export type GameStatus = 'scheduled' | 'in-progress' | 'complete'

export interface GameConfig {
  id: GameId
  name: string
  scheduledTime: string
  /** Global identifiers for the team currently slotted as positional A/B in
   *  this game. The live `teams` + `rosters` below are resolved from the
   *  teamsLog by `resolveSession` on every read — these two fields are the
   *  durable reference. */
  teamAGlobalId: number
  teamBGlobalId: number
  teams: Record<TeamId, Team>
  rosters: Record<TeamId, Player[]>
  halfTimeAt: number
  scoreCapAt: number
}

export interface ActiveLine {
  A: Player[]
  B: Player[]
}

// activeLine is no longer stored — it's reconstructed from rawLog by the engine.
// Anything that needs the line reads it from `DerivedGameState.activeLine`.
export interface GameSession {
  gameConfig: GameConfig
  gameStartPullingTeam: TeamId
  rawLog: RawEvent[]
}
