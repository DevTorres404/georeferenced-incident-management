#!/bin/bash
# collect-logs.sh — Recolecta logs recientes de los servicios Docker

OUTPUT_DIR="../results/server-metrics/logs"
mkdir -p "$OUTPUT_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

SERVICES=("sgi-backend-prod-app-1" "sgi-backend-prod-nginx-1" "sgi-backend-prod-pgsql-1" "sgi-backend-prod-redis-1" "sgi-backend-prod-queue-1" "sgi-backend-prod-reverb-1" "sgi-backend-prod-scheduler-1" "sgi-backend-prod-rustfs-1")
LINES=200

echo "=== Recolectando logs de servicios Docker ==="
echo "Fecha: $(date)"
echo ""

for service in "${SERVICES[@]}"; do
    echo "→ $service"
    LOG_FILE="${OUTPUT_DIR}/${service}-${TIMESTAMP}.log"
    docker logs --tail "$LINES" "$service" 2>&1 > "$LOG_FILE" || echo "  (no disponible)" >> "$LOG_FILE"
    echo "  Guardado: $LOG_FILE"
done

echo ""
echo "Logs recolectados en: $OUTPUT_DIR"

# También capturar logs de Laravel si el volume está accesible
LARAVEL_LOG=$(docker inspect sgi-backend-prod-app-1 --format='{{range .Mounts}}{{.Source}}{{end}}' 2>/dev/null | head -1)
if [ -n "$LARAVEL_LOG" ]; then
    echo ""
    echo "→ Laravel log (desde bind mount)"
    find "$LARAVEL_LOG" -name "laravel*.log" -mmin -60 -exec cp {} "$OUTPUT_DIR/" \; 2>/dev/null || echo "  No se encontraron logs recientes"
fi
