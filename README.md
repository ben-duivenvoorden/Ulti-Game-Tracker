# Ulti Game Tracker

Sideline stat recording for Ultimate Frisbee — fast, validated, and usable by anyone on a phone. Built for **Parity League**: per-player stats recorded live so General Managers can trade players under a salary cap between games.

The app is **live** at **[ultigametracker.com](https://ultigametracker.com)** (marketing landing at `/`, the web app at `/app`). The raw event log it writes feeds a downstream analytics pipeline (dbt → gold tables → Power BI) in the separate **[Parity-League-2026](https://github.com/ben-duivenvoorden/Parity-League-2026)** repo.

---

## What it does

A mobile-first SPA for one scorer on the sideline to record an Ultimate game tap-by-tap:

- **Game flow as a state machine.** Phases (`pre-game → awaiting-pull → in-play → point-over → half-time → game-over`) are *derived* from the event log, never stored. `canRecord(state, eventType)` is the single guard for every action, so the UI can only offer what the rules currently allow.
- **Rich event vocabulary.** Pulls (with bonus / brick variants), possessions/passes, the three turnover kinds + an "unknown" data-quality bucket, blocks, intercepts, goals, timeouts, fouls, picks, injury subs, half-time and end-game.
- **Rules baked in.** Mixed-division gender ratios (or open), line-size enforcement, and the *no-goal-off-a-dead-disc* rule (a goal is only eligible once the holder completes a pass after any pull/turnover/block; a Callahan off a live intercept stays legal).
- **Teams & schedule management.** A Teams Manager (rosters, jersey numbers, gender, colours) and a Games list, both backed by their own append-only logs with soft archive/cancel so historical games still resolve their rosters.
- **Full edit history.** Undo, amend, truncate (tap-to-rewind), and structural splice (insert/replace/delete) — all expressed as *new* append-only entries; nothing in history is ever mutated.
- **Multi-scorer sync.** Several people can score the same game from different devices; each device owns an independent **segment** with its own monotonic event ids, so writers never collide. The backend assembles segments and the Games menu shows the high-water score across them.
- **Point Summary & live Sankey.** A "moment" screen after each point, plus an animated team-colour Sankey ribbon in Live Entry that visualises possession flow.
- **Offline-first.** State persists to `localStorage` and survives reloads; sync to the API is best-effort and resumes from a per-segment cursor when back online. Installable as a PWA.

---

## Repository layout

| Path | What |
|---|---|
| `client/` | The web app. React 19 + TypeScript (strict) + Vite + Tailwind v4 + Zustand. Append-only event log; pure-function engine derives game state. Tested with Vitest. Ships to `/app`. See `client/README.md`. |
| `landing/` | Marketing landing page (standalone Vite + React + Tailwind v4). Ships to `/` on the same Static Web App. See `landing/README.md`. |
| `api/` | Azure Functions backend. `POST /api/events` appends a row to a public append-blob CSV; `GET /api/game/{id}` reads it back for resume. See `api/README.md`. |
| `infra/` | Bicep template for the Azure side (storage + Functions + Static Web App + DNS zone + managed-identity role). See `infra/README.md`. |
| `scripts/build-site.mjs` | Stitches `landing/` (→ `/`) and `client/` (→ `/app/`) into one `dist-site/` for the combined deploy. |
| `design/component-map/` | Reference glossary + wireframes for every screen and component. Read this to learn the names ("the EventColumn", "the ModeBanner"). |
| `.github/workflows/` | CI: `deploy-site` (combined SWA on push to `landing/**`/`client/**`), `deploy-api` (Functions via OIDC). |

---

## Architecture

```
                 ┌──────────────── ultigametracker.com (one Free SWA) ───────────────┐
   phone ─────►  │   /        landing  (landing/)                                     │
                 │   /app     web app  (client/)  ── Zustand store, append-only log   │
                 └───────────────────────────────────────────┬───────────────────────┘
                                                              │ POST /api/events  (one row per event)
                                                              │ GET  /api/game/{id} (resume / pick-up)
                                                              ▼
                                              Azure Functions  (func-ugt-prod-aue)
                                                              │ DefaultAzureCredential (managed identity)
                                                              ▼
                                       Azure Blob — append-blob CSV  (raw/events.csv, public read)
                                                              │
                                                              ▼
                              dbt-duckdb star schema → gold CSVs → Power BI
                                       (Parity-League-2026 repo)
```

- **The event log is the single source of truth.** In the client it's `session.rawLog`; `deriveGameState(session)` is a pure function over it. The store holds only the log plus transient UI state.
- **Append-only, end to end.** The same invariant carries from the SPA's `rawLog` through the POSTed rows into the persisted CSV. Structural events (undo/amend/truncate/splice) *are* sent — the server log stays faithful; the dbt layer filters them out for analytics.
- **No PII in the raw log.** The API writes opaque player/team ids only; name resolution and the salted `player_hash` happen downstream in the Parity pipeline.

### Client internals

```
client/src/
  core/
    types.ts        domain types + the RawEvent union (single source of truth for shapes)
    engine.ts       deriveGameState · step · canRecord · resolveRawLog/applySplice/…
    store.ts        Zustand store + persist (STORAGE_VERSION/migrate) — holds rawLog + UI state
    sync.ts         best-effort one-way log → /api/events (per-segment cursor)
    games/          scheduled-games append-only log (engine + actions + types)
    teams/          teams + rosters append-only log (engine + actions + types)
    selectors.ts · format.ts · contrast.ts · serverLog.ts · wire.ts · patterns.ts · data.ts
  screens/          GameSetup · NewGame · GameSettings · TeamsManager · LineSelection · LiveEntry · PointSummary
  components/ui/    Btn · Chip · Label · Icons   (+ MomentBackdrop · PromptSheet · ConfirmSheet)
```

Adding a new event type touches `types.ts` (union + interface), `engine.ts` (`step` + `canRecord`), and `format.ts` (label + colour).

---

## Getting started

Each sub-project has its own README with full instructions; the common paths:

```sh
# Web app
cd client && npm install && npm run dev          # http://localhost:5173

# Landing page
cd landing && npm install && npm run dev

# Combined site (landing at /, app at /app) — from repo root
node scripts/build-site.mjs                        # -> dist-site/

# API (local) — see api/README.md (Azurite + Functions Core Tools, or the dev HTTP shim)
cd api && npm install && npm start
```

After any client change: `cd client && npx tsc -b && npx vitest run` — both must be clean.

---

## Live deployment

Provisioned on Azure (Pay-As-You-Go, Koloni tenant) in resource group `rg-ugt-prod-aue`. The pipeline went live **2026-06-01**; the single-SWA cutover (landing + app on one Static Web App) and custom domain followed.

| Service | URL / resource | Status |
|---|---|---|
| **Site (landing + app)** | [ultigametracker.com](https://ultigametracker.com) · [/app](https://ultigametracker.com/app) — `stapp-ugt-landing-prod-aue` (Free, westus2) | ✅ Live |
| **API** | [func-ugt-prod-aue.azurewebsites.net](https://func-ugt-prod-aue.azurewebsites.net) — `func-ugt-prod-aue` (Y1 Consumption, australiaeast) | ✅ Live |
| **Raw event log** | [stugtprodaue.blob.core.windows.net/raw/events.csv](https://stugtprodaue.blob.core.windows.net/raw/events.csv) — `stugtprodaue` (Standard_LRS, public read) | ✅ Live |
| **DNS zone** | `ultigametracker.com` (Namecheap NS → Azure DNS, same RG) | ✅ Live |
| **Repo / CI** | [github.com/ben-duivenvoorden/Ulti-Game-Tracker](https://github.com/ben-duivenvoorden/Ulti-Game-Tracker) | ✅ Live |
| **Azure RG** | [`rg-ugt-prod-aue` (Australia East)](https://portal.azure.com/#@363002a4-7ede-4334-93e2-9db568793845/resource/subscriptions/72c91b50-a9c2-4619-9682-da3378760105/resourceGroups/rg-ugt-prod-aue/overview) | ✅ Live |

> **Topology note.** The landing page and app now ship together to **one** Static Web App; the original app-only SWA (`stapp-ugt-prod-aue`, "yellow-tree") was retired in the single-SWA cutover. SWA sits in `westus2` because Static Web Apps isn't offered in `australiaeast`, while storage + Functions stay in Australia East.
>
> **Known issue.** `www` resolves reliably; the **apex** (`ultigametracker.com`) intermittently mis-routes on Azure SWA's shared edge — a platform-side issue, not a config one. Prefer `www` if the apex misbehaves.

### Deploying

- **Site:** push to `main` touching `landing/**` or `client/**` → `.github/workflows/deploy-site.yml` builds the combined `dist-site/` and uploads it (`skip_app_build`). **A deploy is just `git push`; DNS is never touched.** Manual fallback in `landing/README.md`.
- **API:** `func azure functionapp publish func-ugt-prod-aue --typescript` (manual today; `deploy-api.yml` no-ops until OIDC is wired). Details + open auth todo in `api/README.md`.
- **Infra (one-off / rebuild):** `azd up` or `az deployment group create` against `infra/main.bicep`. See `infra/README.md`.

---

## Key conventions

- **Append-only event log.** Amendments are new entries; nothing in history is mutated. This holds from the SPA's `rawLog` through to the persisted CSV.
- **Derived vs. transient.** `GamePhase` is *derived* from the log; `UiMode` is *transient* store state — never conflate them. `canRecord` is the only recording guard.
- **CSV contract is load-bearing.** `api/src/shared/csv.ts` (`CSV_HEADER` + `eventToCsvRow`) is consumed by the dbt `raw_events` model in **[Parity-League-2026](https://github.com/ben-duivenvoorden/Parity-League-2026)** — keep the two in lock-step.
- **Phase-boundary cleanup.** When a phase completes, legacy event types/cases/labels are removed and the persisted log is migrated (`STORAGE_VERSION` bump + `migrate`). The working tree shows only what the current phase needs; past phases live in git history. See `CLAUDE.md`.
- **CAF resource naming.** `<type>-<workload>-<env>-<region>` with workload `ugt`, env `prod`, region `aue` (Australia East) — e.g. `rg-ugt-prod-aue`, `stugtprodaue`, `func-ugt-prod-aue`.
