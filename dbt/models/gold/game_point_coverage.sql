{{ config(schema='gold') }}

-- The coverage map: every segment overlaid on the point axis. One row per
-- (game_id, point_index) across the OBSERVED range [min..max] per game, so
-- internal gaps surface as rows with n_segments = 0.
--
--   coverage_status — gap (0 segments) · single (1) · redundant (>=2, a
--                     cross-check opportunity).
--   has_conflict    — >1 distinct scoring team across the segments that
--                     completed this point: they disagree on who scored.
--
-- Caveat: a TRAILING gap (points after the last one anyone recorded) is
-- invisible — no segment signalled it. Internal gaps and an off-by-one anchor
-- (which shows as a phantom gap + an adjacent redundant point) are detectable.

with cov as (
  select * from {{ ref('segment_coverage') }}
),

bounds as (
  select game_id, min(point_index) as lo, max(point_index) as hi
  from cov
  group by game_id
),

axis as (
  -- generate_series(lo, hi) returns an inclusive BIGINT list; unnest is
  -- correlated per game so each game spans only its own observed range.
  select game_id, unnest(generate_series(lo, hi)) as point_index
  from bounds
),

agg as (
  select
    game_id,
    point_index,
    count(*)                                                    as n_segments,
    sum(case when is_complete then 1 else 0 end)                as n_complete_segments,
    string_agg(segment_id, ',' order by segment_id)             as segment_ids,
    count(distinct case when is_complete then scoring_team end) as distinct_scoring_teams
  from cov
  group by game_id, point_index
)

select
  a.game_id,
  a.point_index,
  coalesce(g.n_segments, 0)                                     as n_segments,
  coalesce(g.n_complete_segments, 0)                            as n_complete_segments,
  g.segment_ids,
  case
    when coalesce(g.n_segments, 0) = 0 then 'gap'
    when g.n_segments = 1              then 'single'
    else 'redundant'
  end                                                           as coverage_status,
  coalesce(g.distinct_scoring_teams, 0) > 1                     as has_conflict
from axis a
left join agg g on (g.game_id, g.point_index) = (a.game_id, a.point_index)
