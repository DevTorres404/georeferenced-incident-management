#!/bin/bash
# monitor-docker.sh — Registra estadísticas de Docker periódicamente
# Uso: ./monitor-docker.sh [intervalo_segundos] [duración_minutos]

INTERVAL=${1:-10}
DURATION=${2:-10}
OUTPUT_DIR="../results/server-metrics"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_FILE="${OUTPUT_DIR}/docker-stats-${TIMESTAMP}.csv"

mkdir -p "$OUTPUT_DIR"

echo "=== Docker Stats Monitor ==="
echo "Intervalo: ${INTERVAL}s | Duración: ${DURATION}m"
echo "Salida: $OUTPUT_FILE"
echo "Inicio: $(date)"
echo ""

echo "timestamp,name,cpu%,mem%,mem_usage,net_input,net_output,block_input,block_output,pids" > "$OUTPUT_FILE"

END=$((SECONDS + DURATION * 60))
while [ $SECONDS -lt $END ]; do
    docker stats --no-stream --format "{{.Name}},{{.CPUPerc}},{{.MemPerc}},{{.MemUsage}},{{.NetIO}},{{.BlockIO}},{{.PIDs}}" \
        | while IFS= read -r line; do
            echo "$(date +%Y-%m-%dT%H:%M:%S),$line" >> "$OUTPUT_FILE"
        done
    sleep "$INTERVAL"
done

echo "Monitoreo completado: $(date)"
echo "Archivo: $OUTPUT_FILE"
