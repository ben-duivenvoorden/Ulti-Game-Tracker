{{ config(schema='gold') }}

-- Per-game player dimension. `player_id` is a per-game surrogate (see
-- client/src/core/types.ts), so the natural key is (game_id, player_id).
--
-- ANONYMISATION POLICY = HASHED IDS (decided 2026-06-01). The public gold layer
-- — which feeds a publish-to-web Power BI embed — must NEVER expose real player
-- names. `player_hash` is a stable, salted, un-cross-referenceable identifier,
-- safe to use as the player grouping key in public dashboards.
--
-- `player_name` / `jersey_number` / `gender` are NULL placeholders until the API
-- also publishes a per-game roster snapshot. WHEN that lands and this model
-- joins to it: hash the name with the same salt (md5(name || salt)) — never
-- select a raw name into gold. The `dim_players_no_raw_player_names` singular
-- test enforces this and will fail the build if a raw name ever leaks through.

select distinct
  game_id,
  player_id,
  team_id,
  md5(
    cast(game_id as varchar) || '-' ||
    cast(player_id as varchar) || '-' ||
    '{{ var("player_hash_salt") }}'
  ) as player_hash,
  cast(null as varchar) as player_name,
  cast(null as integer) as jersey_number,
  cast(null as varchar) as gender
from {{ ref('stg_events') }}
where player_id is not null
