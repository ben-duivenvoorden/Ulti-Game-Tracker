# dbt project — ulti_game_tracker

Builds the `raw` → `transformed` → `gold` star schema on top of the live
append-only event log. Output is `ulti-game-tracker.duckdb` (single-file data
product with all three schemas) plus a set of `gold/*.csv.gz` files for Power
BI and similar consumers.

See `docs/design/architecture-data-pipeline.md` for the end-to-end context.

## Layout

- `models/raw/`         — materialises the live CSV from object storage
  - `raw_events`
- `models/transformed/` — typed projection, JSON payloads unpacked
  - `stg_events`
- `models/gold/`        — star schema (facts + dims), the public surface
  - **Facts**: `fact_events` (one row per event), `fact_points` (one per point with hold/break outcome), `fact_games` (one per game with score + winner)
  - **Dims**: `dim_players`, `dim_teams`, `dim_games` (stubs until config snapshot ships)
- `macros/export_gold.sql` — COPYs every gold table to gzipped CSV for PBI

## Run locally

```bash
pip install dbt-duckdb       # one-time

cd dbt
dbt deps    --profiles-dir .
dbt build   --profiles-dir .
dbt run-operation export_gold --profiles-dir .
```

By default it reads from `../scripts/sample-events.csv` (committed sample data)
and writes to `target/ulti-game-tracker.duckdb` plus `target/gold/*.csv.gz`.
The wrapper script `scripts/build-data.sh` (or `build-data.ps1`) does all of
the above for you.

## Point at real data

```bash
RAW_EVENTS_URL='https://stugtprodaue.blob.core.windows.net/raw/events.csv' \
  scripts/build-data.sh
```

The dbt-duckdb httpfs extension fetches the URL directly — no separate download
step.

## Key assumption

The raw CSV is expected to contain **only resolved events**. Undo / amend /
truncate / splice-block entries should be applied server-side by the API
before the row is written to the raw log; this project's models filter them
out defensively.

The contract (CSV columns, per row) is:

| column        | type     | note                                          |
|---------------|----------|-----------------------------------------------|
| `event_id`    | BIGINT   | per-game monotonic                            |
| `game_id`     | BIGINT   |                                               |
| `timestamp_ms`| BIGINT   | epoch milliseconds                            |
| `point_index` | INTEGER  | resolved point index at time of event         |
| `type`        | VARCHAR  | one of the non-structural `RawEventType`s     |
| `payload`     | VARCHAR  | per-type fields as a JSON object              |

`payload` shape per `type` mirrors the `RawEvent` union in
`client/src/core/types.ts` (e.g. `possession` → `{ "playerId": 11, "teamId": "B" }`).
