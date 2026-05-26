{# Exports every gold-layer table to a gzipped CSV in `gold_export_dir`.
   These files are the side-car artefact Power BI's Web connector reads — the
   `ultimate.duckdb` file itself is not consumable by PBI Service over HTTPS.

   Usage:
     dbt run-operation export_gold --profiles-dir .

   Add new gold models to the `tables` list below as they're created. #}

{% macro export_gold() %}
  {% set export_dir = var('gold_export_dir') %}
  {% set tables = ['fact_events', 'fact_points', 'fact_games', 'dim_players', 'dim_teams', 'dim_games'] %}

  {% for tbl in tables %}
    {% set sql %}
      copy gold.{{ tbl }}
        to '{{ export_dir }}/{{ tbl }}.csv.gz'
        (format csv, compression gzip, header true)
    {% endset %}
    {% do log("Exporting gold." ~ tbl ~ " -> " ~ export_dir ~ "/" ~ tbl ~ ".csv.gz", info=true) %}
    {% do run_query(sql) %}
  {% endfor %}
{% endmacro %}
