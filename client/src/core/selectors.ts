import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGameStore, effectiveSession } from './store'
import { computeVisLog, deriveGameState } from './engine'
import { deriveTeamsState } from './teams/engine'
import { deriveScheduledGamesState, resolveGameConfig } from './games/engine'
import type { DerivedGameState, VisLogEntry, GameSession, RecordingOptions, EventId, Notification } from './types'
import type { TeamsState } from './teams/types'
import type { ScheduledGame, ScheduledGameEvent } from './games/types'
import type { TeamEvent } from './teams/types'
import { DEFAULT_RECORDING_OPTIONS } from './types'

// ─── Teams + scheduled games (derived from the append-only logs) ──────────────

export function useTeamsLog(): TeamEvent[] {
  return useGameStore(s => s.teamsLog)
}

export function useScheduledGamesLog(): ScheduledGameEvent[] {
  return useGameStore(s => s.scheduledGamesLog)
}

export function useTeamsState(): TeamsState {
  const log = useTeamsLog()
  return useMemo(() => deriveTeamsState(log), [log])
}

export function useScheduledGames(): ScheduledGame[] {
  const log = useScheduledGamesLog()
  return useMemo(() => deriveScheduledGamesState(log).games, [log])
}

// ─── Session resolution ──────────────────────────────────────────────────────
// Replaces the old `MOCK_GAMES.find` trick — `resolveSession` re-resolves the
// gameConfig's teams + rosters from the live teams state on every read, so
// roster edits flow into existing sessions without a session-shape migration.
//
// The active line is then derived from rawLog + this fresh roster, so the
// recording UI picks up updated names / photos automatically.

function resolveSessionWith(session: GameSession, teamsState: TeamsState, scheduledGames: ScheduledGame[]): GameSession {
  const game = scheduledGames.find(g => g.id === session.gameConfig.id)
  if (!game) {
    // Game has been cancelled / removed from the log — fall back to the stale
    // gameConfig we have. The session was already created against it, so it's
    // still internally consistent for replay purposes.
    return session
  }
  const fresh = resolveGameConfig(game, teamsState)
  return { ...session, gameConfig: fresh }
}

// Single subscription to the session — re-derives only when session reference changes.
//
export function useSession(): GameSession | null {
  const stored = useGameStore(s => s.session)
  const teamsState = useTeamsState()
  const scheduledGames = useScheduledGames()
  return useMemo(
    () => (stored ? resolveSessionWith(stored, teamsState, scheduledGames) : null),
    [stored, teamsState, scheduledGames],
  )
}

export function useNotification(): Notification | null {
  return useGameStore(s => s.notification)
}

export function useDerivedState(): DerivedGameState | null {
  const session = useSession()
  const cursor  = useTruncateCursor()
  return useMemo(() => {
    if (!session) return null
    return deriveGameState(effectiveSession(session, cursor))
  }, [session, cursor])
}

// LogDrawer needs the full visible log so it can render greyed entries past
// the cursor. Filter at the call site if you need the cursor-aware view.
export function useVisLog(): VisLogEntry[] {
  const session = useSession()
  return useMemo(() => (session ? computeVisLog(session.rawLog) : []), [session])
}

export function useTruncateCursor(): EventId | null {
  return useGameStore(s => s.truncateCursor)
}

// ─── Action accessor ──────────────────────────────────────────────────────────
// Auto-derived from the store: every function on GameStore is exposed.
// No hand-maintained list = no drift when actions are added/renamed.

type StoreShape = ReturnType<typeof useGameStore.getState>
type GameActions = {
  [K in keyof StoreShape as StoreShape[K] extends (...args: never[]) => unknown ? K : never]: StoreShape[K]
}

function pickActions(s: StoreShape): GameActions {
  const out: Record<string, unknown> = {}
  for (const k in s) {
    const v = s[k as keyof StoreShape]
    if (typeof v === 'function') out[k] = v
  }
  return out as GameActions
}

export function useGameActions(): GameActions {
  return useGameStore(useShallow(pickActions))
}

export function useRecordingOptions(): RecordingOptions {
  const stored = useGameStore(s => s.recordingOptions)
  // Merge with defaults so newly-added option fields don't crash callers when the
  // in-memory state is stale (e.g. across HMR reloads before storage rehydrate).
  return {
    ...DEFAULT_RECORDING_OPTIONS,
    ...(stored ?? {}),
    gameMode:  stored?.gameMode  ?? DEFAULT_RECORDING_OPTIONS.gameMode,
    lineRatio: stored?.lineRatio ?? DEFAULT_RECORDING_OPTIONS.lineRatio,
  }
}

export function useUiState() {
  return useGameStore(useShallow(s => ({
    screen:        s.screen,
    uiMode:        s.uiMode,
    selPuller:     s.selPuller,
    isInjurySub:   s.isInjurySub,
    showEventMenu: s.showEventMenu,
  })))
}

// ─── Suggested transitions ────────────────────────────────────────────────────
// Half-time / end-game are no longer auto-emitted on goal — instead, the app
// surfaces a suggestion when the current score crosses the configured
// threshold and no corresponding event is already in the log. The recorder
// confirms or dismisses via banner controls on LineSelection (see F7).
//
// Returns null when there's nothing to suggest. End-game wins over half-time
// when both apply (a game-ending goal at the cap shouldn't propose half-time).

export type SuggestedTransition = 'half-time' | 'end-game'

export function useSuggestedTransition(): SuggestedTransition | null {
  const session = useSession()
  const state   = useDerivedState()
  const visLog  = useVisLog()
  return useMemo(() => {
    if (!session || !state) return null
    if (state.gamePhase === 'game-over') return null
    const { scoreCapAt, halfTimeAt } = session.gameConfig
    if (state.score.A >= scoreCapAt || state.score.B >= scoreCapAt) {
      if (!visLog.some(e => e.type === 'end-game')) return 'end-game'
    }
    const total = state.score.A + state.score.B
    if (total >= halfTimeAt) {
      if (!visLog.some(e => e.type === 'half-time')) return 'half-time'
    }
    return null
  }, [session, state, visLog])
}
