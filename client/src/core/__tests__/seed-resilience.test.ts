// Guards the "no teams, no games" failure mode: localStorage that's
// missing, empty, malformed, or pinned at an old version must never leave
// the store with empty teamsLog or scheduledGamesLog.

import { describe, it, expect, beforeEach } from 'vitest'
import { seedTeamsAndGames } from '../data'

describe('seedTeamsAndGames', () => {
  it('produces non-empty teams + games events', () => {
    const seed = seedTeamsAndGames()
    expect(seed.teamEvents.length).toBeGreaterThan(0)
    expect(seed.gameEvents.length).toBeGreaterThan(0)
  })

  it('every team-add has a unique teamId', () => {
    const seed = seedTeamsAndGames()
    const ids = seed.teamEvents
      .filter(e => e.type === 'team-add')
      .map(e => (e as { teamId: number }).teamId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every player-add references an added team', () => {
    const seed = seedTeamsAndGames()
    const teamIds = new Set(
      seed.teamEvents
        .filter(e => e.type === 'team-add')
        .map(e => (e as { teamId: number }).teamId),
    )
    for (const e of seed.teamEvents) {
      if (e.type === 'player-add') {
        expect(teamIds.has((e as { teamId: number }).teamId)).toBe(true)
      }
    }
  })

  it('every scheduled game references added teams', () => {
    const seed = seedTeamsAndGames()
    const teamIds = new Set(
      seed.teamEvents
        .filter(e => e.type === 'team-add')
        .map(e => (e as { teamId: number }).teamId),
    )
    for (const e of seed.gameEvents) {
      if (e.type === 'game-add') {
        const g = e as { teamAGlobalId: number; teamBGlobalId: number }
        expect(teamIds.has(g.teamAGlobalId)).toBe(true)
        expect(teamIds.has(g.teamBGlobalId)).toBe(true)
      }
    }
  })

  it('first scheduled game is BUML 2026-05-11 (intentional top-of-list)', () => {
    const seed = seedTeamsAndGames()
    const adds = seed.gameEvents.filter(e => e.type === 'game-add') as Array<{ name: string }>
    expect(adds[0].name).toBe('BUML 2026-05-11')
  })

  it('AUDL Summer Series and Championship are NOT in the seed', () => {
    const seed = seedTeamsAndGames()
    const names = seed.gameEvents
      .filter(e => e.type === 'game-add')
      .map(e => (e as { name: string }).name)
    expect(names).not.toContain('AUDL Summer Series')
    expect(names).not.toContain('Championship')
  })
})

// ─── Hydration resilience (end-to-end through the store) ─────────────────────
// Exercises the persist middleware's migrate + merge for every corruption mode
// we've seen — empty arrays, missing keys, old versions, malformed JSON.

const STORAGE_KEY = 'ugt-game'

// Minimal localStorage stub — vitest runs node-side, so we have to provide
// one ourselves before the store module loads.
interface LocalStorageStub {
  store: Map<string, string>
  getItem: (k: string) => string | null
  setItem: (k: string, v: string) => void
  removeItem: (k: string) => void
  clear: () => void
  readonly length: number
  key: (i: number) => string | null
}
function makeLocalStorage(): LocalStorageStub {
  const store = new Map<string, string>()
  return {
    store,
    getItem:    (k) => (store.has(k) ? store.get(k)! : null),
    setItem:    (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
    clear:      () => { store.clear() },
    get length() { return store.size },
    key:        (i) => Array.from(store.keys())[i] ?? null,
  }
}

async function resetStoreModule(): Promise<typeof import('../store')> {
  // Vitest caches modules; we need a fresh import each time so persist
  // hydrates against the current localStorage state.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { vi } = (await import('vitest')) as any
  vi.resetModules()
  return await import('../store') as typeof import('../store')
}

declare global {
  var localStorage: LocalStorageStub
}

describe('persist hydration resilience', () => {
  beforeEach(() => {
    globalThis.localStorage = makeLocalStorage()
  })

  it('fresh install (no localStorage) — store boots seeded', async () => {
    const { useGameStore } = await resetStoreModule()
    const s = useGameStore.getState()
    expect(s.teamsLog.length).toBeGreaterThan(0)
    expect(s.scheduledGamesLog.length).toBeGreaterThan(0)
  })

  it('empty arrays in localStorage — merge falls back to seed', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      state:   { teamsLog: [], scheduledGamesLog: [] },
      version: 10,
    }))
    const { useGameStore } = await resetStoreModule()
    const s = useGameStore.getState()
    expect(s.teamsLog.length).toBeGreaterThan(0)
    expect(s.scheduledGamesLog.length).toBeGreaterThan(0)
  })

  it('missing keys in localStorage — merge falls back to seed', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      state:   { recordingOptions: {} },
      version: 10,
    }))
    const { useGameStore } = await resetStoreModule()
    const s = useGameStore.getState()
    expect(s.teamsLog.length).toBeGreaterThan(0)
    expect(s.scheduledGamesLog.length).toBeGreaterThan(0)
  })

  it('old version in localStorage — migrate reseeds', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      state:   { teamsLog: [{ id: 1, timestamp: 0, type: 'team-add', teamId: 99, name: 'Old', short: 'O', color: '#000' }], scheduledGamesLog: [] },
      version: 7,
    }))
    const { useGameStore } = await resetStoreModule()
    const s = useGameStore.getState()
    // Old version's teamsLog had just one team-add; after migrate we get the
    // full seed (4 team-adds + their player-adds).
    const teamAdds = s.teamsLog.filter(e => e.type === 'team-add')
    expect(teamAdds.length).toBeGreaterThan(1)
  })

  it('malformed JSON in localStorage — store falls back to seed', async () => {
    localStorage.setItem(STORAGE_KEY, 'this is not JSON')
    const { useGameStore } = await resetStoreModule()
    const s = useGameStore.getState()
    expect(s.teamsLog.length).toBeGreaterThan(0)
    expect(s.scheduledGamesLog.length).toBeGreaterThan(0)
  })

  it('persisted as null — store falls back to seed', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: null, version: 10 }))
    const { useGameStore } = await resetStoreModule()
    const s = useGameStore.getState()
    expect(s.teamsLog.length).toBeGreaterThan(0)
    expect(s.scheduledGamesLog.length).toBeGreaterThan(0)
  })
})
