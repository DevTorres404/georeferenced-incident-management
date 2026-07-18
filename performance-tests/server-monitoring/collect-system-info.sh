#!/bin/bash
# collect-system-info.sh — Captura información del servidor antes de pruebas

OUTPUT_DIR="../results/server-metrics"
mkdir -p "$OUTPUT_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_FILE="${OUTPUT_DIR}/system-info-${TIMESTAMP}.txt"

{
    echo "============================================"
    echo " SGI - Información del Servidor"
    echo " Fecha: $(date)"
    echo "============================================"
    echo ""

    echo "--- Hostname ---"
    hostname
    echo ""

    echo "--- Kernel ---"
    uname -a
    echo ""

    echo "--- CPU ---"
    lscpu 2>/dev/null || echo "lscpu no disponible"
    echo ""

    echo "--- Memoria ---"
    free -h
    echo ""

    echo "--- Discos ---"
    lsblk 2>/dev/null || echo "lsblk no disponible"
    echo ""

    echo "--- Espacio en disco ---"
    df -h
    echo ""

    echo "--- Docker ---"
    docker version 2>/dev/null || echo "Docker no disponible"
    docker compose version 2>/dev/null || echo "Docker Compose no disponible"
    echo ""

    echo "--- Git ---"
    git branch --show-current
    git rev-parse HEAD
    git status --short
    echo ""

    echo "--- Servicios (Docker) ---"
    docker compose -f ../backend/docker-compose.prod.yml ps 2>/dev/null || echo "No se pudo listar servicios"
} > "$OUTPUT_FILE"

echo "Información guardada en: $OUTPUT_FILE"
cat "$OUTPUT_FILE"
