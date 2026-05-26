#!/usr/bin/env bash
# Local-parity build: same dbt steps as .github/workflows/build-data.yml but
# against scripts/sample-events.csv by default. Override RAW_EVENTS_URL to
# point at a real Azure Blob URL.
#
# Requires: python 3.10+ with dbt-duckdb installed (`pip install dbt-duckdb`).

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export RAW_EVENTS_URL="${RAW_EVENTS_URL:-$repo_root/scripts/sample-events.csv}"
export DUCKDB_PATH="${DUCKDB_PATH:-$repo_root/dbt/target/ulti-game-tracker.duckdb}"
export GOLD_EXPORT_DIR="${GOLD_EXPORT_DIR:-$repo_root/dbt/target/gold}"

mkdir -p "$GOLD_EXPORT_DIR"

cd "$repo_root/dbt"
dbt deps   --profiles-dir .
dbt build  --profiles-dir .
dbt run-operation export_gold --profiles-dir .

echo
echo "Done."
echo "  DuckDB:  $DUCKDB_PATH"
echo "  Exports: $GOLD_EXPORT_DIR"
