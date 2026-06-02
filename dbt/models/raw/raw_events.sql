{{ config(schema='raw') }}

-- Materialises the live append-only event CSV from object storage (or a local
-- sample in dev) as a table in the `raw` schema.
--
-- Wire shape: one row per event with a JSON payload column carrying the
-- per-type fields. See client/src/core/types.ts for the RawEvent union the
-- payload is serialised from.

select
  event_id,
  game_id,
  segment_id,
  scorer_id,
  timestamp_ms,
  point_index,
  type,
  payload
from read_csv_auto(
  '{{ var("raw_events_url") }}',
  header = true,
  columns = {
    'event_id':     'BIGINT',
    'game_id':      'BIGINT',
    'segment_id':   'VARCHAR',
    'scorer_id':    'VARCHAR',
    'timestamp_ms': 'BIGINT',
    'point_index':  'INTEGER',
    'type':         'VARCHAR',
    'payload':      'VARCHAR'
  }
)
