{{ config(schema='gold') }}

-- Segment dimension. One row per scorer's recording of a game.
-- Key = (game_id, segment_id). A game can have many segments (one per scorer /
-- device); each owns an independent append-only log whose event ids restart at
-- 1, so the real grain of the raw stream is (game_id, segment_id, event_id).
--
-- Stub for now: identity only. A later phase enriches this with the segment's
-- anchor (derived from a leading `score-resume` event → start point index),
-- its covered point range, and a canonical flag for stitching one authoritative
-- log per game. See the Segmented Scoring plan (coverage map / canonical log).

select
  game_id,
  segment_id,
  -- One scorer owns a segment for its lifetime; min() is just an aggregate to
  -- collapse the per-event rows — every row in a segment carries the same id.
  min(scorer_id)            as scorer_id,
  min(event_time)           as started_at,
  max(event_time)           as last_event_at,
  count(*)                  as event_count
from {{ ref('stg_events') }}
group by game_id, segment_id
