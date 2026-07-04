import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type {
  AppScreen,
  UiMode,
  TeamId,
  PlayerId,
  EventId,
  Player,
  GameSession,
  RecordingOptions,
  DerivedGameState,
  ScorerId,
  DeviceId,
  SegmentAnchor,
} from './types'
import { otherTeam, DEFAULT_RECORDING_OPTIONS, UNKNOWN_PLAYER_ID } from './types'
import { newSegmentId, newScorerId, newDeviceId } from './ids'
import {
  deriveGameState,
  canRecord,
  appendEvents,
  effectiveSession,
  type RawEventInput,
} from './engine'
import { stampAndAppend, nextIdFrom } from './log'
import {
  STORAGE_KEY, STORAGE_VERSION, INITIAL_SEED,
  migrateGameStore, mergeGameStore, logRehydrate,
} from './persistence'
import { PICK_MODES, isPickMode } from './pickModes'
import { seedTeamsAndGames } from './data'
import type { TeamEvent, GlobalTeamId } from './teams/types'
import type { CompetitionId, ScheduledGameEvent } from './games/types'
import { deriveTeamsState } from './teams/engine'
import { competitionOverrides, deriveScheduledGamesState, resolveGameConfig } from './games/engine'
import {
  addTeam as buildAddTeam,
  editTeam as buildEditTeam,
  archiveTeam as buildArchiveTeam,
  addPlayer as buildAddPlayer,
  editPlayer as buildEditPlayer,
  removePlayer as buildRemovePlayer,
} from './teams/actions'
import {
  addScheduledGame as buildAddScheduledGame,
  editScheduledGame as buildEditScheduledGame,
  cancelScheduledGame as buildCancelScheduledGame,
} from './games/actions'

// ─── Store shape ──────────────────────────────────────────────────────────────
// Keep this minimal — game state derives from session.rawLog via the engine.
// Only true UI state lives here.

interface GameStore {
  // Persisted
  session: GameSession | null
  /** This device's stable scorer (human / login) identity. Generated once on
   *  first boot and persisted; stamped onto every segment this device creates so
   *  the backend can attribute recordings. No auth yet — until then it co-varies
   *  with `deviceId` (both per-boot tokens). */
  scorerId: ScorerId
  /** This device's stable writer handle. The real writer key is
   *  `(scorerId, deviceId)` — one login on two devices is two independent
   *  single-writer segments, so the backend must distinguish them. Generated
   *  once on first boot and persisted. */
  deviceId: DeviceId
  /** Append-only teams + players log (mirrors session.rawLog). Seeded from
   *  `seedTeamsAndGames()` on first boot. Never mutated — every CRUD action
   *  appends a new event. */
  teamsLog: TeamEvent[]
  /** Append-only scheduled-games log. Same pattern as `teamsLog`. */
  scheduledGamesLog: ScheduledGameEvent[]
  screen: AppScreen
  isInjurySub: boolean
  uiMode: UiMode
  selPuller: PlayerId | null
  recordingOptions: RecordingOptions

  // Transient (not persisted)
  showEventMenu: boolean
  /** Cursor for the tap-to-truncate preview. null = live mode; otherwise the
   *  eventId after which entries are greyed in the log and the canvas
   *  reflects the state at that point. Cleared the moment new activity is
   *  recorded — the action prepends a `truncate` event so the dropped tail
   *  is committed atomically with whatever the user did next. */
  truncateCursor: EventId | null
  /** Manual baseline for the scorer's preferred orientation. The displayed
   *  `endsSwapped` is derived by `deriveEndsSwapped(baseline, visLog)` — the
   *  baseline contributes one term, each goal flips, each half-time may add
   *  one more flip. Toggled by the swap button in the Header. */
  endsSwappedBaseline: boolean

  // Game / session actions
  selectGame:        (gameId: number, pullingTeam: TeamId, abbaStartMajority?: 'M' | 'F') => void
  /** Set / clear the ABBA point-1 majority (WFDF Ratio Rule A) on the current
   *  session — the second-flip outcome. `null` turns the per-point advice off. */
  setAbbaStartMajority: (majority: 'M' | 'F' | null) => void
  /** Start a fresh *anchored* segment for a game part-way through: record from
   *  the given score with `offence` receiving. The anchor lives on the segment
   *  (no event needed) and seeds the engine; the non-offence team pulls the
   *  resumed point. Overwrites any current session, like `selectGame`. */
  startSegmentFromScore: (gameId: number, scoreA: number, scoreB: number, offence: TeamId) => void
  /** Adopt the current recording as a new segment of my own and continue from
   *  it: copies the prefix into a fresh segment (new `segmentId`, this device's
   *  `scorerId`, `parentSegmentId` = the source). The copied prefix re-records
   *  the same points under the new segment — the canonical layer dedupes the
   *  overlap. No-op if there's no current session. */
  forkSegment:       () => void
  resumeGame:        (gameId: number) => void
  confirmLine:       (lineA: Player[], lineB: Player[]) => void
  nextPoint:         () => void
  dismissPointSummary: () => void
  undoPointSummary:  () => void
  resumeFromScore:   (scoreA: number, scoreB: number, offenceTeam: TeamId) => void
  /** Replace the active line for one team mid-point (backfill a running-start
   *  slot, or remove a player). Emits an injury-sub if the line changed. */
  editActiveLine:    (teamId: TeamId, line: PlayerId[]) => void
  backToGameList:    () => void

  // Recording actions (all funnel through canRecord guards). `record*` appends
  // events; `trigger*` only changes transient UI state (entering a mode).
  tapPlayer:            (player: Player) => void
  recordPull:           (bonus?: boolean) => void
  recordBrick:          () => void
  recordThrowAway:      () => void
  recordReceiverError:  () => void
  recordGoal:           () => void
  recordUnknownTurnover: () => void
  triggerDefBlock:      (type: 'block' | 'intercept') => void
  recordFoul:          () => void
  recordPick:          () => void
  recordStall:         () => void
  recordTimeout:       () => void
  /** Append a reviewed voice-narration batch. Every event is validated with
   *  `canRecord` against the evolving state (the single guard) before ANY of
   *  them commit — all-or-nothing. Returns false when validation rejects. */
  recordVoiceEvents:   (inputs: RawEventInput[]) => boolean
  undo:                () => void
  recordHalfTime:      () => void
  recordEndGame:       () => void
  triggerInjurySub:    () => void
  cancelPickMode:      () => void

  // Settings
  openGameSettings:      () => void
  closeGameSettings:     () => void
  updateRecordingOption: <K extends keyof RecordingOptions>(key: K, value: RecordingOptions[K]) => void

  // Pure UI
  setShowEventMenu:    (show: boolean) => void
  setTruncateCursor:   (cursor: EventId | null) => void
  toggleEndsSwapped:   () => void

  // ── Teams + scheduled games management (append-only) ──────────────────────
  // Every CRUD funnels through `stampAndAppend` — never a direct mutation.
  // Return ids so the caller can wire them into follow-up state
  // (e.g. select the freshly-created team in a picker).
  addTeam:             (name: string, short: string, color: string) => GlobalTeamId
  editTeam:            (teamId: GlobalTeamId, patch: { name?: string; short?: string; color?: string }) => void
  archiveTeam:         (teamId: GlobalTeamId) => void
  addPlayer:           (
    teamId: GlobalTeamId,
    name: string,
    gender: 'M' | 'F',
    extras?: { jerseyNumber?: number; photoUrl?: string; spokenAliases?: string[] },
  ) => PlayerId
  editPlayer:          (
    playerId: PlayerId,
    patch: { name?: string; gender?: 'M' | 'F'; jerseyNumber?: number | null; photoUrl?: string | null; spokenAliases?: string[] },
  ) => void
  removePlayer:        (playerId: PlayerId) => void

  addScheduledGame:    (args: {
    name: string
    scheduledTime: string
    teamAGlobalId: GlobalTeamId
    teamBGlobalId: GlobalTeamId
    halfTimeAt: number
    scoreCapAt: number
    competitionId?: CompetitionId
  }) => number
  editScheduledGame:   (gameId: number, patch: {
    name?: string
    scheduledTime?: string
    teamAGlobalId?: GlobalTeamId
    teamBGlobalId?: GlobalTeamId
    halfTimeAt?: number
    scoreCapAt?: number
    competitionId?: CompetitionId
  }) => void
  cancelScheduledGame: (gameId: number) => void

  // Navigation to / from the Teams Manager screen.
  openTeamsManager:    () => void
  closeTeamsManager:   () => void

  // ── Debug ────────────────────────────────────────────────────────────────
  /** Wipe persistence, including any in-progress session, and reseed teams +
   *  scheduled games from `seedTeamsAndGames()`. Useful when the persisted
   *  state has drifted from the demo data on disk. */
  resetAllData:        () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a fresh session for a given game by resolving the live teams + game
 *  logs. Returns null if the game is unknown or has been cancelled. */
function freshSession(
  gameId: number,
  pullingTeam: TeamId,
  scorerId: ScorerId,
  deviceId: DeviceId,
  teamsLog: TeamEvent[],
  scheduledGamesLog: ScheduledGameEvent[],
  anchor?: SegmentAnchor,
  abbaStartMajority?: 'M' | 'F',
): GameSession | null {
  const gamesState = deriveScheduledGamesState(scheduledGamesLog)
  const game = gamesState.gamesById.get(gameId)
  if (!game) return null
  const teamsState = deriveTeamsState(teamsLog)
  const config = resolveGameConfig(game, teamsState)
  return {
    gameConfig:           config,
    gameStartPullingTeam: pullingTeam,
    ...(abbaStartMajority ? { abbaStartMajority } : {}),
    segment:              { segmentId: newSegmentId(), scorerId, deviceId, createdAt: Date.now(), ...(anchor ? { anchor } : {}) },
    rawLog:               [],
  }
}

// Next globally-unique entity ids — one past the max already in the log,
// including soft-deleted entities (ids are never reused).
const nextGlobalTeamId   = (log: TeamEvent[]): GlobalTeamId =>
  nextIdFrom(log, e => (e.type === 'team-add' ? e.teamId : null))
const nextGlobalPlayerId = (log: TeamEvent[]): PlayerId =>
  nextIdFrom(log, e => (e.type === 'player-add' ? e.playerId : null))
const nextGameId         = (log: ScheduledGameEvent[]): number =>
  nextIdFrom(log, e => (e.type === 'game-add' ? e.gameId : null))

function sameLine(a: PlayerId[], b: PlayerId[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** Transient interaction state reset on every navigation between screens —
 *  spread into `set()` alongside whatever the action actually changes. */
const RESET_TRANSIENT_UI = {
  isInjurySub:    false,
  uiMode:         'idle',
  selPuller:      null,
  showEventMenu:  false,
  truncateCursor: null,
} satisfies Partial<GameStore>

// ─── Event-input builders ─────────────────────────────────────────────────────
// Shared `build` callbacks for recordVia — most recording actions differ only
// by event type, so the shapes live here once.

/** Holder-attributed turnovers: the event lands on whoever has the disc. */
function holderTurnoverInput(type: 'turnover-throw-away' | 'turnover-receiver-error' | 'turnover-stall') {
  return (state: DerivedGameState): RawEventInput[] | null => {
    if (!canRecord(state, type) || state.discHolder === null) return null
    return [{ pointIndex: state.pointIndex, type, playerId: state.discHolder, teamId: state.possession }]
  }
}

/** Payload-free events (stoppages + phase transitions): record iff allowed. */
function bareEventInput(type: 'foul' | 'pick' | 'timeout' | 'half-time' | 'end-game') {
  return (state: DerivedGameState): RawEventInput[] | null =>
    canRecord(state, type) ? [{ pointIndex: state.pointIndex, type }] : null
}

/** Pull-family events: attributed to the pre-selected puller, recorded for
 *  the team that is NOT receiving. */
function pullInput(type: 'pull' | 'pull-bonus' | 'brick', puller: PlayerId) {
  return (state: DerivedGameState): RawEventInput[] | null => {
    if (!canRecord(state, type)) return null
    return [{ pointIndex: state.pointIndex, type, playerId: puller, teamId: otherTeam(state.possession) }]
  }
}

const undoInput = (state: DerivedGameState): RawEventInput[] =>
  [{ pointIndex: state.pointIndex, type: 'undo' }]

// ─── recordVia ────────────────────────────────────────────────────────────────
// Common funnel for actions that append events. Reads the derived state at
// the truncate cursor (or live), lets the caller's `build` decide whether to
// record (returning null aborts), then commits the events plus any extra
// state in a single set(). Side-effect fields like `selPuller` /
// `showEventMenu` go through `extra` so they only fire on success — matching
// the pre-refactor per-action behaviour.
//
// When the truncate cursor is set, a structural `truncate` event is prepended
// so the dropped tail is committed atomically with whatever the user did
// next, and the cursor clears. (Undoing while previewing produces
// `[truncate, undo]` — drop forward, then nudge one more back.)
function recordVia(
  get: () => GameStore,
  set: (partial: Partial<GameStore>) => void,
  build: (state: DerivedGameState) => RawEventInput[] | null,
  extra?: Partial<GameStore>,
): boolean {
  const { session: target, truncateCursor } = get()
  if (!target) return false
  const state = deriveGameState(effectiveSession(target, truncateCursor))
  const events = build(state)
  if (!events || events.length === 0) return false
  const head: RawEventInput[] = truncateCursor !== null
    ? [{ pointIndex: state.pointIndex, type: 'truncate', truncateAfterId: truncateCursor }]
    : []
  const updated = appendEvents(target, [...head, ...events])
  set({
    session: updated,
    truncateCursor: null,
    ...extra,
  })
  return true
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      // Initial state
      session:           null,
      scorerId:          newScorerId(),
      deviceId:          newDeviceId(),
      teamsLog:          INITIAL_SEED.teamEvents,
      scheduledGamesLog: INITIAL_SEED.gameEvents,
      screen:            'game-setup',
      isInjurySub:       false,
      uiMode:            'idle',
      selPuller:         null,
      showEventMenu:     false,
      truncateCursor:    null,
      endsSwappedBaseline: false,
      recordingOptions:  DEFAULT_RECORDING_OPTIONS,

      // ── selectGame ──────────────────────────────────────────────────────────
      // Start a fresh game session (overwrites any existing one). Resolves
      // teams + rosters from the live teamsLog at the moment of creation —
      // subsequent reads via `resolveSession` re-resolve on every render.
      selectGame(gameId, pullingTeam, abbaStartMajority) {
        const { teamsLog, scheduledGamesLog, scorerId, deviceId, recordingOptions } = get()
        const session = freshSession(
          gameId, pullingTeam, scorerId, deviceId, teamsLog, scheduledGamesLog,
          undefined, abbaStartMajority,
        )
        if (!session) return
        // The game's competition decides the rule modifications for this
        // recording (currently pullBonus). No competition → options stand.
        const overrides = competitionOverrides(deriveScheduledGamesState(scheduledGamesLog), gameId)
        set({
          session, screen: 'line-selection', ...RESET_TRANSIENT_UI,
          recordingOptions: { ...recordingOptions, ...overrides },
        })
      },

      // ── setAbbaStartMajority ─────────────────────────────────────────────────
      // Correct / set the ABBA second-flip outcome mid-game (from GameSettings).
      // Session-shaped, not an event: it's an opening-flip fact like
      // `gameStartPullingTeam`, not part of game history.
      setAbbaStartMajority(majority) {
        const { session } = get()
        if (!session) return
        const { abbaStartMajority: _prev, ...rest } = session
        void _prev
        set({ session: majority ? { ...rest, abbaStartMajority: majority } : rest })
      },

      // ── startSegmentFromScore ─────────────────────────────────────────────────
      // Begin a new segment mid-game from a known score. The anchor is stored on
      // the segment (engine seeds score/possession/pointIndex from it), so the
      // log starts empty and the first point-start carries the correct global
      // point index. The non-offence team pulls the resumed point — hence
      // `gameStartPullingTeam = otherTeam(offence)`.
      startSegmentFromScore(gameId, scoreA, scoreB, offence) {
        const { teamsLog, scheduledGamesLog, scorerId, deviceId, recordingOptions } = get()
        const session = freshSession(
          gameId, otherTeam(offence), scorerId, deviceId, teamsLog, scheduledGamesLog,
          { scoreA, scoreB, offence },
        )
        if (!session) return
        const overrides = competitionOverrides(deriveScheduledGamesState(scheduledGamesLog), gameId)
        set({
          session, screen: 'line-selection', ...RESET_TRANSIENT_UI,
          recordingOptions: { ...recordingOptions, ...overrides },
        })
      },

      // ── forkSegment ───────────────────────────────────────────────────────────
      // Adopt the current recording as my own new segment. The prefix is copied
      // verbatim (event ids stay — they're unique per segment), the segment gets
      // a fresh id + this device's scorerId + a parent pointer, and the anchor
      // (if any) carries over so the engine seeds the same origin.
      forkSegment() {
        const { session, scorerId, deviceId } = get()
        if (!session) return
        const forked: GameSession = {
          ...session,
          segment: {
            segmentId:       newSegmentId(),
            scorerId,
            deviceId,
            createdAt:       Date.now(),
            parentSegmentId: session.segment.segmentId,
            ...(session.segment.anchor ? { anchor: session.segment.anchor } : {}),
          },
          rawLog: [...session.rawLog],
        }
        set({ session: forked, screen: 'live-entry', ...RESET_TRANSIENT_UI })
      },

      // ── resumeGame ──────────────────────────────────────────────────────────
      // Continue an in-progress game without resetting the log.
      // (For now, requires that the persisted session matches the gameId —
      //  later this will fetch from a server.)
      resumeGame(gameId) {
        const { session } = get()
        if (session && session.gameConfig.id === gameId) {
          set({ screen: 'live-entry', ...RESET_TRANSIENT_UI })
        } else {
          // No persisted session for this game — fall back to fresh start.
          // Caller should re-prompt for pulling team.
        }
      },

      // ── confirmLine ─────────────────────────────────────────────────────────
      // Encodes the on-field line-up directly into the rawLog. For a new point,
      // emits 'point-start' carrying lineA/lineB. For an injury sub mid-point,
      // emits a separate 'injury-sub' event for each team whose line changed.
      confirmLine(lineA, lineB) {
        const { session: target, isInjurySub } = get()
        if (!target) return

        const state = deriveGameState(target)
        const idsA  = lineA.map(p => p.id)
        const idsB  = lineB.map(p => p.id)

        if (isInjurySub) {
          const events: RawEventInput[] = []
          // Diff against current activeLine — only emit per-team events when changed.
          if (!sameLine(idsA, state.activeLine.A.map(p => p.id))) {
            events.push({ pointIndex: state.pointIndex, type: 'injury-sub', teamId: 'A', line: idsA })
          }
          if (!sameLine(idsB, state.activeLine.B.map(p => p.id))) {
            events.push({ pointIndex: state.pointIndex, type: 'injury-sub', teamId: 'B', line: idsB })
          }
          set({
            session: events.length === 0 ? target : appendEvents(target, events),
            screen:  'live-entry',
            isInjurySub: false,
            uiMode:  'idle',
          })
          return
        }

        // Normal line confirmation: start the next point with the agreed line-up.
        const updated = appendEvents(target, [
          { pointIndex: state.pointIndex, type: 'point-start', lineA: idsA, lineB: idsB },
        ])
        set({
          session:   updated,
          screen:    'live-entry',
          uiMode:    'idle',
          selPuller: null,
        })
      },

      // ── tapPlayer ───────────────────────────────────────────────────────────
      tapPlayer(player) {
        const { session: target, uiMode, truncateCursor } = get()
        if (!target) return
        // Branch on the cursor-aware state so the canvas tap matches what the
        // user is looking at; recordVia takes care of the truncate prepend.
        const state = deriveGameState(effectiveSession(target, truncateCursor))

        // Pick-mode dispatch — registry-driven (see core/pickModes.ts).
        // Pick triggers clear the cursor before this fires, so the cursor is
        // null here and recordVia behaves like a normal append.
        if (isPickMode(uiMode)) {
          const pickMode = uiMode
          recordVia(get, set, s => {
            const { onTap } = PICK_MODES[pickMode]
            if (!canRecord(s, onTap.eventType)) return null
            const teamId = onTap.team === 'defending' ? otherTeam(s.possession) : s.possession
            return [{
              pointIndex: s.pointIndex,
              type:     onTap.eventType,
              playerId: player.id,
              teamId,
            } as RawEventInput]
          }, { uiMode: 'idle' })
          return
        }

        // Awaiting pull: select / deselect puller
        if (state.gamePhase === 'awaiting-pull') {
          const { selPuller } = get()
          set({ selPuller: selPuller === player.id ? null : player.id })
          return
        }

        // Pass chain: tap = possession transfer. Suppressed when the
        // user has explicitly disabled the Passes recording option —
        // legacy persisted state from before the toggle existed leaves
        // `passes` undefined, which we treat the same as the `true` default.
        if (state.gamePhase === 'in-play') {
          // The Unknown-Player sentinel is the "I didn't see who" affordance, so
          // it bypasses the Passes toggle — it must still set a holder even when
          // individual-pass tracking is off, otherwise goals / turnovers can't be
          // attributed at all.
          if (player.id !== UNKNOWN_PLAYER_ID && get().recordingOptions.passes === false) return
          recordVia(get, set, s => {
            if (!canRecord(s, 'possession')) return null
            // Don't record if they already have possession
            if (s.discHolder === player.id) return null
            return [{
              pointIndex: s.pointIndex,
              type:     'possession',
              playerId: player.id,
              teamId:   s.possession,
            }]
          })
          return
        }
      },

      // ── recordPull / recordBrick ────────────────────────────────────────────
      // A brick is a pull gone out of bounds — engine-wise it transitions to
      // in-play just like a pull; the difference is purely the recorded event
      // type (for stats / reporting). `=== null`, not `!selPuller` — the
      // Unknown-Player sentinel is id 0 (falsy) and is a valid puller.
      recordPull(bonus = false) {
        const { selPuller } = get()
        if (selPuller === null) return
        recordVia(get, set, pullInput(bonus ? 'pull-bonus' : 'pull', selPuller), { selPuller: null })
      },

      recordBrick() {
        const { selPuller } = get()
        if (selPuller === null) return
        recordVia(get, set, pullInput('brick', selPuller), { selPuller: null })
      },

      // ── Holder-attributed turnovers ─────────────────────────────────────────
      // All land on the current disc holder. Receiver error's mental model:
      // the recorder taps the intended receiver (recording a possession),
      // then taps Receiver Error to mark it as a drop.
      recordThrowAway() {
        recordVia(get, set, holderTurnoverInput('turnover-throw-away'))
      },

      recordReceiverError() {
        recordVia(get, set, holderTurnoverInput('turnover-receiver-error'))
      },

      // ── recordGoal ──────────────────────────────────────────────────────────
      // Records the goal, then routes to the dismissible point-summary screen
      // (which keeps undo + log accessible and calls out data-quality holes
      // before the recorder taps through to line selection). Half-time /
      // end-game suggestions are surfaced on LineSelection via
      // `useSuggestedTransition` — the app does not auto-emit them here.
      //
      // Only navigate to point-summary when previewing live (no truncate
      // cursor) — a goal recorded while rewound is a correction, not a fresh
      // point, so it stays put.
      recordGoal() {
        const live = get().truncateCursor === null
        recordVia(get, set, state => {
          if (!canRecord(state, 'goal') || state.discHolder === null) return null
          return [{
            pointIndex: state.pointIndex,
            type:     'goal',
            playerId: state.discHolder,
            teamId:   state.possession,
          }]
        }, live ? { screen: 'point-summary' } : undefined)
      },

      // ── recordUnknownTurnover ─────────────────────────────────────────────────
      // A turnover we couldn't fully attribute. Attributes to the current
      // holder if there is one, else to the Unknown-Player sentinel.
      recordUnknownTurnover() {
        recordVia(get, set, state => {
          if (!canRecord(state, 'turnover-unknown')) return null
          return [{
            pointIndex: state.pointIndex,
            type:     'turnover-unknown',
            playerId: state.discHolder ?? UNKNOWN_PLAYER_ID,
            teamId:   state.possession,
          }]
        })
      },

      // ── triggerDefBlock ─────────────────────────────────────────────────────
      triggerDefBlock(type) {
        // Clear the preview — pick modes operate against live state.
        set({
          uiMode:         type === 'intercept' ? 'intercept-pick' : 'block-pick',
          showEventMenu:  false,
          truncateCursor: null,
        })
      },

      // ── undo ────────────────────────────────────────────────────────────────
      undo() {
        recordVia(get, set, undoInput, { uiMode: 'idle', selPuller: null })
      },

      // ── recordHalfTime / recordEndGame ──────────────────────────────────────
      recordHalfTime() {
        recordVia(get, set, bareEventInput('half-time'), { showEventMenu: false })
      },

      recordEndGame() {
        recordVia(get, set, bareEventInput('end-game'), { showEventMenu: false })
      },

      // ── triggerInjurySub ────────────────────────────────────────────────────
      // Injury subs skip the per-player tap and go straight to line selection,
      // so multiple players can be swapped at once. Clears the preview cursor
      // so the line confirmation lands on live state, not the historical view.
      triggerInjurySub() {
        set({ screen: 'line-selection', ...RESET_TRANSIENT_UI, isInjurySub: true })
      },

      // ── cancelPickMode ──────────────────────────────────────────────────────
      cancelPickMode() {
        set({ uiMode: 'idle' })
      },

      // ── nextPoint ────────────────────────────────────────────────────────────
      // Advance from terminal state (point-over / half-time) to line selection.
      nextPoint() {
        set({ screen: 'line-selection', ...RESET_TRANSIENT_UI })
      },

      // ── dismissPointSummary ──────────────────────────────────────────────────
      // Tap-to-continue from the point-completion screen. If the game is now
      // over (end-game already logged), return to live-entry so the game-over
      // banner shows; otherwise proceed to line selection for the next point.
      dismissPointSummary() {
        const { session } = get()
        const over = !!session && deriveGameState(session).gamePhase === 'game-over'
        set({ screen: over ? 'live-entry' : 'line-selection', ...RESET_TRANSIENT_UI })
      },

      // ── undoPointSummary ─────────────────────────────────────────────────────
      // Undo the just-scored goal from the point-completion screen and drop back
      // into live scoring to continue the point.
      undoPointSummary() {
        recordVia(get, set, undoInput, { uiMode: 'idle', selPuller: null, screen: 'live-entry' })
      },

      // ── resumeFromScore ──────────────────────────────────────────────────────
      // Resync after missing one or more points: set the score and hand the
      // disc to the offence team (the other team pulls the resumed point). If
      // the resumed span crosses the configured half-time threshold and no
      // half-time event exists yet, insert one first so ends-orientation + half
      // logic stay correct. Lands on line selection.
      resumeFromScore(scoreA, scoreB, offenceTeam) {
        const { session: target } = get()
        if (!target) return
        const state = deriveGameState(target)
        const { halfTimeAt } = target.gameConfig
        const events: RawEventInput[] = []
        const crossesHalf = scoreA >= halfTimeAt || scoreB >= halfTimeAt
        const halfAlready = target.rawLog.some(e => e.type === 'half-time')
        if (crossesHalf && !halfAlready) {
          events.push({ pointIndex: state.pointIndex, type: 'half-time' })
        }
        events.push({ pointIndex: state.pointIndex, type: 'score-resume', scoreA, scoreB, offenceTeam })
        set({ session: appendEvents(target, events), screen: 'line-selection', ...RESET_TRANSIENT_UI })
      },

      // ── editActiveLine ───────────────────────────────────────────────────────
      // Replace one team's on-field line mid-point (running-start backfill or a
      // remove-from-line correction). Emits an injury-sub only when the line
      // actually changed.
      editActiveLine(teamId, line) {
        recordVia(get, set, state => {
          if (!canRecord(state, 'injury-sub')) return null
          if (sameLine(line, state.activeLine[teamId].map(p => p.id))) return null
          return [{ pointIndex: state.pointIndex, type: 'injury-sub', teamId, line }]
        })
      },

      // ── backToGameList ───────────────────────────────────────────────────────
      // Returns to game-setup, preserving the session so it can be viewed again.
      backToGameList() {
        set({ screen: 'game-setup', ...RESET_TRANSIENT_UI })
      },

      // ── Stoppages ────────────────────────────────────────────────────────────
      recordFoul() {
        recordVia(get, set, bareEventInput('foul'), { showEventMenu: false })
      },

      recordPick() {
        recordVia(get, set, bareEventInput('pick'), { showEventMenu: false })
      },

      recordStall() {
        recordVia(get, set, holderTurnoverInput('turnover-stall'))
      },

      recordTimeout() {
        recordVia(get, set, bareEventInput('timeout'), { showEventMenu: false })
      },

      // ── recordVoiceEvents ────────────────────────────────────────────────────
      // The apply half of the voice review sheet (§ narration). Dry-runs the
      // whole batch — each event must pass canRecord against the state that
      // the previous ones produce — then commits in one append. A goal at the
      // end routes to point-summary exactly like recordGoal. Voice operates on
      // live state only, so any truncate preview is committed first (same
      // contract as recordVia).
      recordVoiceEvents(inputs) {
        const { session: target, truncateCursor } = get()
        if (!target || inputs.length === 0) return false

        const base = effectiveSession(target, truncateCursor)
        let probe = base
        for (const input of inputs) {
          if (!canRecord(deriveGameState(probe), input.type)) return false
          probe = appendEvents(probe, [input])
        }

        const head: RawEventInput[] = truncateCursor !== null
          ? [{ pointIndex: deriveGameState(base).pointIndex, type: 'truncate', truncateAfterId: truncateCursor }]
          : []
        const updated = appendEvents(target, [...head, ...inputs])
        const endsWithGoal = inputs[inputs.length - 1].type === 'goal'
        set({
          session: updated,
          truncateCursor: null,
          ...(endsWithGoal ? { screen: 'point-summary' as const } : {}),
        })
        return true
      },

      // ── Settings navigation ──────────────────────────────────────────────────
      openGameSettings() {
        set({ screen: 'game-settings', showEventMenu: false })
      },

      closeGameSettings() {
        set({ screen: 'game-setup' })
      },

      updateRecordingOption(key, value) {
        set(s => ({ recordingOptions: { ...s.recordingOptions, [key]: value } }))
      },

      // ── setShowEventMenu ─────────────────────────────────────────────────────
      setShowEventMenu(show) {
        set({ showEventMenu: show })
      },

      // ── setTruncateCursor ──────────────────────────────────────────────────
      // Move (or clear) the tap-to-truncate cursor. Dropping the puller
      // selection too — the previewed phase may not be awaiting-pull, and a
      // stale selPuller would record under the wrong team if the user then
      // taps Pull from the historical view.
      setTruncateCursor(cursor) {
        set({ truncateCursor: cursor, selPuller: null })
      },

      // ── toggleEndsSwapped ─────────────────────────────────────────────────
      toggleEndsSwapped() {
        set({ endsSwappedBaseline: !get().endsSwappedBaseline })
      },

      // ── Teams CRUD (all append-only) ───────────────────────────────────────
      // Every action funnels through `stampAndAppend` — never a direct
      // mutation. The returned id lets the caller wire fresh entities into
      // follow-up UI state (e.g. select a just-created team in a picker).

      addTeam(name, short, color) {
        const id = nextGlobalTeamId(get().teamsLog)
        set(s => ({ teamsLog: stampAndAppend(s.teamsLog, [buildAddTeam(id, name, short, color)]) }))
        return id
      },

      editTeam(teamId, patch) {
        set(s => ({ teamsLog: stampAndAppend(s.teamsLog, [buildEditTeam(teamId, patch)]) }))
      },

      archiveTeam(teamId) {
        set(s => ({ teamsLog: stampAndAppend(s.teamsLog, [buildArchiveTeam(teamId)]) }))
      },

      addPlayer(teamId, name, gender, extras) {
        const id = nextGlobalPlayerId(get().teamsLog)
        set(s => ({
          teamsLog: stampAndAppend(s.teamsLog, [buildAddPlayer(id, teamId, name, gender, extras ?? {})]),
        }))
        return id
      },

      editPlayer(playerId, patch) {
        set(s => ({ teamsLog: stampAndAppend(s.teamsLog, [buildEditPlayer(playerId, patch)]) }))
      },

      removePlayer(playerId) {
        set(s => ({ teamsLog: stampAndAppend(s.teamsLog, [buildRemovePlayer(playerId)]) }))
      },

      // ── Scheduled-games CRUD ───────────────────────────────────────────────

      addScheduledGame(args) {
        const id = nextGameId(get().scheduledGamesLog)
        set(s => ({
          scheduledGamesLog: stampAndAppend(s.scheduledGamesLog, [
            buildAddScheduledGame({ gameId: id, ...args }),
          ]),
        }))
        return id
      },

      editScheduledGame(gameId, patch) {
        set(s => ({
          scheduledGamesLog: stampAndAppend(s.scheduledGamesLog, [
            buildEditScheduledGame(gameId, patch),
          ]),
        }))
      },

      cancelScheduledGame(gameId) {
        set(s => ({
          scheduledGamesLog: stampAndAppend(s.scheduledGamesLog, [
            buildCancelScheduledGame(gameId),
          ]),
        }))
      },

      // ── Teams Manager navigation ───────────────────────────────────────────
      openTeamsManager() {
        set({ screen: 'teams-manager', showEventMenu: false })
      },
      closeTeamsManager() {
        set({ screen: 'game-setup' })
      },

      // ── Debug: reset all data ──────────────────────────────────────────────
      // Reseed teams + scheduled games, drop the current session, and bounce
      // to game-setup. The persist middleware writes the new state
      // out via partialize on the next tick, so a refresh after this lands on
      // a known-clean state. Useful when localStorage drifts from the demo
      // seed and the user can't recover via the UI.
      resetAllData() {
        const fresh = seedTeamsAndGames()
        set({
          session:           null,
          teamsLog:          fresh.teamEvents,
          scheduledGamesLog: fresh.gameEvents,
          screen:            'game-setup',
          ...RESET_TRANSIENT_UI,
        })
      },
    }),
    {
      // Versioned migrations, the defensive merge overlay, and hydration
      // logging all live in core/persistence.ts.
      name:    STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted, fromVersion) => migrateGameStore(persisted, fromVersion),
      merge:   (persisted, current) => mergeGameStore(persisted, current),
      onRehydrateStorage: () => (state, error) => logRehydrate(state, error),
      partialize: (state) => ({
        session:           state.session,
        scorerId:          state.scorerId,
        deviceId:          state.deviceId,
        teamsLog:          state.teamsLog,
        scheduledGamesLog: state.scheduledGamesLog,
        screen:            state.screen,
        isInjurySub:       state.isInjurySub,
        uiMode:            state.uiMode,
        selPuller:         state.selPuller,
        recordingOptions:  state.recordingOptions,
      }),
    },
  ),
)
