# Local-parity build (Windows). Mirrors .github/workflows/build-data.yml.
# Requires: python 3.10+ with dbt-duckdb installed (`pip install dbt-duckdb`).

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path "$PSScriptRoot\..").Path

if (-not $env:RAW_EVENTS_URL)  { $env:RAW_EVENTS_URL  = "$repoRoot\scripts\sample-events.csv" }
if (-not $env:DUCKDB_PATH)     { $env:DUCKDB_PATH     = "$repoRoot\dbt\target\ultimate.duckdb" }
if (-not $env:GOLD_EXPORT_DIR) { $env:GOLD_EXPORT_DIR = "$repoRoot\dbt\target\gold" }

New-Item -ItemType Directory -Force -Path $env:GOLD_EXPORT_DIR | Out-Null

Push-Location "$repoRoot\dbt"
try {
    dbt deps   --profiles-dir .
    dbt build  --profiles-dir .
    dbt run-operation export_gold --profiles-dir .
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "Done."
Write-Host "  DuckDB:  $($env:DUCKDB_PATH)"
Write-Host "  Exports: $($env:GOLD_EXPORT_DIR)"
