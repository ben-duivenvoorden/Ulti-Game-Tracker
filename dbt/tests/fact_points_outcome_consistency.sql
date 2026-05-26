-- Every completed point's outcome must be consistent with the pulling /
-- receiving / scoring team relationship.
--
--   hold  == receiving team scored == break of nothing (expected outcome)
--   break == pulling   team scored == defensive conversion
--
-- A failure here means either fact_points.point_outcome logic is wrong, or
-- the input rawLog had a malformed point (pull from one team, goal from a
-- nonsensical team).

select *
from {{ ref('fact_points') }}
where scoring_team is not null
  and (
    (point_outcome = 'hold'  and scoring_team <> receiving_team)
    or
    (point_outcome = 'break' and scoring_team <> pulling_team)
  )
