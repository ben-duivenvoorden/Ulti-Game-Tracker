# Ulti Game Tracker — Project Instructions

## Stack

- **Frontend**: React 18 + TypeScript (strict) + Vite + Tailwind v4 (`@theme` CSS custom properties)
- **State**: Zustand v5 with `persist` middleware; append-only `rawLog` is the single source of truth
- **Engine**: `deriveGameState(session)` is a pure function — the store holds only `rawLog` + transient UI state
- **Tests**: Vitest

## Source layout

```
client/src/
  core/          types.ts · engine.ts · store.ts · selectors.ts · format.ts · data.ts
  screens/       GameSetup · GameSettings · LineSelection · LiveEntry
  components/ui/ Btn · Chip · Label
```

## Key conventions

- `GamePhase` is derived from the log; `UiMode` is transient store state — never conflate them
- `canRecord(state, eventType)` is the single guard for all recording actions
- New event types need handling in: `types.ts` (union + interface), `engine.ts` (derive + canRecord), `format.ts` (label + color)
- CSS design tokens live in `client/src/index.css` under `@theme`
- After any change: `npx tsc -b` from `client/` (matches `npm run build` — `--noEmit` skips referenced projects and lets build-breaking errors through), then `npx vitest run`

## Phase-change cleanup policy

When a phase boundary lands (i.e. a planned chunk of work completes and the next phase begins), aggressively remove legacy code, types, and doc references that the new phase makes redundant. Do not preserve "kept for compat" cruft unless there is a concrete reason it has to stay.

Concretely, at each phase boundary:

- Remove dead event types from `RawEventType` and any related interfaces / `RawEvent` union members.
- Drop the corresponding cases in `engine.ts` (`step`, `canRecord`, filters in `resolveRawLog` / `applySplice` / `popLastVisible` / `applyAmend`).
- Strip the label from `summariseEvents` in `store.ts` and any other formatting maps.
- Add a `migrate` step in the Zustand `persist` config that strips legacy events from any persisted `rawLog`, and bump `STORAGE_VERSION` + `BUILD_MARKER`.
- Update current-state docs (`requirements/*`, `design/*`) to remove the legacy references. Historical records (`feedback/*`, `plans/*`) stay untouched — they're the audit trail.
- Run `npx tsc -b` and `npx vitest run` from `client/` and confirm both are clean before committing.

The expectation is that anyone reading the codebase right now should see only what the current phase needs — past phases live in git history, not the working tree.

## Pending changes workflow

Queue feature requests in the Obsidian note **`Efforts/On/Ulti Game Tracker/
UGT Active Changes.md`** (in the `Obsidian-Personal` vault) — one bullet per change.

Run `/get-changes` to implement everything queued — the skill reads the note,
clears it, and then implements the captured changes. The skill is
**user-specific**: it depends on the `Obsidian-Personal` MCP server and will not
work for other clones of this repo.
