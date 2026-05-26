-- score_a + score_b must equal the number of scored points (rows in
-- fact_points with a non-null scoring_team for this game).
--
-- A failure here means the team-side goal counts in fact_games drifted from
-- the underlying per-point grain — almost always a bug in the aggregation,
-- not in the input.

select
  g.game_id,
  g.score_a,
  g.score_b,
  g.num_points_scored,
  g.score_a + g.score_b as score_sum
from {{ ref('fact_games') }} g
where g.score_a + g.score_b <> coalesce(g.num_points_scored, 0)
