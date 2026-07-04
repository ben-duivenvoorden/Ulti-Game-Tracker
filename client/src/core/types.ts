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

// ─── Unknown-player sentinel ──────────────────────────────────────────────────
// PlayerId 0 is reserved as a global "Unknown Player" — NOT a roster/line member.
// It surfaces only on live scoring entry as a red attribution target (a
// placeholder until substituted with real data) and never in line selection.
// `nextGlobalPlayerId` starts at 1, so 0 is never assigned to a real player.
export const UNKNOWN_PLAYER_ID: PlayerId = 0

/** Synthetic Player record for the unknown-player sentinel. `teamId` is
 *  irrelevant for display (id 0 never sits in a line slot, so it has no
 *  lineRatio / line-slot interaction). */
export const UNKNOWN_PLAYER: Player = {
  id: UNKNOWN_PLAYER_ID,
  name: 'Unknown Player',
  teamId: 'A',
  gender: 'M',
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
  | 'turnover-unknown'         // data-quality hole: a turnover we couldn't fully attribute
  | 'block'
  | 'intercept'
  | 'timeout'
  | 'goal'
  | 'injury-sub'
  | 'half-time'
  | 'end-game'
  | 'score-resume'             // resync after missing points: set score + offence, drop into line select
  | 'foul'
  | 'pick'
  | 'undo'
  | 'truncate'                 // drops every event with id > truncateAfterId
                               // — used by tap-to-truncate to commit a rewind

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
// Unknown turnover — attributable to any player; pressed standalone it
// attributes to the Unknown-Player sentinel (PlayerId 0). Rendered red in the
// log to flag it as a data-quality hole.
export interface TurnoverUnknownRawEvent extends BaseRawEvent { type: 'turnover-unknown'; playerId: PlayerId; teamId: TeamId }
export interface BlockRawEvent      extends BaseRawEvent { type: 'block' | 'intercept'; playerId: PlayerId; teamId: TeamId }
export interface GoalRawEvent       extends BaseRawEvent { type: 'goal';                playerId: PlayerId; teamId: TeamId }
// Injury sub replaces a single team's line with a new ordered list.
export interface InjurySubRawEvent  extends BaseRawEvent { type: 'injury-sub'; teamId: TeamId; line: PlayerId[] }
export interface HalfTimeRawEvent   extends BaseRawEvent { type: 'half-time' }
export interface EndGameRawEvent    extends BaseRawEvent { type: 'end-game' }
// Resync after missing one or more points. Sets the score directly, makes
// `offenceTeam` the receiver (so the other team pulls the resumed point), and
// drops into line selection. If the resumed span crosses half-time, the store
// inserts a half-time event alongside this so ends-orientation stays correct.
export interface ScoreResumeRawEvent extends BaseRawEvent { type: 'score-resume'; scoreA: number; scoreB: number; offenceTeam: TeamId }
export interface TimeoutRawEvent    extends BaseRawEvent { type: 'timeout' }
export interface FoulRawEvent       extends BaseRawEvent { type: 'foul' }
export interface PickRawEvent       extends BaseRawEvent { type: 'pick' }
export interface UndoRawEvent       extends BaseRawEvent { type: 'undo' }
// Structural — never appears in the visible log. The engine drops every
// resolved entry whose id > truncateAfterId, then carries on with whatever
// events follow in the rawLog.
export interface TruncateRawEvent   extends BaseRawEvent { type: 'truncate'; truncateAfterId: EventId }

export type RawEvent =
  | PointStartRawEvent
  | PullRawEvent
  | PossessionRawEvent
  | TurnoverRawEvent
  | TurnoverUnknownRawEvent
  | BlockRawEvent
  | GoalRawEvent
  | InjurySubRawEvent
  | HalfTimeRawEvent
  | EndGameRawEvent
  | ScoreResumeRawEvent
  | TimeoutRawEvent
  | FoulRawEvent
  | PickRawEvent
  | UndoRawEvent
  | TruncateRawEvent

// ─── Visual log ───────────────────────────────────────────────────────────────
// Same shape as RawEvent minus structural-only entries (undo/truncate resolve
// into the visible list rather than appearing in it).
// Structured — no formatted strings. UI layer formats via format.ts.

export type VisLogEntry = Exclude<RawEvent, UndoRawEvent | TruncateRawEvent>

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
  /** True from a dead-disc event (pull / pull-bonus / brick / any turnover /
   *  block) until the next team takes possession — bookkeeping for the
   *  dead-disc pickup rule below. */
  deadDiscPending: boolean
  /** True when the current `discHolder` picked up a *dead* disc — the first
   *  possession after a pull, turnover, or block. A goal can't be scored off a
   *  dead-disc pickup (you must put the disc back in play first), so
   *  `canRecord('goal')` requires this to be false. An intercept is a *live*
   *  catch (sets the holder directly), so a Callahan off an intercept stays
   *  allowed. */
  holderFromDeadDisc: boolean
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

export type AppScreen = 'game-setup' | 'game-settings' | 'competition-settings' | 'line-selection' | 'live-entry' | 'teams-manager' | 'point-summary'

// ─── Recording options ────────────────────────────────────────────────────────

export type GameMode = 'mixed' | 'open'

export interface RecordingOptions {
  /** Modification (house rule): end-zone pulls score a bonus. Off by default;
   *  a game's competition can flip it on selection (`competitionOverrides`). */
  pullBonus: boolean
  brick:     boolean
  foul:      boolean
  pick:      boolean
  stall:     boolean
  /** WFDF Ratio Rule A (ABBA) per-point gender-ratio advice, mixed only. Off
   *  by default — not every mixed competition runs ABBA balancing. When on,
   *  the point-1 majority is still chosen per game at the second flip
   *  (`GameSession.abbaStartMajority`). */
  abba:      boolean
  /** Default player-tap action: record a possession (pass) event. When
   *  disabled, taps on players in `in-play` are no-ops, no `possession`
   *  events land in the log, and the pass notation draws nothing. The
   *  awaiting-pull puller select still works either way. */
  passes:    boolean
  /** 'mixed' = male/female-matching ratio enforced; 'open' = total count only. */
  gameMode:  GameMode
  /** In mixed: M and F counts must match. In open: M+F is the total line size. */
  lineRatio: { M: number; F: number }
  /** Players per line. In mixed mode this must equal `lineRatio.M + lineRatio.F`.
   *  Drives the line-selection target and the running-start `+` slot count. */
  lineSize:  number
  /** Free-text scorer briefing shown behind the (i) bubble during scoring /
   *  line selection. Lives on the competition-config layer; empty by default. */
  scorerInfo: string
}

export const DEFAULT_RECORDING_OPTIONS: RecordingOptions = {
  pullBonus:  false,
  brick:      true,
  foul:       false,
  pick:       false,
  stall:      false,
  abba:       false,
  passes:     true,
  gameMode:   'mixed',
  lineRatio:  { M: 4, F: 3 },
  lineSize:   7,
  scorerInfo: '',
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

// ─── Segment identity ─────────────────────────────────────────────────────────
// A *segment* is one scorer's independent, single-writer recording of a game.
// One game can have many segments (one per scorer / device); each owns its own
// append-only rawLog with its own monotonic event ids — so two scorers never
// collide on an id. The backend assembles segments on the point axis into a
// coverage map and a single canonical log. See the Segmented Scoring plan.

/** Opaque, globally-unique id for one scorer's recording of a game. */
export type SegmentId = string
/** Lightweight scorer (human / login) identity (a generated id today; no auth).
 *  Distinct from `DeviceId`: one scorer may record from several devices. */
export type ScorerId = string
/** Per-device writer handle. The real writer key is `(scorer, device)` — one
 *  login used on two devices is two independent single-writer segments. Until
 *  auth lands, `scorerId` and `deviceId` co-vary (both per-boot tokens). */
export type DeviceId = string

/** The game-state checkpoint a segment was started from. Absent when the
 *  segment recorded from the opening pull; present when it was started
 *  mid-game from a known score (mirrors the `score-resume` payload). */
export interface SegmentAnchor {
  scoreA:  number
  scoreB:  number
  offence: TeamId
}

/** Per-recording identity carried on every `GameSession`. The `rawLog` stays
 *  the single source of truth for game *history*; this is the single source of
 *  truth for *whose* recording it is and where it began. */
export interface SegmentMeta {
  segmentId: SegmentId
  scorerId:  ScorerId
  /** The device that owns this segment. Part of the writer key — two devices on
   *  one `scorerId` are two independent single-writer segments. */
  deviceId:  DeviceId
  /** Wall-clock creation time of the segment (ms since epoch). */
  createdAt: number
  /** Set when the segment was started from a score checkpoint. */
  anchor?:   SegmentAnchor
  /** Set when this segment was forked from another (deferred feature). */
  parentSegmentId?: SegmentId
}

// activeLine is no longer stored — it's reconstructed from rawLog by the engine.
// Anything that needs the line reads it from `DerivedGameState.activeLine`.
export interface GameSession {
  gameConfig: GameConfig
  gameStartPullingTeam: TeamId
  /** WFDF Ratio Rule A (ABBA), mixed division only: which matching division is
   *  the majority on point 1 — the outcome of the second (ratio) flip. The
   *  per-point prescription alternates every two points from this seed
   *  (`ratioForPoint` in engine.ts). Sits alongside `gameStartPullingTeam` as
   *  an opening-flip outcome — NOT on GameConfig, which `resolveSession`
   *  rebuilds from the scheduled-games log on every read. Absent ⇒ ABBA advice
   *  off (fixed `lineRatio` behaviour). */
  abbaStartMajority?: 'M' | 'F'
  /** Identity of this scorer's recording. One game → many segments. */
  segment: SegmentMeta
  rawLog: RawEvent[]
}
