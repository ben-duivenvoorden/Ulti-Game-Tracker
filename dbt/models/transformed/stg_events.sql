{{ config(schema='transformed') }}

-- Typed projection of raw events: unpacks the JSON payload into per-type
-- columns. Structural events (undo / amend / truncate / splice-block) are
-- filtered out — they must be resolved upstream by the API before being
-- written to the raw log. If any slip through, the dbt test on
-- `fact_events.event_type` will catch them.
--
-- Per-type field reference (see client/src/core/types.ts RawEvent union):
--   point-start         → lineA[], lineB[]
--   pull|pull-bonus|brick, possession, turnover-*, block, intercept, goal
--                       → playerId, teamId
--   injury-sub          → teamId, line[]
--   amend               → targetEventId, replacement (RawEvent | null)
--   splice-block        → afterEventId, removeFromId, removeToId, events[]
--   system              → text
--   half-time / end-game / timeout / foul / pick → (no extra fields)

select
  event_id,
  game_id,
  segment_id,
  scorer_id,
  timestamp_ms,
  epoch_ms(timestamp_ms)                                          as event_time,
  point_index,
  type,
  cast(json_extract_string(payload, '$.playerId')   as bigint)    as player_id,
  json_extract_string(payload, '$.teamId')                        as team_id,
  payload->'$.lineA'                                              as line_a_json,
  payload->'$.lineB'                                              as line_b_json,
  payload->'$.line'                                               as line_json,
  json_extract_string(payload, '$.text')                          as system_text
from {{ ref('raw_events') }}
where type not in ('undo', 'amend', 'truncate', 'splice-block')
