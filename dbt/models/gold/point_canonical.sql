{{ config(schema='gold') }}

-- One canonical segment per recorded point — the deterministic default that
-- stitches a single authoritative log out of overlapping segments.
--
-- Rule (per game_id, point_index): prefer the segment that
--   1. saw the point finish        (is_complete)        — has the goal
--   2. then saw it from the start   (has_pull)           — end-to-end
--   3. then recorded the most detail (event_count)
--   4. then lowest segment_id                            — stable tie-break
--
-- Gaps have no row (nothing to choose). The `segment_overrides` seed lets a
-- human pin a different segment per point — the manual cross-check.

with cov as (
  select * from {{ ref('segment_coverage') }}
),

ranked as (
  select
    *,
    row_number() over (
      partition by game_id, point_index
      order by is_complete desc, has_pull desc, event_count desc, segment_id asc
    ) as rn
  from cov
),

auto as (
  select
    game_id,
    point_index,
    segment_id   as canonical_segment_id,
    is_complete  as canonical_is_complete,
    has_pull     as canonical_has_pull,
    event_count  as canonical_event_count
  from ranked
  where rn = 1
),

overrides as (
  select game_id, point_index, canonical_segment_id
  from {{ ref('segment_overrides') }}
)

select
  a.game_id,
  a.point_index,
  coalesce(o.canonical_segment_id, a.canonical_segment_id)      as canonical_segment_id,
  a.canonical_is_complete,
  a.canonical_has_pull,
  a.canonical_event_count,
  o.canonical_segment_id is not null                            as is_manual_override
from auto a
left join overrides o on (o.game_id, o.point_index) = (a.game_id, a.point_index)
