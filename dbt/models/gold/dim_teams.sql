{{ config(schema='gold') }}

-- Per-game team dimension. Natural key = (game_id, team_id).
-- Stub for now: full team metadata (name, colour, short, global team id)
-- lives in GameConfig which isn't on the event stream. Will be enriched once
-- the API also publishes a per-game config snapshot.

select distinct
  game_id,
  team_id,
  cast(null as varchar) as team_name,
  cast(null as varchar) as team_short,
  cast(null as varchar) as team_color
from {{ ref('stg_events') }}
where team_id is not null
