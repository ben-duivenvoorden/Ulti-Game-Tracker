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
  Notification,
  ScorerId,
  SegmentAnchor,
} from './types'
import { otherTeam, DEFAULT_RECORDING_OPTIONS } from './types'
import { newSegmentId, newScorerId } from './ids'
import {
  deriveGameState,
  canRecord,
  appendEvents,
  type RawEventInput,
} from './engine'
import { PICK_MODES, isPickMode } from './pickModes'
import { seedTeamsAndGames } from './data'
import type { TeamEvent, TeamEventInput, GlobalTeamId } from './teams/types'
import type { ScheduledGameEvent, ScheduledGameEventInput } from './games/types'
import { deriveTeamsState } from './teams/engine'
import { deriveScheduledGamesState, resolveGameConfig } from './games/engine'
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
  /** This device's stable scorer identity. Generated once on first boot and
   *  persisted; stamped onto every segment this device creates so the backend
   *  can attribute recordings. No auth — just a durable per-device handle. */
  scorerId: ScorerId
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
  /** Banner notification shown for transient feedback (mostly stoppage
   *  acks today). One at a time; auto-clears via setTimeout. */
  notification: Notification | null
  /** Manual baseline for the scorer's preferred orientation. The displayed
   *  `endsSwapped` is derived by `deriveEndsSwapped(baseline, visLog)` — the
   *  baseline contributes one term, each goal flips, each half-time may add
   *  one more flip. Toggled by the swap button in the Header. */
  endsSwappedBaseline: boolean

  // Game / session actions
  selectGame:        (gameId: number, pullingTeam: TeamId) => void
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
  backToGameList:    () => void

  // Recording actions (all funnel through canRecord guards)
  tapPlayer:            (player: Player) => void
  recordPull:           (bonus?: boolean) => void
  recordBrick:          () => void
  recordThrowAway:      () => void
  triggerReceiverError: () => void
  recordGoal:           () => void
  triggerDefBlock:      (type: 'block' | 'intercept') => void
  recordFoul:          () => void
  recordPick:          () => void
  recordStall:         () => void
  recordTimeout:       () => void
  undo:                () => void
  triggerHalfTime:     () => void
  triggerEndGame:      () => void
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

  // Notifications
  dismissNotification: () => void

  // ── Teams + scheduled games management (append-only) ──────────────────────
  // Every CRUD funnels through the appendTeam/Game helpers — never a direct
  // mutation. Return ids so the caller can wire them into follow-up state
  // (e.g. select the freshly-created team in a picker).
  addTeam:             (name: string, short: string, color: string) => GlobalTeamId
  editTeam:            (teamId: GlobalTeamId, patch: { name?: string; short?: string; color?: string }) => void
  archiveTeam:         (teamId: GlobalTeamId) => void
  addPlayer:           (
    teamId: GlobalTeamId,
    name: string,
    gender: 'M' | 'F',
    extras?: { jerseyNumber?: number; photoUrl?: string },
  ) => PlayerId
  editPlayer:          (
    playerId: PlayerId,
    patch: { name?: string; gender?: 'M' | 'F'; jerseyNumber?: number | null; photoUrl?: string | null },
  ) => void
  removePlayer:        (playerId: PlayerId) => void

  addScheduledGame:    (args: {
    name: string
    scheduledTime: string
    teamAGlobalId: GlobalTeamId
    teamBGlobalId: GlobalTeamId
    halfTimeAt: number
    scoreCapAt: number
  }) => number
  editScheduledGame:   (gameId: number, patch: {
    name?: string
    scheduledTime?: string
    teamAGlobalId?: GlobalTeamId
    teamBGlobalId?: GlobalTeamId
    halfTimeAt?: number
    scoreCapAt?: number
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

// ─── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_VERSION = 15
const STORAGE_KEY     = 'ugt-game'
/** Tagged at build time so hydration logs identify which bundle is running. */
const BUILD_MARKER    = 'ugt-build-2026-06-01-v15'

// ─── Initial seeds ────────────────────────────────────────────────────────────
// `seedTeamsAndGames()` produces deterministic id 1.. events; the same seed
// is consumed by the migration so v5 → v6 upgrades inherit the same world.

const INITIAL_SEED = seedTeamsAndGames()

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a fresh session for a given game by resolving the live teams + game
 *  logs. Returns null if the game is unknown or has been cancelled. */
function freshSession(
  gameId: number,
  pullingTeam: TeamId,
  scorerId: ScorerId,
  teamsLog: TeamEvent[],
  scheduledGamesLog: ScheduledGameEvent[],
  anchor?: SegmentAnchor,
): GameSession | null {
  const gamesState = deriveScheduledGamesState(scheduledGamesLog)
  const game = gamesState.gamesById.get(gameId)
  if (!game) return null
  const teamsState = deriveTeamsState(teamsLog)
  const config = resolveGameConfig(game, teamsState)
  return {
    gameConfig:           config,
    gameStartPullingTeam: pullingTeam,
    segment:              { segmentId: newSegmentId(), scorerId, createdAt: Date.now(), ...(anchor ? { anchor } : {}) },
    rawLog:               [],
  }
}

/** Append-only writer for the teams log. Mirrors `appendEvents` in engine.ts. */
function appendTeamEvents(log: TeamEvent[], inputs: TeamEventInput[]): TeamEvent[] {
  const startId = log.length === 0 ? 1 : log[log.length - 1].id + 1
  const ts = Date.now()
  const stamped: TeamEvent[] = inputs.map((e, i) => ({ ...e, id: startId + i, timestamp: ts } as TeamEvent))
  return [...log, ...stamped]
}

function appendScheduledGameEvents(
  log: ScheduledGameEvent[], inputs: ScheduledGameEventInput[],
): ScheduledGameEvent[] {
  const startId = log.length === 0 ? 1 : log[log.length - 1].id + 1
  const ts = Date.now()
  const stamped: ScheduledGameEvent[] = inputs.map((e, i) =>
    ({ ...e, id: startId + i, timestamp: ts } as ScheduledGameEvent))
  return [...log, ...stamped]
}

/** Next globally-unique GlobalTeamId — one past the max already in the log,
 *  including archived teams (we never reuse ids). */
function nextGlobalTeamId(log: TeamEvent[]): GlobalTeamId {
  let max = 0
  for (const e of log) {
    if (e.type === 'team-add' && e.teamId > max) max = e.teamId
  }
  return max + 1
}

/** Next globally-unique PlayerId — same reasoning. */
function nextGlobalPlayerId(log: TeamEvent[]): PlayerId {
  let max = 0
  for (const e of log) {
    if (e.type === 'player-add' && e.playerId > max) max = e.playerId
  }
  return max + 1
}

function nextGameId(log: ScheduledGameEvent[]): number {
  let max = 0
  for (const e of log) {
    if (e.type === 'game-add' && e.gameId > max) max = e.gameId
  }
  return max + 1
}

/** Default seed for the line-selection screen on a *fresh* point: first 4 males + 3 females. */
export function seedDefaultLine(roster: Player[]): Player[] {
  const males   = roster.filter(p => p.gender === 'M').slice(0, 4)
  const females = roster.filter(p => p.gender === 'F').slice(0, 3)
  return [...males, ...females]
}

function sameLine(a: PlayerId[], b: PlayerId[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

// Returns a session that looks as if it ended at the cursor. Used by
// canRecord-via-recordVia and useDerivedState so both the record decision
// and the on-screen state reflect the historical view.
export function effectiveSession(session: GameSession, cursor: EventId | null): GameSession {
  return cursor === null ? session : { ...session, rawLog: session.rawLog.filter(e => e.id <= cursor) }
}

// The session every recording control reads from. Kept as a wrapper so
// any future "draft session" shape (e.g. inline-amend preview) slots in
// without touching every call site.
export function activeSession(state: { session: GameSession | null }): GameSession | null {
  return state.session
}

// ─── Notification banner ──────────────────────────────────────────────────────
// Banner shown for transient feedback. Kept minimal — only an idle-timer
// reset helper for now; the notify() helper went away when copy/paste/edit
// did, since nothing else writes failure notifications today.

let notificationTimer: ReturnType<typeof setTimeout> | null = null

function clearNotificationTimer() {
  if (notificationTimer !== null) {
    clearTimeout(notificationTimer)
    notificationTimer = null
  }
}

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
  const { session, truncateCursor } = get()
  const target = activeSession({ session })
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
      teamsLog:          INITIAL_SEED.teamEvents,
      scheduledGamesLog: INITIAL_SEED.gameEvents,
      screen:            'game-setup',
      isInjurySub:       false,
      uiMode:            'idle',
      selPuller:         null,
      showEventMenu:     false,
      truncateCursor:    null,
      notification:      null,
      endsSwappedBaseline: false,
      recordingOptions:  DEFAULT_RECORDING_OPTIONS,

      // ── selectGame ──────────────────────────────────────────────────────────
      // Start a fresh game session (overwrites any existing one). Resolves
      // teams + rosters from the live teamsLog at the moment of creation —
      // subsequent reads via `resolveSession` re-resolve on every render.
      selectGame(gameId, pullingTeam) {
        const { teamsLog, scheduledGamesLog, scorerId } = get()
        const session = freshSession(gameId, pullingTeam, scorerId, teamsLog, scheduledGamesLog)
        if (!session) return
        set({
          session,
          screen:         'line-selection',
          isInjurySub:    false,
          uiMode:         'idle',
          selPuller:      null,
          showEventMenu:  false,
          truncateCursor: null,
        })
      },

      // ── startSegmentFromScore ─────────────────────────────────────────────────
      // Begin a new segment mid-game from a known score. The anchor is stored on
      // the segment (engine seeds score/possession/pointIndex from it), so the
      // log starts empty and the first point-start carries the correct global
      // point index. The non-offence team pulls the resumed point — hence
      // `gameStartPullingTeam = otherTeam(offence)`.
      startSegmentFromScore(gameId, scoreA, scoreB, offence) {
        const { teamsLog, scheduledGamesLog, scorerId } = get()
        const session = freshSession(
          gameId, otherTeam(offence), scorerId, teamsLog, scheduledGamesLog,
          { scoreA, scoreB, offence },
        )
        if (!session) return
        set({
          session,
          screen:         'line-selection',
          isInjurySub:    false,
          uiMode:         'idle',
          selPuller:      null,
          showEventMenu:  false,
          truncateCursor: null,
        })
      },

      // ── forkSegment ───────────────────────────────────────────────────────────
      // Adopt the current recording as my own new segment. The prefix is copied
      // verbatim (event ids stay — they're unique per segment), the segment gets
      // a fresh id + this device's scorerId + a parent pointer, and the anchor
      // (if any) carries over so the engine seeds the same origin.
      forkSegment() {
        const { session, scorerId } = get()
        if (!session) return
        const forked: GameSession = {
          ...session,
          segment: {
            segmentId:       newSegmentId(),
            scorerId,
            createdAt:       Date.now(),
            parentSegmentId: session.segment.segmentId,
            ...(session.segment.anchor ? { anchor: session.segment.anchor } : {}),
          },
          rawLog: [...session.rawLog],
        }
        set({
          session:        forked,
          screen:         'live-entry',
          isInjurySub:    false,
          uiMode:         'idle',
          selPuller:      null,
          showEventMenu:  false,
          truncateCursor: null,
        })
      },

      // ── resumeGame ──────────────────────────────────────────────────────────
      // Continue an in-progress game without resetting the log.
      // (For now, requires that the persisted session matches the gameId —
      //  later this will fetch from a server.)
      resumeGame(gameId) {
        const { session } = get()
        if (session && session.gameConfig.id === gameId) {
          set({ screen: 'live-entry', uiMode: 'idle', selPuller: null, showEventMenu: false })
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
        const { session, isInjurySub } = get()
        const target = activeSession({ session })
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
        const { session, uiMode, truncateCursor } = get()
        const target = activeSession({ session })
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
          if (get().recordingOptions.passes === false) return
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

      // ── recordPull ──────────────────────────────────────────────────────────
      recordPull(bonus = false) {
        const { selPuller } = get()
        if (!selPuller) return
        recordVia(get, set, state => {
          if (!canRecord(state, 'pull')) return null
          const pullingTeam = otherTeam(state.possession)
          return [{
            pointIndex: state.pointIndex,
            type:     bonus ? 'pull-bonus' : 'pull',
            playerId: selPuller,
            teamId:   pullingTeam,
          }]
        }, { selPuller: null })
      },

      // ── recordBrick ─────────────────────────────────────────────────────────
      // Pull went out of bounds. Receiving team takes the disc at the brick
      // mark — engine-wise this transitions to in-play just like pull, the
      // difference is purely the recorded event type (for stats / reporting).
      recordBrick() {
        const { selPuller } = get()
        if (!selPuller) return
        recordVia(get, set, state => {
          if (!canRecord(state, 'brick')) return null
          const pullingTeam = otherTeam(state.possession)
          return [{
            pointIndex: state.pointIndex,
            type:     'brick',
            playerId: selPuller,
            teamId:   pullingTeam,
          }]
        }, { selPuller: null })
      },

      // ── recordThrowAway ─────────────────────────────────────────────────────
      recordThrowAway() {
        recordVia(get, set, state => {
          if (!canRecord(state, 'turnover-throw-away') || !state.discHolder) return null
          return [{
            pointIndex: state.pointIndex,
            type:     'turnover-throw-away',
            playerId: state.discHolder,
            teamId:   state.possession,
          }]
        })
      },

      // ── triggerReceiverError ────────────────────────────────────────────────
      // Records receiver error directly against the current holder — the
      // recorder doesn't need to pick a player. Mental model: the recorder
      // taps the player who was the intended receiver (recording a
      // possession), then taps Receiver Error to mark it as a drop.
      triggerReceiverError() {
        recordVia(get, set, state => {
          if (!canRecord(state, 'turnover-receiver-error') || !state.discHolder) return null
          return [{
            pointIndex: state.pointIndex,
            type:     'turnover-receiver-error',
            playerId: state.discHolder,
            teamId:   state.possession,
          }]
        })
      },

      // ── recordGoal ──────────────────────────────────────────────────────────
      // Records the goal only. Half-time / end-game suggestions are surfaced
      // via the `useSuggestedTransition` selector (see selectors.ts) and
      // confirmed by the recorder on the LineSelection screen — the app no
      // longer auto-emits these structural events from inside recordGoal.
      recordGoal() {
        recordVia(get, set, state => {
          if (!canRecord(state, 'goal') || !state.discHolder) return null
          return [{
            pointIndex: state.pointIndex,
            type:     'goal',
            playerId: state.discHolder,
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
        recordVia(
          get, set,
          state => [{ pointIndex: state.pointIndex, type: 'undo' }],
          { uiMode: 'idle', selPuller: null },
        )
      },

      // ── triggerHalfTime / triggerEndGame ────────────────────────────────────
      triggerHalfTime() {
        recordVia(
          get, set,
          state => canRecord(state, 'half-time')
            ? [{ pointIndex: state.pointIndex, type: 'half-time' }]
            : null,
          { showEventMenu: false },
        )
      },

      triggerEndGame() {
        recordVia(
          get, set,
          state => canRecord(state, 'end-game')
            ? [{ pointIndex: state.pointIndex, type: 'end-game' }]
            : null,
          { showEventMenu: false },
        )
      },

      // ── triggerInjurySub ────────────────────────────────────────────────────
      // Injury subs skip the per-player tap and go straight to line selection,
      // so multiple players can be swapped at once. Clears the preview cursor
      // so the line confirmation lands on live state, not the historical view.
      triggerInjurySub() {
        set({
          screen:         'line-selection',
          isInjurySub:    true,
          showEventMenu:  false,
          uiMode:         'idle',
          truncateCursor: null,
        })
      },

      // ── cancelPickMode ──────────────────────────────────────────────────────
      cancelPickMode() {
        set({ uiMode: 'idle' })
      },

      // ── nextPoint ────────────────────────────────────────────────────────────
      // Advance from terminal state (point-over / half-time) to line selection.
      nextPoint() {
        set({
          screen:         'line-selection',
          isInjurySub:    false,
          uiMode:         'idle',
          selPuller:      null,
          showEventMenu:  false,
          truncateCursor: null,
        })
      },

      // ── backToGameList ───────────────────────────────────────────────────────
      // Returns to game-setup, preserving the session so it can be viewed again.
      backToGameList() {
        set({
          screen:         'game-setup',
          uiMode:         'idle',
          selPuller:      null,
          showEventMenu:  false,
          isInjurySub:    false,
          truncateCursor: null,
        })
      },

      // ── recordFoul / recordPick ──────────────────────────────────────────────
      recordFoul() {
        recordVia(
          get, set,
          state => canRecord(state, 'foul')
            ? [{ pointIndex: state.pointIndex, type: 'foul' }]
            : null,
          { showEventMenu: false },
        )
      },

      recordPick() {
        recordVia(
          get, set,
          state => canRecord(state, 'pick')
            ? [{ pointIndex: state.pointIndex, type: 'pick' }]
            : null,
          { showEventMenu: false },
        )
      },

      recordStall() {
        recordVia(get, set, state => {
          if (!canRecord(state, 'turnover-stall') || !state.discHolder) return null
          return [{
            pointIndex: state.pointIndex,
            type:     'turnover-stall',
            playerId: state.discHolder,
            teamId:   state.possession,
          }]
        })
      },

      recordTimeout() {
        recordVia(
          get, set,
          state => canRecord(state, 'timeout')
            ? [{ pointIndex: state.pointIndex, type: 'timeout' }]
            : null,
          { showEventMenu: false },
        )
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

      // ── dismissNotification ────────────────────────────────────────────────
      dismissNotification() {
        clearNotificationTimer()
        set({ notification: null })
      },


      // ── Teams CRUD (all append-only) ───────────────────────────────────────
      // Every action funnels through `appendTeamEvents` — never a direct
      // mutation. The returned id lets the caller wire fresh entities into
      // follow-up UI state (e.g. select a just-created team in a picker).

      addTeam(name, short, color) {
        const id = nextGlobalTeamId(get().teamsLog)
        set(s => ({ teamsLog: appendTeamEvents(s.teamsLog, [buildAddTeam(id, name, short, color)]) }))
        return id
      },

      editTeam(teamId, patch) {
        set(s => ({ teamsLog: appendTeamEvents(s.teamsLog, [buildEditTeam(teamId, patch)]) }))
      },

      archiveTeam(teamId) {
        set(s => ({ teamsLog: appendTeamEvents(s.teamsLog, [buildArchiveTeam(teamId)]) }))
      },

      addPlayer(teamId, name, gender, extras) {
        const id = nextGlobalPlayerId(get().teamsLog)
        set(s => ({
          teamsLog: appendTeamEvents(s.teamsLog, [buildAddPlayer(id, teamId, name, gender, extras ?? {})]),
        }))
        return id
      },

      editPlayer(playerId, patch) {
        set(s => ({ teamsLog: appendTeamEvents(s.teamsLog, [buildEditPlayer(playerId, patch)]) }))
      },

      removePlayer(playerId) {
        set(s => ({ teamsLog: appendTeamEvents(s.teamsLog, [buildRemovePlayer(playerId)]) }))
      },

      // ── Scheduled-games CRUD ───────────────────────────────────────────────

      addScheduledGame(args) {
        const id = nextGameId(get().scheduledGamesLog)
        set(s => ({
          scheduledGamesLog: appendScheduledGameEvents(s.scheduledGamesLog, [
            buildAddScheduledGame({ gameId: id, ...args }),
          ]),
        }))
        return id
      },

      editScheduledGame(gameId, patch) {
        set(s => ({
          scheduledGamesLog: appendScheduledGameEvents(s.scheduledGamesLog, [
            buildEditScheduledGame(gameId, patch),
          ]),
        }))
      },

      cancelScheduledGame(gameId) {
        set(s => ({
          scheduledGamesLog: appendScheduledGameEvents(s.scheduledGamesLog, [
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
      // Reseed teams + scheduled games, drop the current session + edit mode,
      // and bounce to game-setup. The persist middleware writes the new state
      // out via partialize on the next tick, so a refresh after this lands on
      // a known-clean state. Useful when localStorage drifts from the demo
      // seed and the user can't recover via the UI.
      resetAllData() {
        const fresh = seedTeamsAndGames()
        clearNotificationTimer()
        set({
          session:           null,
          teamsLog:          fresh.teamEvents,
          scheduledGamesLog: fresh.gameEvents,
          screen:            'game-setup',
          isInjurySub:       false,
          uiMode:            'idle',
          selPuller:         null,
          showEventMenu:     false,
          truncateCursor:    null,
          notification:      null,
        })
      },
    }),
    {
      name:    STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted, fromVersion) => {
        const obj = persisted as {
          recordingOptions?:   Partial<RecordingOptions>
          session?:            ({ rawLog?: Array<{ type: string }>; segment?: unknown } & Record<string, unknown>) | null
          scorerId?:           ScorerId
          screen?:             AppScreen
          teamsLog?:           TeamEvent[]
          scheduledGamesLog?:  ScheduledGameEvent[]
        }
        // v5 was the breaking point for the event log: anything older is
        // dropped on hydration. v5 → v10 history is preserved in git; the
        // notable later step is v10 → v11 below.
        const dropping = fromVersion < 5
        const teamsLogMissing = !Array.isArray(obj.teamsLog) || obj.teamsLog.length === 0
        const gamesLogMissing = !Array.isArray(obj.scheduledGamesLog) || obj.scheduledGamesLog.length === 0
        const needsSeed = fromVersion < 10 || teamsLogMissing || gamesLogMissing
        const seed = needsSeed ? seedTeamsAndGames() : null

        // v10 → v11: `reorder-line` was dropped from the event-type union.
        // Strip any legacy entries from the persisted rawLog so the live
        // engine never sees a now-unknown event type.
        const session = dropping ? null : (obj.session ?? null)
        const cleanedSession = (session && Array.isArray(session.rawLog) && fromVersion < 11)
          ? { ...session, rawLog: session.rawLog.filter(e => e.type !== 'reorder-line') }
          : session

        // v12 → v13: `passArrowsShown` was removed from RecordingOptions
        // (the visible-passes count is now hardcoded to 2 in the notation
        // component). Strip it from any persisted recordingOptions blob so
        // the type and the in-memory state stay aligned.
        const rawRecOpts = (obj.recordingOptions ?? {}) as Record<string, unknown>
        const { passArrowsShown: _passArrowsShown, ...recOptsNoLegacy } = rawRecOpts
        void _passArrowsShown

        // v14 → v15: segment identity. Every device gets a stable `scorerId`,
        // and any in-progress session is backfilled with a `segment` so the
        // engine and sync layer always see the new shape. A backfilled segment
        // has no anchor — it's treated as a from-the-start recording.
        const scorerId = obj.scorerId ?? newScorerId()
        const sessionWithSegment = (cleanedSession && !cleanedSession.segment)
          ? { ...cleanedSession, segment: { segmentId: newSegmentId(), scorerId, createdAt: Date.now() } }
          : cleanedSession

        console.info('[ugt-game] migrate', {
          build: BUILD_MARKER,
          fromVersion,
          teamsLogMissing,
          gamesLogMissing,
          reseeded: needsSeed,
          strippedReorderLine: cleanedSession !== session,
          strippedPassArrowsShown: 'passArrowsShown' in rawRecOpts,
          backfilledSegment: sessionWithSegment !== cleanedSession,
          mintedScorerId: !obj.scorerId,
        })
        return {
          ...obj,
          session:           sessionWithSegment,
          scorerId,
          screen:            dropping ? 'game-setup'    : (obj.screen ?? 'game-setup'),
          teamsLog:          seed ? seed.teamEvents : obj.teamsLog!,
          scheduledGamesLog: seed ? seed.gameEvents : obj.scheduledGamesLog!,
          recordingOptions:  { ...DEFAULT_RECORDING_OPTIONS, ...recOptsNoLegacy },
        }
      },
      partialize: (state) => ({
        session:           state.session,
        scorerId:          state.scorerId,
        teamsLog:          state.teamsLog,
        scheduledGamesLog: state.scheduledGamesLog,
        screen:            state.screen,
        isInjurySub:       state.isInjurySub,
        uiMode:            state.uiMode,
        selPuller:         state.selPuller,
        recordingOptions:  state.recordingOptions,
      }),
      // Defensive overlay. The default merge lets `{ teamsLog: [] }` from a
      // corrupted localStorage clobber the seeded initial state — which is
      // exactly what manifested as "no teams, no games" after the v8 build.
      // Treat empty / missing / malformed logs in the persisted payload as
      // "fall back to INITIAL_SEED directly" so the user can never boot into
      // an empty list, no matter what's in localStorage.
      //
      // Falls back to INITIAL_SEED rather than `current.teamsLog` because
      // some bundlers can pass a stale `current` here under HMR; reading the
      // module-level seed constant short-circuits that whole class of bug.
      merge: (persisted, current) => {
        const c = current as GameStore
        if (!persisted || typeof persisted !== 'object' || Array.isArray(persisted)) {
          console.warn('[ugt-game] merge: persisted state is missing/invalid — falling back to seed')
          return { ...c, teamsLog: INITIAL_SEED.teamEvents, scheduledGamesLog: INITIAL_SEED.gameEvents }
        }
        const p = persisted as Partial<GameStore>
        const teamsLog = (Array.isArray(p.teamsLog) && p.teamsLog.length > 0)
          ? p.teamsLog
          : INITIAL_SEED.teamEvents
        const scheduledGamesLog = (Array.isArray(p.scheduledGamesLog) && p.scheduledGamesLog.length > 0)
          ? p.scheduledGamesLog
          : INITIAL_SEED.gameEvents
        console.info('[ugt-game] merge', {
          build: BUILD_MARKER,
          persistedTeamsLogLen:  Array.isArray(p.teamsLog) ? p.teamsLog.length : 'n/a',
          persistedGamesLogLen:  Array.isArray(p.scheduledGamesLog) ? p.scheduledGamesLog.length : 'n/a',
          resultTeamsLogLen:     teamsLog.length,
          resultGamesLogLen:     scheduledGamesLog.length,
        })
        // Shallow-merge recordingOptions so new fields added to
        // DEFAULT_RECORDING_OPTIONS post-launch are always present even
        // when the persisted snapshot predates them. (Without this, a
        // raw `...p` spread overwrites the seeded defaults with the
        // older partial.)
        const recordingOptions = {
          ...DEFAULT_RECORDING_OPTIONS,
          ...(p.recordingOptions ?? {}),
        }
        return { ...c, ...p, teamsLog, scheduledGamesLog, recordingOptions }
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[ugt-game] hydration error', { build: BUILD_MARKER, error })
          return
        }
        console.info('[ugt-game] hydrated', {
          build:           BUILD_MARKER,
          teamsLogLen:     state?.teamsLog?.length ?? 0,
          gamesLogLen:     state?.scheduledGamesLog?.length ?? 0,
          hasSession:      !!state?.session,
        })
      },
    },
  ),
)
