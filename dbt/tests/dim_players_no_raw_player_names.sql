-- Anonymisation guard. Policy = hashed IDs (decided 2026-06-01): no raw player
-- name may ever reach the public gold layer (it feeds a publish-to-web embed).
--
-- player_name must be either NULL (no roster source wired yet) or a 32-char hex
-- md5 hash. Any other value means a future roster join leaked real names into
-- gold — this test returns those rows and fails the build.

select
  game_id,
  player_id,
  player_name
from {{ ref('dim_players') }}
where player_name is not null
  and not regexp_full_match(player_name, '^[0-9a-f]{32}$')
