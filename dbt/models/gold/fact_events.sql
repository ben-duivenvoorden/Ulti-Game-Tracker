{{ config(schema='gold') }}

-- One row per non-structural gameplay event, flattened for analytics.
-- This is the primary gold-layer fact and the main artefact Power BI reads.
-- Reads the canonical stitched stream (one segment per point), so overlapping
-- segments never double-count.

select
  event_id,
  game_id,
  event_time,
  point_index,
  type                                                            as event_type,
  case
    when type = 'goal'                                            then 'scoring'
    when type in ('turnover-throw-away',
                  'turnover-receiver-error',
                  'turnover-stall')                               then 'turnover'
    when type in ('block', 'intercept')                           then 'defensive'
    when type in ('pull', 'pull-bonus', 'brick')                  then 'pull'
    when type = 'possession'                                      then 'possession'
    when type = 'point-start'                                     then 'lifecycle'
    when type in ('half-time', 'end-game', 'timeout',
                  'foul', 'pick', 'injury-sub', 'system')         then 'meta'
    else 'other'
  end                                                             as event_category,
  team_id,
  player_id
from {{ ref('canonical_events') }}
