{{ config(schema='gold') }}

-- One row per point played. Grain = (game_id, point_index).
--
-- A "point" in Ultimate starts at the pull and ends when someone scores (or
-- the game ends mid-point). Events for a point share `point_index`. We
-- aggregate the in-point activity into per-point counts plus identify the
-- pulling team (from the pull event) and the scoring team (from the goal, if
-- any).

with events as (
  select * from {{ ref('stg_events') }}
),

bounds as (
  select
    game_id,
    point_index,
    min(event_time)                                             as start_time,
    max(event_time)                                             as end_time,
    epoch(max(event_time)) - epoch(min(event_time))             as duration_seconds
  from events
  group by 1, 2
),

pulling as (
  select distinct
    game_id,
    point_index,
    team_id                                                     as pulling_team
  from events
  where type in ('pull', 'pull-bonus', 'brick')
),

scoring as (
  select
    game_id,
    point_index,
    team_id                                                     as scoring_team,
    player_id                                                   as scoring_player_id
  from events
  where type = 'goal'
),

counts as (
  select
    game_id,
    point_index,
    sum(case when type = 'possession'                  then 1 else 0 end) as num_possessions,
    sum(case when type like 'turnover-%'               then 1 else 0 end) as num_turnovers,
    sum(case when type = 'block'                       then 1 else 0 end) as num_blocks,
    sum(case when type = 'intercept'                   then 1 else 0 end) as num_intercepts,
    sum(case when type = 'timeout'                     then 1 else 0 end) as num_timeouts,
    sum(case when type = 'foul'                        then 1 else 0 end) as num_fouls,
    sum(case when type = 'pick'                        then 1 else 0 end) as num_picks,
    sum(case when type = 'injury-sub'                  then 1 else 0 end) as num_injury_subs
  from events
  group by 1, 2
)

select
  b.game_id,
  b.point_index,
  b.start_time,
  b.end_time,
  b.duration_seconds,
  p.pulling_team,
  case p.pulling_team when 'A' then 'B' when 'B' then 'A' end   as receiving_team,
  s.scoring_team,
  s.scoring_player_id,
  -- "hold" = the receiving team scored; "break" = the pulling team scored
  case
    when s.scoring_team is null              then null
    when s.scoring_team = p.pulling_team     then 'break'
    when s.scoring_team <> p.pulling_team    then 'hold'
  end                                                           as point_outcome,
  c.num_possessions,
  c.num_turnovers,
  c.num_blocks,
  c.num_intercepts,
  c.num_timeouts,
  c.num_fouls,
  c.num_picks,
  c.num_injury_subs,
  s.scoring_team is null                                        as is_incomplete
from bounds b
left join pulling p on (p.game_id, p.point_index) = (b.game_id, b.point_index)
left join scoring s on (s.game_id, s.point_index) = (b.game_id, b.point_index)
left join counts  c on (c.game_id, c.point_index) = (b.game_id, b.point_index)
