# Ulti Game Tracker

Sideline stat recording for Ultimate Frisbee — fast, validated, and usable by anyone. Built for **Parity League**: per-player stats recorded live so General Managers can trade players under a salary cap between games.

The app is **live** (SPA + API + Blob). The custom domain [ultigametracker.com](https://ultigametracker.com) is the remaining wiring — see [Live deployment](#live-deployment). Data & analytics (dbt → gold tables → Power BI) live in the **[Parity-League-2026](https://github.com/ben-duivenvoorden/Parity-League-2026)** repo, which reads the raw event blob this app writes.

## What's in here

| Path | What |
|---|---|
| `client/` | React + TypeScript SPA. Append-only event log persisted to localStorage; pure-function engine derives game state from the log. Tested with Vitest. |
| `api/` | Azure Functions backend. `POST /events` appends to a public Azure Blob CSV; `GET /game/{id}` reads it back for resume. |
| `infra/` | Bicep template for the Azure side. `azd up` provisions everything per the [CAF naming convention](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/azure-best-practices/resource-naming) (e.g. `rg-ugt-prod-aue`). |
| `.github/workflows/` | CI: deploy-api (OIDC), deploy-spa (SWA action). |

## Architecture in one paragraph

Browser SPA writes events to Azure Blob via the Functions API (append-blob); `GET /game/{id}` reads them back for resume. The raw event log is a public, append-only CSV. Downstream analytics — dbt-duckdb building a star schema, gold CSVs on a GitHub Release, and the Power BI report — consume that blob and live in the [Parity-League-2026](https://github.com/ben-duivenvoorden/Parity-League-2026) repo.

## Live deployment

Provisioned on Azure (Pay-As-You-Go, Koloni tenant) under resource group `rg-ugt-prod-aue`. The pipeline went live 2026-06-01.

| Service | URL | Status |
|---|---|---|
| **App (SPA)** | [yellow-tree-03154b01e.7.azurestaticapps.net](https://yellow-tree-03154b01e.7.azurestaticapps.net) · `stapp-ugt-prod-aue` (Free, westus2) | ✅ Live |
| **API** | [func-ugt-prod-aue.azurewebsites.net](https://func-ugt-prod-aue.azurewebsites.net) · `func-ugt-prod-aue` (Y1 Consumption, australiaeast) | ✅ Live |
| **Raw event log** | [stugtprodaue.blob.core.windows.net/raw/events.csv](https://stugtprodaue.blob.core.windows.net/raw/events.csv) · `stugtprodaue` (Standard_LRS, public read) | ✅ Live |
| **Repo / CI** | [github.com/ben-duivenvoorden/Ulti-Game-Tracker](https://github.com/ben-duivenvoorden/Ulti-Game-Tracker) | ✅ Live |
| **Azure RG** | [`rg-ugt-prod-aue` (Australia East)](https://portal.azure.com/#@363002a4-7ede-4334-93e2-9db568793845/resource/subscriptions/72c91b50-a9c2-4619-9682-da3378760105/resourceGroups/rg-ugt-prod-aue/overview) | ✅ Live |
| **Custom domain** | [ultigametracker.com](https://ultigametracker.com) (Namecheap, → Azure DNS) | ⏳ Pending (Phase 7) |

> SWA sits in `westus2` because Static Web Apps isn't offered in `australiaeast`. The raw event log carries no PII — the API writes opaque player/team IDs only; name resolution and the salted `player_hash` happen downstream in the Parity pipeline.

## Getting started

Each sub-project has its own README with run instructions:

- **Frontend dev:** `cd client && npm install && npm run dev`
- **API dev (with Azurite):** see `api/README.md`
- **Azure deploy:** see `infra/README.md` (`azd up`)

## Key conventions

- Event log is append-only. Amendments are new entries; nothing in history is mutated. This invariant carries from the SPA's `rawLog` through to the persisted CSV.
- The CSV contract written by `api/src/shared/csv.ts` (`CSV_HEADER`) is a load-bearing interface consumed by the dbt pipeline in the **[Parity-League-2026](https://github.com/ben-duivenvoorden/Parity-League-2026)** repo — keep the two in lock-step.
- Azure resources follow CAF naming (`<type>-<workload>-<env>-<region>`) with workload `ugt`, env `prod`, region `aue` (Australia East). Documented deviations live in the personal-Obsidian convention note.
