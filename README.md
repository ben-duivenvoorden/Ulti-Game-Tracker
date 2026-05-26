# Ulti Game Tracker

Sideline stat recording for Ultimate Frisbee — fast, validated, and usable by anyone. Lives at [ultigametracker.com](https://ultigametracker.com). Built for **Parity League**: per-player stats recorded live so General Managers can trade players under a salary cap between games.

## What's in here

| Path | What |
|---|---|
| `client/` | React + TypeScript SPA. Append-only event log persisted to localStorage; pure-function engine derives game state from the log. Tested with Vitest. |
| `api/` | Azure Functions backend. `POST /events` appends to a public Azure Blob CSV; `GET /game/{id}` reads it back for resume. |
| `dbt/` | dbt-duckdb project. Builds the `raw` → `transformed` → `gold` star schema from the live event CSV. Outputs `ulti-game-tracker.duckdb` plus gzipped CSVs Power BI can ingest. |
| `infra/` | Bicep template for the Azure side. `azd up` provisions everything per the [CAF naming convention](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/azure-best-practices/resource-naming) (e.g. `rg-ugt-prod-aue`). |
| `scripts/` | Local dev wrappers + a sample event log so the pipeline runs offline. |
| `.github/workflows/` | CI: build-data (hourly + on-push), deploy-api (OIDC), deploy-spa (SWA action), deploy-pbi (`.pbip` → `.pbix` via pbi-tools on a Windows runner). |

## Architecture in one paragraph

Browser SPA writes events to Azure Blob via the Functions API (append-blob). A scheduled GitHub Action downloads the blob, runs dbt-duckdb to materialise the star schema in `/tmp`, exports `gold/*.csv.gz`, and uploads everything to the `latest` GitHub Release. Power BI scheduled refresh reads the gold CSVs from the Release URL and the publish-to-web embed updates automatically. Power users can pull the same `ulti-game-tracker.duckdb` file from the Release and query it directly.

## Getting started

Each sub-project has its own README with run instructions:

- **Frontend dev:** `cd client && npm install && npm run dev`
- **API dev (with Azurite):** see `api/README.md`
- **Data pipeline (against sample data):** `pwsh scripts/build-data.ps1`
- **Azure deploy:** see `infra/README.md` (`azd up`)

## Key conventions

- Event log is append-only. Amendments are new entries; nothing in history is mutated. This invariant carries from the SPA's `rawLog` all the way through to the dbt models.
- The CSV contract between `api/src/shared/csv.ts` and `dbt/models/raw/raw_events.sql` is the load-bearing interface — keep them in lock-step.
- Built artefacts (`*.duckdb`, gold CSVs, `*.pbix`) are not committed. They live on GitHub Releases or are regenerated from source.
- Azure resources follow CAF naming (`<type>-<workload>-<env>-<region>`) with workload `ugt`, env `prod`, region `aue` (Australia East). Documented deviations live in the personal-Obsidian convention note.
