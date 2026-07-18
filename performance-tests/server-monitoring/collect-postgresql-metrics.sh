#!/bin/bash
# collect-postgresql-metrics.sh — Métricas de PostgreSQL
# Requiere: docker y credenciales de BD configuradas

OUTPUT_DIR="../results/server-metrics"
mkdir -p "$OUTPUT_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_FILE="${OUTPUT_DIR}/postgresql-metrics-${TIMESTAMP}.txt"

PG_CONTAINER="sgi-backend-prod-pgsql-1"
PG_USER="${DB_USERNAME:-user_im}"
PG_DB="${DB_DATABASE:-incident_management_system}"

{
    echo "============================================"
    echo " PostgreSQL Metrics - $(date)"
    echo "============================================"
    echo ""

    echo "--- Conexiones activas ---"
    docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c "
        SELECT count(*) AS total_connections
        FROM pg_stat_activity;
    " 2>/dev/null || echo "No se pudo conectar"

    echo "--- Conexiones por estado ---"
    docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c "
        SELECT state, count(*)
        FROM pg_stat_activity
        WHERE state IS NOT NULL
        GROUP BY state
        ORDER BY count DESC;
    " 2>/dev/null

    echo "--- Consultas activas (running) ---"
    docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c "
        SELECT pid, now() - pg_stat_activity.query_start AS duration,
               query, state
        FROM pg_stat_activity
        WHERE state = 'active'
          AND pid <> pg_backend_pid()
        ORDER BY duration DESC
        LIMIT 20;
    " 2>/dev/null

    echo "--- Locks actuales ---"
    docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c "
        SELECT l.locktype, l.mode, l.granted,
               a.query
        FROM pg_locks l
        JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE NOT l.granted
        LIMIT 20;
    " 2>/dev/null

    echo "--- Tamaño de base de datos ---"
    docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c "
        SELECT pg_database_size('$PG_DB') AS bytes,
               pg_size_pretty(pg_database_size('$PG_DB')) AS pretty;
    " 2>/dev/null

    echo "--- pg_stat_statements (si está disponible) ---"
    docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -c "
        SELECT queryid, LEFT(query, 80) AS query_preview,
               calls, mean_exec_time AS avg_ms,
               rows,
               shared_blks_hit, shared_blks_read
        FROM pg_stat_statements
        ORDER BY mean_exec_time DESC
        LIMIT 10;
    " 2>/dev/null || echo "pg_stat_statements no disponible (no crítico)"
} > "$OUTPUT_FILE"

echo "Métricas PostgreSQL guardadas en: $OUTPUT_FILE"
