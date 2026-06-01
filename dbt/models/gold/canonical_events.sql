{{ config(schema='gold') }}

-- The stitched, single authoritative event stream per game: for each point,
-- only the events from that point's canonical segment. This is what the game
-- facts (fact_events / fact_points / fact_games) aggregate, so overlapping
-- segments never double-count.
--
-- With one segment per game this is identical to stg_events (the sole segment
-- is always canonical), so single-recorder games are unaffected.
--
-- (Layer note: this reads stg_events but is grouped with the coverage/canonical
-- models in gold so the whole segment-assembly chain lives together.)

select e.*
from {{ ref('stg_events') }} e
join {{ ref('point_canonical') }} pc
  on  e.game_id     = pc.game_id
  and e.point_index = pc.point_index
  and e.segment_id  = pc.canonical_segment_id
