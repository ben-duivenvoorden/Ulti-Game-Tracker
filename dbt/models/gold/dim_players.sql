{{ config(schema='gold') }}

-- Per-game player dimension. `player_id` is a per-game surrogate (see
-- client/src/core/types.ts), so the natural key is (game_id, player_id).
--
-- Placeholder for now: derived purely from events. Once the API also publishes
-- a per-game roster snapshot, this model joins to it to attach names, jersey
-- numbers, and gender for richer dimensional analytics.

select distinct
  game_id,
  player_id,
  team_id,
  cast(null as varchar) as player_name,
  cast(null as integer) as jersey_number,
  cast(null as varchar) as gender
from {{ ref('stg_events') }}
where player_id is not null
