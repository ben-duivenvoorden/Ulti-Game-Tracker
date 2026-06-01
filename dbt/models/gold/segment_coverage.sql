{{ config(schema='gold') }}

-- One row per (game_id, segment_id, point_index) that a segment recorded events
-- for. `point_index` is the GLOBAL point ordinal (an anchored segment's events
-- carry point_index from its anchor onward), so segments align on it directly
-- even when each started from a different score. This is the per-segment input
-- to the coverage map (game_point_coverage) and to canonical selection.
--
--   is_complete — the segment recorded the goal that ended this point (saw the
--                 point through to a score).
--   has_pull    — the segment recorded the pull (saw the point from the start).
-- A point that is both has_pull and is_complete was recorded end-to-end.

with events as (
  select * from {{ ref('stg_events') }}
)

select
  game_id,
  segment_id,
  point_index,
  count(*)                                                          as event_count,
  max(case when type = 'goal' then 1 else 0 end) = 1               as is_complete,
  max(case when type in ('pull', 'pull-bonus', 'brick')
           then 1 else 0 end) = 1                                  as has_pull,
  max(case when type = 'goal' then team_id   end)                  as scoring_team,
  max(case when type = 'goal' then player_id end)                  as scoring_player_id
from events
group by game_id, segment_id, point_index
