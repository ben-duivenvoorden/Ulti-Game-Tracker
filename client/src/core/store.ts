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
  RawEvent,
  Notification,
  EditModeState,
} from './types'
import type { PillSize } from '@/screens/LiveEntry/Canvas/constants'
import { PILL_SIZE_CYCLE } from '@/screens/LiveEntry/Canvas/constants'
import { otherTeam, DEFAULT_RECORDING_OPTIONS } from './types'
import {
  deriveGameState,
  computeVisLog,
  canRecord,
  appendEvents,
  validateSpliceBlock,
  nextEventId,
  resolveLogForDerivation,
  type RawEventInput,
} from './engine'
import { PICK_MODES, isPickMode } from './pickModes'
import { seedTeamsAndGames } from './data'
import { buildEnvelope, serialize, tryParse } from './clipboard'
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
  /** When true, Team A and Team B render on opposite sides of the screen.
   *  Per-device display preference — never goes on the wire. */
  swapSides: boolean
  /** Player pill size — per-device display preference. */
  pillSize: PillSize
  /** Per-device visual reorder of pills on the canvas — never goes on the wire.
   *  Each value is the preferred player-id order for that team. Stale ids
   *  (players no longer on the field) are filtered out at apply-time; the
   *  engine's `activeLine` order remains authoritative for any id not present
   *  here. See `applyLineOverride`. */
  lineOrderOverride: Record<TeamId, PlayerId[]>

  // Transient (not persisted)
  showEventMenu: boolean
  /** Cursor for the tap-to-truncate preview. null = live mode; otherwise the
   *  eventId after which entries are greyed in the log and the canvas
   *  reflects the state at that point. Cleared the moment new activity is
   *  recorded — the action prepends a `truncate` event so the dropped tail
   *  is committed atomically with whatever the user did next. */
  truncateCursor: EventId | null
  /** Banner notification shown for copy/paste/edit-commit feedback. One at a
   *  time; auto-clears via setTimeout. */
  notification: Notification | null
  /** Active edit-mode session (post-game splice rewrite). Recording controls
   *  operate on draftSession via the useSession selector. */
  editMode: EditModeState | null

  // Game / session actions
  selectGame:        (gameId: number, pullingTeam: TeamId) => void
  resumeGame:        (gameId: number) => void
  confirmLine:       (lineA: Player[], lineB: Player[]) => void
  nextPoint:         () => void
  backToGameList:    () => void
  reorderActiveLine: (teamId: TeamId, fromIdx: number, toIdx: number) => void
  swapLineSlots:     (teamId: TeamId, i: number, j: number) => void

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
  toggleSwapSides:     () => void
  cyclePillSize:       () => void
  setTruncateCursor:   (cursor: EventId | null) => void

  // Notifications
  dismissNotification: () => void

  // Copy / paste
  copySliceToClipboard:  (fromId: EventId, toId: EventId) => Promise<void>
  copyEventsToClipboard: (ids: EventId[]) => Promise<void>
  pasteFromClipboard:    (afterEventId: EventId) => Promise<void>

  // Edit mode
  beginEdit:    () => void
  setEditRange: (fromId: EventId, toId: EventId) => void
  commitEdit:   () => void
  cancelEdit:   () => void

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

const STORAGE_VERSION = 10
const STORAGE_KEY     = 'ust-game'
/** Tagged at build time so hydration logs identify which bundle is running. */
const BUILD_MARKER    = 'ust-build-2026-05-11-v10'

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
  teamsLog: TeamEvent[],
  scheduledGamesLog: ScheduledGameEvent[],
): GameSession | null {
  const gamesState = deriveScheduledGamesState(scheduledGamesLog)
  const game = gamesState.gamesById.get(gameId)
  if (!game) return null
  const teamsState = deriveTeamsState(teamsLog)
  const config = resolveGameConfig(game, teamsState)
  return {
    gameConfig:           config,
    gameStartPullingTeam: pullingTeam,
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

/** Apply a per-device visual order to the engine's `activeLine`. Override
 *  entries that are no longer on the field are silently dropped; engine
 *  entries not present in the override appear at the end in engine order.
 *  This way the override degrades gracefully across line changes
 *  (injury subs, new points) without needing explicit invalidation. */
export function applyLineOverride(engineLine: PlayerId[], override: PlayerId[]): PlayerId[] {
  if (override.length === 0) return engineLine
  const inEngine = new Set(engineLine)
  const ordered  = override.filter(id => inEngine.has(id))
  const inOverride = new Set(ordered)
  const newcomers = engineLine.filter(id => !inOverride.has(id))
  return [...ordered, ...newcomers]
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

// The session every recording control reads from. When edit mode is active,
// the controls operate on the draft instead of the real session — this is the
// single glue point that lets the entire stat-recording UI work in edit mode
// for free.
export function activeSession(state: { session: GameSession | null; editMode: EditModeState | null }): GameSession | null {
  if (state.editMode?.active) return state.editMode.draftSession
  return state.session
}

// ─── Notification banner ──────────────────────────────────────────────────────

const SUCCESS_TTL_MS = 3500
const FAILURE_TTL_MS = 6000

let notificationTimer: ReturnType<typeof setTimeout> | null = null

function clearNotificationTimer() {
  if (notificationTimer !== null) {
    clearTimeout(notificationTimer)
    notificationTimer = null
  }
}

function notify(
  set: (partial: Partial<GameStore>) => void,
  kind: 'success' | 'failure',
  message: string,
  detail?: string,
): void {
  clearNotificationTimer()
  const ttl = kind === 'success' ? SUCCESS_TTL_MS : FAILURE_TTL_MS
  set({ notification: { kind, message, detail, expiresAt: Date.now() + ttl } })
  notificationTimer = setTimeout(() => {
    notificationTimer = null
    useGameStore.setState({ notification: null })
  }, ttl)
}

// Per-event-type count over a slice — feeds the success-banner detail line.
function summariseEvents(events: RawEvent[]): string {
  const counts = new Map<string, number>()
  for (const e of events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1)
  const labels: Record<string, string> = {
    'point-start': 'point-start',
    'pull': 'pull',
    'pull-bonus': 'pull-bonus',
    'brick': 'brick',
    'possession': 'possession',
    'turnover-throw-away': 'throw away',
    'turnover-receiver-error': 'receiver error',
    'turnover-stall': 'stall',
    'block': 'block',
    'intercept': 'intercept',
    'goal': 'goal',
    'injury-sub': 'injury sub',
    'reorder-line': 'reorder',
    'half-time': 'half-time',
    'end-game': 'end-game',
    'foul': 'foul',
    'pick': 'pick',
    'timeout': 'timeout',
    'system': 'note',
    'undo': 'undo',
    'amend': 'amend',
    'truncate': 'truncate',
    'splice-block': 'splice',
  }
  const parts: string[] = []
  for (const [type, n] of counts) {
    const label = labels[type] ?? type
    parts.push(n === 1 ? `1 ${label}` : `${n} ${label}s`)
  }
  return parts.join(', ')
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
  const { session, editMode, truncateCursor } = get()
  const target = activeSession({ session, editMode })
  if (!target) return false
  const state = deriveGameState(effectiveSession(target, truncateCursor))
  const events = build(state)
  if (!events || events.length === 0) return false
  const head: RawEventInput[] = truncateCursor !== null
    ? [{ pointIndex: state.pointIndex, type: 'truncate', truncateAfterId: truncateCursor }]
    : []
  const updated = appendEvents(target, [...head, ...events])
  if (editMode?.active) {
    set({
      editMode: { ...editMode, draftSession: updated },
      truncateCursor: null,
      ...extra,
    })
  } else {
    set({
      session: updated,
      truncateCursor: null,
      ...extra,
    })
  }
  return true
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      // Initial state
      session:           null,
      teamsLog:          INITIAL_SEED.teamEvents,
      scheduledGamesLog: INITIAL_SEED.gameEvents,
      screen:            'game-setup',
      isInjurySub:       false,
      uiMode:            'idle',
      selPuller:         null,
      showEventMenu:     false,
      truncateCursor:    null,
      notification:      null,
      editMode:          null,
      recordingOptions:  DEFAULT_RECORDING_OPTIONS,
      swapSides:         false,
      pillSize:          'md',
      lineOrderOverride: { A: [], B: [] },

      // ── selectGame ──────────────────────────────────────────────────────────
      // Start a fresh game session (overwrites any existing one). Resolves
      // teams + rosters from the live teamsLog at the moment of creation —
      // subsequent reads via `resolveSession` re-resolve on every render.
      selectGame(gameId, pullingTeam) {
        const { teamsLog, scheduledGamesLog } = get()
        const session = freshSession(gameId, pullingTeam, teamsLog, scheduledGamesLog)
        if (!session) return
        set({
          session,
          screen:         'line-selection',
          isInjurySub:    false,
          uiMode:         'idle',
          selPuller:      null,
          showEventMenu:  false,
          truncateCursor: null,
          editMode:       null,
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
        const { session, editMode, isInjurySub } = get()
        const target = activeSession({ session, editMode })
        if (!target) return

        const state = deriveGameState(target)
        const idsA  = lineA.map(p => p.id)
        const idsB  = lineB.map(p => p.id)

        const writeBack = (next: GameSession): Partial<GameStore> =>
          editMode?.active
            ? { editMode: { ...editMode, draftSession: next } }
            : { session: next }

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
            ...writeBack(events.length === 0 ? target : appendEvents(target, events)),
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
          ...writeBack(updated),
          screen:    'live-entry',
          uiMode:    'idle',
          selPuller: null,
        })
      },

      // ── tapPlayer ───────────────────────────────────────────────────────────
      tapPlayer(player) {
        const { session, editMode, uiMode, truncateCursor } = get()
        const target = activeSession({ session, editMode })
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
            // Receiver Error can't be the thrower — guard against UI bypass
            if (onTap.eventType === 'turnover-receiver-error' && player.id === s.discHolder) return null
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

        // Pass chain: tap = possession transfer
        if (state.gamePhase === 'in-play') {
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
      triggerReceiverError() {
        const { session, editMode } = get()
        const target = activeSession({ session, editMode })
        if (!target) return
        // Pick modes are tied to live state's holder/possession; entering one
        // while previewing would point at stale players. Drop the preview so
        // the pick reflects what's actually on the field.
        const state = deriveGameState(target)
        if (!canRecord(state, 'turnover-receiver-error') || !state.discHolder) return
        set({
          uiMode:         'receiver-error-pick',
          showEventMenu:  false,
          truncateCursor: null,
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

      // ── reorderActiveLine ────────────────────────────────────────────────────
      // Reorders the on-field display order for a team. Per-device visual
      // preference only — never written to the rawLog or sent on the wire.
      reorderActiveLine(teamId, fromIdx, toIdx) {
        if (fromIdx === toIdx) return
        const { session, editMode, truncateCursor, lineOrderOverride } = get()
        const target = activeSession({ session, editMode })
        if (!target) return
        const state = deriveGameState(effectiveSession(target, truncateCursor))
        const engineLine = state.activeLine[teamId].map(p => p.id)
        const effective = applyLineOverride(engineLine, lineOrderOverride[teamId])
        if (fromIdx < 0 || fromIdx >= effective.length || toIdx < 0 || toIdx >= effective.length) return
        const next = [...effective]
        const [moved] = next.splice(fromIdx, 1)
        next.splice(toIdx, 0, moved)
        set({ lineOrderOverride: { ...lineOrderOverride, [teamId]: next } })
      },

      // ── swapLineSlots ────────────────────────────────────────────────────────
      // Swap two players' positions in a team's on-field line. Used by the
      // canvas drag-onto-pill interaction. Per-device visual preference only —
      // never written to the rawLog or sent on the wire.
      swapLineSlots(teamId, i, j) {
        if (i === j) return
        const { session, editMode, truncateCursor, lineOrderOverride } = get()
        const target = activeSession({ session, editMode })
        if (!target) return
        const state = deriveGameState(effectiveSession(target, truncateCursor))
        const engineLine = state.activeLine[teamId].map(p => p.id)
        const effective = applyLineOverride(engineLine, lineOrderOverride[teamId])
        if (i < 0 || i >= effective.length || j < 0 || j >= effective.length) return
        const next = [...effective]
        const tmp = next[i]
        next[i] = next[j]
        next[j] = tmp
        set({ lineOrderOverride: { ...lineOrderOverride, [teamId]: next } })
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
          editMode:       null,
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

      // ── toggleSwapSides ──────────────────────────────────────────────────────
      // Flip which physical side of the screen each team renders on. Per-device
      // display preference — used when teams swap ends or the scorer walks
      // around to the other touchline. Not synced over the wire.
      toggleSwapSides() {
        set(s => ({ swapSides: !s.swapSides }))
      },

      // ── cyclePillSize ───────────────────────────────────────────────────────
      // Cycle through small / medium / large pill sizes. Per-device display
      // preference — what feels right for thumbs / screen size.
      cyclePillSize() {
        set(s => ({ pillSize: PILL_SIZE_CYCLE[s.pillSize] }))
      },

      // ── setTruncateCursor ──────────────────────────────────────────────────
      // Move (or clear) the tap-to-truncate cursor. Dropping the puller
      // selection too — the previewed phase may not be awaiting-pull, and a
      // stale selPuller would record under the wrong team if the user then
      // taps Pull from the historical view.
      setTruncateCursor(cursor) {
        set({ truncateCursor: cursor, selPuller: null })
      },

      // ── dismissNotification ────────────────────────────────────────────────
      dismissNotification() {
        clearNotificationTimer()
        set({ notification: null })
      },

      // ── copySliceToClipboard ───────────────────────────────────────────────
      // Slice session.rawLog over [fromId..toId] and write a UST envelope to
      // the system clipboard. Structural events are stripped at envelope-build.
      async copySliceToClipboard(fromId, toId) {
        const { session } = get()
        if (!session) return
        const lo = Math.min(fromId, toId)
        const hi = Math.max(fromId, toId)
        const slice = session.rawLog.filter(e => e.id >= lo && e.id <= hi)
        const env = buildEnvelope(session.gameConfig.id, slice)
        if (env.events.length === 0) {
          notify(set, 'failure', 'Nothing to copy', 'Range had no copyable events')
          return
        }
        try {
          await navigator.clipboard.writeText(serialize(env))
        } catch {
          notify(set, 'failure', 'Clipboard unavailable', 'Browser blocked clipboard write')
          return
        }
        notify(set, 'success', `Copied ${env.events.length} events`, summariseEvents(env.events))
      },

      // ── copyEventsToClipboard ──────────────────────────────────────────────
      // Pick the named ids out of session.rawLog (preserving log order) and
      // write a UST envelope to the system clipboard. Selection may be
      // non-contiguous; paste validation handles continuity at the destination.
      async copyEventsToClipboard(ids) {
        const { session } = get()
        if (!session) return
        const wanted = new Set(ids)
        const slice = session.rawLog.filter(e => wanted.has(e.id))
        const env = buildEnvelope(session.gameConfig.id, slice)
        if (env.events.length === 0) {
          notify(set, 'failure', 'Nothing to copy', 'Selection had no copyable events')
          return
        }
        try {
          await navigator.clipboard.writeText(serialize(env))
        } catch {
          notify(set, 'failure', 'Clipboard unavailable', 'Browser blocked clipboard write')
          return
        }
        notify(set, 'success', `Copied ${env.events.length} events`, summariseEvents(env.events))
      },

      // ── pasteFromClipboard ─────────────────────────────────────────────────
      // Read the system clipboard, parse a UST envelope, validate continuity,
      // and commit the splice on the live session. No raw-log write on
      // rejection — the failure banner explains why.
      async pasteFromClipboard(afterEventId) {
        const { session, editMode } = get()
        const target = activeSession({ session, editMode })
        if (!target) return
        let text: string
        try {
          text = await navigator.clipboard.readText()
        } catch {
          notify(set, 'failure', 'Clipboard unavailable', 'Browser blocked clipboard read')
          return
        }
        const env = tryParse(text)
        if (!env) {
          notify(set, 'failure', "Clipboard isn't a UST log slice")
          return
        }
        if (env.gameId !== target.gameConfig.id) {
          notify(set, 'failure', 'Clipboard is from a different game')
          return
        }

        // Layout the freshly-allocated ids: inner events first, then wrapper,
        // then provenance row. Future nextEventId reads the rawLog tail (the
        // provenance row), so the inner events being below the wrapper id
        // means later appends never collide with them.
        const startId    = nextEventId(target)
        const ts = Date.now()
        const prefixState = deriveGameState({
          ...target,
          rawLog: target.rawLog.filter(e => e.id <= afterEventId),
        })
        const inner: RawEvent[] = env.events.map((e, i) => ({
          ...e,
          id: startId + i,
          timestamp: ts,
          pointIndex: prefixState.pointIndex,
        } as RawEvent))
        const wrapperId = startId + inner.length
        const systemId  = wrapperId + 1

        const wrapper: RawEvent = {
          id: wrapperId,
          timestamp: ts,
          pointIndex: prefixState.pointIndex,
          type: 'splice-block',
          afterEventId,
          removeFromId: null,
          removeToId:   null,
          events: inner,
        }
        const provenance: RawEvent = {
          id: systemId,
          timestamp: ts,
          pointIndex: prefixState.pointIndex,
          type: 'system',
          text: `Pasted ${inner.length} events from #${env.fromEventId}–#${env.toEventId}`,
        }

        const result = validateSpliceBlock(target, wrapper as RawEvent & { type: 'splice-block' })
        if (!result.ok) {
          notify(set, 'failure', 'Cannot paste', result.reason)
          return
        }

        const updated: GameSession = { ...target, rawLog: [...target.rawLog, wrapper, provenance] }
        if (editMode?.active) {
          set({ editMode: { ...editMode, draftSession: updated }, truncateCursor: null })
        } else {
          set({ session: updated, truncateCursor: null })
        }
        notify(set, 'success', `Pasted ${inner.length} events`, summariseEvents(inner))
      },

      // ── beginEdit ──────────────────────────────────────────────────────────
      // Snapshot the live session as baseline; clone for draft. Recording
      // controls operate against draftSession via the activeSession router.
      beginEdit() {
        const { session } = get()
        if (!session) return
        const draft: GameSession = { ...session, rawLog: [...session.rawLog] }
        set({
          editMode: {
            active:          true,
            baselineSession: session,
            draftSession:    draft,
            removeFromId:    null,
            removeToId:      null,
            draftEvents:     [],
          },
          screen:         'live-entry',
          truncateCursor: null,
          uiMode:         'idle',
          selPuller:      null,
          showEventMenu:  false,
        })
      },

      // ── setEditRange ───────────────────────────────────────────────────────
      // Mark the range to replace. The draft retains the full baseline rawLog
      // and gets a synthetic truncate appended at id baselineMaxId+1 to drop
      // every entry from removeFromId onward. This way the canvas reflects
      // state at the splice point, fresh events get ids starting at
      // baselineMaxId+2 (no collisions with baseline), and at commit time
      // the fresh tail is everything in draftResolved with id > baselineMaxId.
      setEditRange(fromId, toId) {
        const { editMode } = get()
        if (!editMode?.active) return
        const lo = Math.min(fromId, toId)
        const hi = Math.max(fromId, toId)
        const baseline = editMode.baselineSession
        const resolved = resolveLogForDerivation(baseline.rawLog)
        const fromIdx = resolved.findIndex(e => e.id === lo)
        if (fromIdx === -1) {
          notify(set, 'failure', 'Edit range: start id not in resolved log')
          return
        }
        const idBefore = fromIdx === 0 ? 0 : resolved[fromIdx - 1].id
        const baselineMaxId = baseline.rawLog.length === 0 ? 0 : baseline.rawLog[baseline.rawLog.length - 1].id
        const truncateEv: RawEvent = {
          id: baselineMaxId + 1,
          timestamp: Date.now(),
          pointIndex: 0,
          type: 'truncate',
          truncateAfterId: idBefore,
        }
        set({
          editMode: {
            ...editMode,
            draftSession: { ...baseline, rawLog: [...baseline.rawLog, truncateEv] },
            removeFromId: lo,
            removeToId:   hi,
            draftEvents:  [],
          },
          truncateCursor: null,
          selPuller:      null,
        })
      },

      // ── commitEdit ─────────────────────────────────────────────────────────
      // Build a splice-block from the fresh-recorded tail of draftSession,
      // validate against baseline, and commit on baseline. Rejection keeps
      // editMode active so the user can fix and retry.
      commitEdit() {
        const { editMode } = get()
        if (!editMode?.active) return
        if (editMode.removeFromId === null || editMode.removeToId === null) {
          notify(set, 'failure', 'Select a range first')
          return
        }
        const baseline = editMode.baselineSession
        const baselineMaxId = baseline.rawLog.length === 0 ? 0 : baseline.rawLog[baseline.rawLog.length - 1].id
        // Resolved fresh tail: events recorded after edit-mode opened, with
        // structural noise (undo/truncate during edit) already collapsed.
        const draftResolved = computeVisLog(editMode.draftSession.rawLog)
        const inner: RawEvent[] = draftResolved.filter(e => e.id > baselineMaxId) as RawEvent[]

        // Find anchor in baseline's resolved log.
        const baselineResolved = computeVisLog(baseline.rawLog)
        const fromIdx = baselineResolved.findIndex(e => e.id === editMode.removeFromId)
        const toIdx   = baselineResolved.findIndex(e => e.id === editMode.removeToId)
        if (fromIdx === -1 || toIdx === -1 || fromIdx === 0) {
          notify(set, 'failure', 'Invalid range')
          return
        }
        const afterEventId = baselineResolved[fromIdx - 1].id

        // Renumber inner events with fresh ids continuing from baseline. Same
        // layout as paste: inner first, wrapper next, provenance last.
        const startId = nextEventId(baseline)
        const ts = Date.now()
        const renumberedInner: RawEvent[] = inner.map((e, i) => ({
          ...e,
          id: startId + i,
          timestamp: ts,
        } as RawEvent))
        const wrapperId = startId + renumberedInner.length
        const systemId  = wrapperId + 1

        const wrapper: RawEvent = {
          id: wrapperId,
          timestamp: ts,
          pointIndex: 0,
          type: 'splice-block',
          afterEventId,
          removeFromId: editMode.removeFromId,
          removeToId:   editMode.removeToId,
          events: renumberedInner,
        }

        const result = validateSpliceBlock(baseline, wrapper as RawEvent & { type: 'splice-block' })
        if (!result.ok) {
          notify(set, 'failure', 'Cannot commit edit', result.reason)
          return
        }

        const summary = summariseEvents(renumberedInner)
        const provenanceText =
          renumberedInner.length === 0
            ? `Deleted events #${editMode.removeFromId}–#${editMode.removeToId} (edit mode)`
            : `Replaced events #${editMode.removeFromId}–#${editMode.removeToId} with ${renumberedInner.length} new events (edit mode)`

        const provenance: RawEvent = {
          id: systemId,
          timestamp: ts,
          pointIndex: 0,
          type: 'system',
          text: provenanceText,
        }
        const updated: GameSession = { ...baseline, rawLog: [...baseline.rawLog, wrapper, provenance] }
        set({
          session: updated,
          editMode: null,
          truncateCursor: null,
        })
        notify(set, 'success', renumberedInner.length === 0 ? 'Edit committed (delete)' : 'Edit committed', summary || provenanceText)
      },

      // ── cancelEdit ─────────────────────────────────────────────────────────
      cancelEdit() {
        set({ editMode: null, truncateCursor: null, selPuller: null, uiMode: 'idle' })
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
          editMode:          null,
          notification:      null,
          lineOrderOverride: { A: [], B: [] },
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
          session?:            unknown
          screen?:             AppScreen
          teamsLog?:           TeamEvent[]
          scheduledGamesLog?:  ScheduledGameEvent[]
        }
        // v4 changed PlayerId / EventId from string to number; v5 derived
        // activeLine from rawLog and reshaped point-start / injury-sub events.
        // Both transitions are not back-compatible at the event level, so any
        // session predating v5 is dropped and the user starts fresh.
        const dropping = fromVersion < 5
        // v5 → v6 introduced teamsLog / scheduledGamesLog.
        // v6 → v7 swapped the demo seed (BUML 2026-05-11 + real Lizards /
        // Gooselings rosters; AUDL + Championship removed).
        // v7 → v8 forced a re-seed for any payload still carrying the
        // pre-trim demo data.
        // v8 → v9 again forces a re-seed AND treats empty-array logs (not
        // just missing) as needing fresh seed — covered a corruption mode
        // where a mid-flight write left empty arrays in localStorage at a
        // current-version stamp, blocking the older migration from ever
        // firing again. Any user-added teams / scheduled games on a pre-v9
        // payload are dropped on purpose — no production users yet.
        const teamsLogMissing = !Array.isArray(obj.teamsLog) || obj.teamsLog.length === 0
        const gamesLogMissing = !Array.isArray(obj.scheduledGamesLog) || obj.scheduledGamesLog.length === 0
        const needsSeed = fromVersion < 10 || teamsLogMissing || gamesLogMissing
        const seed = needsSeed ? seedTeamsAndGames() : null
        console.info('[ust-game] migrate', {
          build: BUILD_MARKER,
          fromVersion,
          teamsLogMissing,
          gamesLogMissing,
          reseeded: needsSeed,
        })
        return {
          ...obj,
          session:           dropping ? null            : (obj.session ?? null),
          screen:            dropping ? 'game-setup'    : (obj.screen ?? 'game-setup'),
          teamsLog:          seed ? seed.teamEvents : obj.teamsLog!,
          scheduledGamesLog: seed ? seed.gameEvents : obj.scheduledGamesLog!,
          recordingOptions:  { ...DEFAULT_RECORDING_OPTIONS, ...(obj.recordingOptions ?? {}) },
        }
      },
      partialize: (state) => ({
        session:           state.session,
        teamsLog:          state.teamsLog,
        scheduledGamesLog: state.scheduledGamesLog,
        screen:            state.screen,
        isInjurySub:       state.isInjurySub,
        uiMode:            state.uiMode,
        selPuller:         state.selPuller,
        recordingOptions:  state.recordingOptions,
        swapSides:         state.swapSides,
        pillSize:          state.pillSize,
        lineOrderOverride: state.lineOrderOverride,
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
          console.warn('[ust-game] merge: persisted state is missing/invalid — falling back to seed')
          return { ...c, teamsLog: INITIAL_SEED.teamEvents, scheduledGamesLog: INITIAL_SEED.gameEvents }
        }
        const p = persisted as Partial<GameStore>
        const teamsLog = (Array.isArray(p.teamsLog) && p.teamsLog.length > 0)
          ? p.teamsLog
          : INITIAL_SEED.teamEvents
        const scheduledGamesLog = (Array.isArray(p.scheduledGamesLog) && p.scheduledGamesLog.length > 0)
          ? p.scheduledGamesLog
          : INITIAL_SEED.gameEvents
        console.info('[ust-game] merge', {
          build: BUILD_MARKER,
          persistedTeamsLogLen:  Array.isArray(p.teamsLog) ? p.teamsLog.length : 'n/a',
          persistedGamesLogLen:  Array.isArray(p.scheduledGamesLog) ? p.scheduledGamesLog.length : 'n/a',
          resultTeamsLogLen:     teamsLog.length,
          resultGamesLogLen:     scheduledGamesLog.length,
        })
        return { ...c, ...p, teamsLog, scheduledGamesLog }
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[ust-game] hydration error', { build: BUILD_MARKER, error })
          return
        }
        console.info('[ust-game] hydrated', {
          build:           BUILD_MARKER,
          teamsLogLen:     state?.teamsLog?.length ?? 0,
          gamesLogLen:     state?.scheduledGamesLog?.length ?? 0,
          hasSession:      !!state?.session,
        })
      },
    },
  ),
)
