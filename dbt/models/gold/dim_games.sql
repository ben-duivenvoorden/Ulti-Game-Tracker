{{ config(schema='gold') }}

-- Game dimension. Stub for now — full GameConfig metadata (name, scheduled
-- time, half-time-at, score-cap-at, team A/B names) lives outside the event
-- stream. Will be enriched once the API publishes a per-game config snapshot
-- alongside the raw event log.

select distinct
  game_id
from {{ ref('stg_events') }}
