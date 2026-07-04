// ─── Persistence ──────────────────────────────────────────────────────────────
// Everything about how the store survives reloads: storage key + version, the
// initial seed, version migrations, the defensive merge overlay, and hydration
// logging. `store.ts` wires these into zustand's `persist` config — no live
// store logic lives here, and nothing here reads the store.

import type { AppScreen, RecordingOptions, ScorerId, DeviceId } from './types'
import { DEFAULT_RECORDING_OPTIONS } from './types'
import { newSegmentId, newScorerId, newDeviceId } from './ids'
import {
  seedTeamsAndGames, competitionInputs, parityTeamInputs, parityGameInput,
  BUML_COMPETITION_ID, PARITY_COMPETITION_ID,
} from './data'
import type { TeamEvent } from './teams/types'
import type { ScheduledGameEvent } from './games/types'

export const STORAGE_VERSION = 20
export const STORAGE_KEY     = 'ugt-game'
/** Tagged at build time so hydration logs identify which bundle is running. */
export const BUILD_MARKER    = 'ugt-build-2026-07-04-v20'

// `seedTeamsAndGames()` produces deterministic id 1.. events; the same seed
// is consumed by the migration so old upgrades inherit the same world.
export const INITIAL_SEED = seedTeamsAndGames()

// ─── Migration ────────────────────────────────────────────────────────────────

export function migrateGameStore(persisted: unknown, fromVersion: number) {
  const obj = persisted as {
    recordingOptions?:   Partial<RecordingOptions>
    session?:            ({ rawLog?: Array<{ type: string }>; segment?: { deviceId?: DeviceId } & Record<string, unknown> } & Record<string, unknown>) | null
    scorerId?:           ScorerId
    deviceId?:           DeviceId
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

  // v14 → v15: `lineSize` moved onto RecordingOptions (the competition-
  // config layer). Derive it from the existing lineRatio sum for any
  // persisted blob that predates the field so the line target matches
  // what the user previously configured. `scorerInfo` rides the default
  // merge below (missing → '').
  const mergedRecOpts = { ...DEFAULT_RECORDING_OPTIONS, ...recOptsNoLegacy } as RecordingOptions
  if (fromVersion < 15 && typeof recOptsNoLegacy.lineSize !== 'number') {
    mergedRecOpts.lineSize = mergedRecOpts.lineRatio.M + mergedRecOpts.lineRatio.F
  }

  // v15 → v16: segment identity. Every device gets a stable `scorerId`,
  // and any in-progress session is backfilled with a `segment` so the
  // engine and sync layer always see the new shape. A backfilled segment
  // has no anchor — it's treated as a from-the-start recording. (Both
  // guards are structural, so this is safe regardless of fromVersion.)
  const scorerId = obj.scorerId ?? newScorerId()
  const sessionWithSegment = (cleanedSession && !cleanedSession.segment)
    ? { ...cleanedSession, segment: { segmentId: newSegmentId(), scorerId, createdAt: Date.now() } }
    : cleanedSession

  // v16 → v17: device identity joins the writer key. Mint a stable
  // `deviceId` for this device and backfill any existing segment that
  // predates the field (a v16 segment has no `deviceId`). Structural —
  // safe regardless of fromVersion.
  const deviceId = obj.deviceId ?? newDeviceId()
  const sessionWithDevice = (sessionWithSegment && sessionWithSegment.segment && !sessionWithSegment.segment.deviceId)
    ? { ...sessionWithSegment, segment: { ...sessionWithSegment.segment, deviceId } }
    : sessionWithSegment

  // v17 → v18: `amend` / `splice-block` / `system` left the event-type
  // union when the copy/paste/edit-log feature was removed (phase-
  // boundary cleanup). Strip any legacy entries from the persisted
  // rawLog so the live engine never sees a now-unknown event type.
  const deadTypes = ['amend', 'splice-block', 'system']
  const sessionV18 = (sessionWithDevice && Array.isArray(sessionWithDevice.rawLog) && fromVersion < 18)
    ? { ...sessionWithDevice, rawLog: sessionWithDevice.rawLog.filter(e => !deadTypes.includes(e.type)) }
    : sessionWithDevice

  // v18 → v19: purely additive — `spokenAliases` joined the player events
  // (teams log) and the derived GlobalPlayer defaults it to []. No rewrite
  // needed; old events simply lack the optional field.

  // v19 → v20: competitions joined the scheduled-games log, the Empire vs
  // Breeze demo fixture left the seed, the Brisbane Parity League demo
  // arrived, and pull-distance-bonus flipped to a default-off modification.
  // Already-populated logs are patched append-only: drop the seeded Empire
  // vs Breeze events, add the two competitions, tag the seeded BUML fixture,
  // and add the parity teams + fixture. Seed events are identifiable by
  // their stamp (timestamp 0); user-created games can never have taken the
  // seeded ids (allocation is max+1 past the seed).
  let teamsLogV20 = seed ? seed.teamEvents : obj.teamsLog!
  let gamesLogV20 = seed ? seed.gameEvents : obj.scheduledGamesLog!
  let patchedV20 = false
  if (fromVersion < 20 && !seed) {
    const seededEmpire = gamesLogV20.some(e => e.type === 'game-add' && e.gameId === 1 && e.timestamp === 0)
    const gamesLog = seededEmpire
      ? gamesLogV20.filter(e => e.type === 'competition-add' || e.gameId !== 1)
      : [...gamesLogV20]
    let nextGameEvId = gamesLog.reduce((m, e) => Math.max(m, e.id), 0) + 1

    if (!gamesLog.some(e => e.type === 'competition-add')) {
      for (const input of competitionInputs()) {
        gamesLog.push({ ...input, id: nextGameEvId++, timestamp: 0 } as ScheduledGameEvent)
      }
    }

    const bumlSeeded = gamesLog.some(e => e.type === 'game-add' && e.gameId === 5 && e.timestamp === 0)
    const bumlTagged = gamesLog.some(e =>
      (e.type === 'game-add' || e.type === 'game-edit') && e.gameId === 5 && e.competitionId !== undefined)
    if (bumlSeeded && !bumlTagged) {
      gamesLog.push({ type: 'game-edit', gameId: 5, competitionId: BUML_COMPETITION_ID, id: nextGameEvId++, timestamp: 0 })
    }

    if (!gamesLog.some(e => e.type === 'game-add' && e.competitionId === PARITY_COMPETITION_ID)) {
      const teamsLog = [...teamsLogV20]
      const baldGid  = teamsLog.reduce((m, e) => Math.max(m, e.type === 'team-add' ? e.teamId : 0), 0) + 1
      const youngGid = baldGid + 1
      const firstPid = teamsLog.reduce((m, e) => Math.max(m, e.type === 'player-add' ? e.playerId : 0), 0) + 1
      let nextTeamEvId = teamsLog.reduce((m, e) => Math.max(m, e.id), 0) + 1
      for (const input of parityTeamInputs(baldGid, youngGid, firstPid)) {
        teamsLog.push({ ...input, id: nextTeamEvId++, timestamp: 0 } as TeamEvent)
      }
      const parityGameId = gamesLog.reduce((m, e) => Math.max(m, e.type === 'game-add' ? e.gameId : 0), 0) + 1
      gamesLog.push({ ...parityGameInput(parityGameId, baldGid, youngGid), id: nextGameEvId++, timestamp: 0 } as ScheduledGameEvent)
      teamsLogV20 = teamsLog
    }

    gamesLogV20 = gamesLog
    patchedV20 = true
  }
  // The default flipped to off; competitions now decide it per game on
  // selection, so any persisted `true` is stale competition config.
  if (fromVersion < 20) mergedRecOpts.pullBonus = false

  console.info('[ugt-game] migrate', {
    build: BUILD_MARKER,
    fromVersion,
    teamsLogMissing,
    gamesLogMissing,
    reseeded: needsSeed,
    strippedReorderLine: cleanedSession !== session,
    strippedPassArrowsShown: 'passArrowsShown' in rawRecOpts,
    derivedLineSize: mergedRecOpts.lineSize,
    backfilledSegment: sessionWithSegment !== cleanedSession,
    backfilledDeviceId: sessionWithDevice !== sessionWithSegment,
    strippedDeadEventTypes: sessionV18 !== sessionWithDevice,
    patchedCompetitionsV20: patchedV20,
    mintedScorerId: !obj.scorerId,
    mintedDeviceId: !obj.deviceId,
  })
  return {
    ...obj,
    session:           sessionV18,
    scorerId,
    deviceId,
    screen:            dropping ? 'game-setup'    : (obj.screen ?? 'game-setup'),
    teamsLog:          teamsLogV20,
    scheduledGamesLog: gamesLogV20,
    recordingOptions:  mergedRecOpts,
  }
}

// ─── Defensive merge ──────────────────────────────────────────────────────────
// The default merge lets `{ teamsLog: [] }` from a corrupted localStorage
// clobber the seeded initial state — which is exactly what manifested as
// "no teams, no games" after the v8 build. Treat empty / missing / malformed
// logs in the persisted payload as "fall back to INITIAL_SEED directly" so
// the user can never boot into an empty list, no matter what's in
// localStorage.
//
// Falls back to INITIAL_SEED rather than `current.teamsLog` because some
// bundlers can pass a stale `current` here under HMR; reading the
// module-level seed constant short-circuits that whole class of bug.

interface MergeBase {
  teamsLog:          TeamEvent[]
  scheduledGamesLog: ScheduledGameEvent[]
  recordingOptions:  RecordingOptions
}

export function mergeGameStore<S extends MergeBase>(persisted: unknown, current: S): S {
  if (!persisted || typeof persisted !== 'object' || Array.isArray(persisted)) {
    console.warn('[ugt-game] merge: persisted state is missing/invalid — falling back to seed')
    return { ...current, teamsLog: INITIAL_SEED.teamEvents, scheduledGamesLog: INITIAL_SEED.gameEvents }
  }
  const p = persisted as Partial<S>
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
  return { ...current, ...p, teamsLog, scheduledGamesLog, recordingOptions }
}

// ─── Hydration logging ────────────────────────────────────────────────────────

export function logRehydrate(
  state: { teamsLog?: TeamEvent[]; scheduledGamesLog?: ScheduledGameEvent[]; session?: unknown } | undefined,
  error?: unknown,
): void {
  if (error) {
    console.error('[ugt-game] hydration error', { build: BUILD_MARKER, error })
    return
  }
  console.info('[ugt-game] hydrated', {
    build:       BUILD_MARKER,
    teamsLogLen: state?.teamsLog?.length ?? 0,
    gamesLogLen: state?.scheduledGamesLog?.length ?? 0,
    hasSession:  !!state?.session,
  })
}
