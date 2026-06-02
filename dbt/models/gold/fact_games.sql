{{ config(schema='gold') }}

-- One row per game. Aggregates from fact_points + raw event flags.

with points as (
  select * from {{ ref('fact_points') }}
),

goals as (
  select
    game_id,
    sum(case when scoring_team = 'A' then 1 else 0 end)         as score_a,
    sum(case when scoring_team = 'B' then 1 else 0 end)         as score_b,
    count(scoring_team)                                         as num_points_scored
  from points
  group by 1
),

bounds as (
  select
    game_id,
    min(start_time)                                             as start_time,
    max(end_time)                                               as end_time,
    epoch(max(end_time)) - epoch(min(start_time))               as duration_seconds,
    count(*)                                                    as num_points,
    sum(num_turnovers)                                          as num_turnovers_total,
    sum(num_blocks)                                             as num_blocks_total,
    sum(num_intercepts)                                         as num_intercepts_total
  from points
  group by 1
),

flags as (
  -- Read flags from the canonical stitched stream so the game's "ended" /
  -- "half-time" state reflects the one authoritative log, not any segment.
  select
    game_id,
    bool_or(type = 'end-game')                                  as has_ended,
    bool_or(type = 'half-time')                                 as has_half_time
  from {{ ref('canonical_events') }}
  group by 1
)

select
  b.game_id,
  b.start_time,
  b.end_time,
  b.duration_seconds,
  b.num_points,
  g.num_points_scored,
  g.score_a,
  g.score_b,
  case
    when not f.has_ended                 then null
    when g.score_a > g.score_b           then 'A'
    when g.score_b > g.score_a           then 'B'
    else                                      'draw'
  end                                                           as winner,
  g.score_a + g.score_b                                         as final_score_total,
  abs(g.score_a - g.score_b)                                    as final_score_margin,
  b.num_turnovers_total,
  b.num_blocks_total,
  b.num_intercepts_total,
  f.has_ended,
  f.has_half_time
from bounds b
left join goals g on g.game_id = b.game_id
left join flags f on f.game_id = b.game_id
