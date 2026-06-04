# Ulti Game Tracker — web app

The mobile-first SPA scorers use on the sideline. Ships to **`/app`** on the combined site (see the root `README.md` for the big picture and deployment).

## Stack

- **React 19 + TypeScript** (strict) + **Vite**
- **Tailwind v4** via `@tailwindcss/vite` — design tokens live in `src/index.css` under `@theme`
- **Zustand v5** with `persist` middleware — the store holds an append-only `rawLog` plus transient UI state
- **Vitest** for tests
- Path alias: `@` → `src/` (`vite.config.ts` + `tsconfig`)

## Architecture

`session.rawLog` is the single source of truth for game history. `deriveGameState(session)` (`core/engine.ts`) is a **pure function** over the log — the store never stores derived state like the score, phase, or active line. Game phases are derived; `canRecord(state, eventType)` is the single guard for every recording action.

```
src/
  core/
    types.ts        domain types + the RawEvent union
    engine.ts       deriveGameState · step · canRecord · log resolution (undo/amend/truncate/splice)
    store.ts        Zustand store + persist (STORAGE_VERSION + migrate)
    sync.ts         best-effort one-way log → /api/events (per-segment cursor; noop if VITE_API_BASE_URL unset)
    games/          scheduled-games append-only log
    teams/          teams + rosters append-only log
    selectors.ts · format.ts · contrast.ts · serverLog.ts · wire.ts · data.ts · …
  screens/          GameSetup · NewGame · GameSettings · TeamsManager · LineSelection · LiveEntry · PointSummary
  components/ui/    Btn · Chip · Label · Icons   (+ MomentBackdrop · PromptSheet · ConfirmSheet)
```

Adding a new event type touches three files: `types.ts` (union + interface), `engine.ts` (`step` + `canRecord`), `format.ts` (label + colour). See `../design/component-map/README.md` for the component glossary and screen wireframes.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build  -> dist/
npm test           # vitest run
npm run test:watch
npm run lint
```

After any change, run `npx tsc -b && npx vitest run` — both must be clean before committing.

## Sync (optional)

`core/sync.ts` mirrors the log to the API one event at a time. It's a strict noop unless `VITE_API_BASE_URL` is set, so `npm run dev` is fully local by default. When enabled it tracks a per-segment cursor in `localStorage` and retries on the next store change or a 30s tick — offline-safe.
