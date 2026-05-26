{# Default dbt prefixes custom schemas with the target schema (e.g. `main_gold`).
   We want clean `raw` / `transformed` / `gold` schemas to match what consumers
   (Power BI, downloaded duckdb file) expect. #}

{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if custom_schema_name is none -%}
        {{ target.schema }}
    {%- else -%}
        {{ custom_schema_name | trim }}
    {%- endif -%}
{%- endmacro %}
