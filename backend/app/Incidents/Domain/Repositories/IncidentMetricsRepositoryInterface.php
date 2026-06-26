<?php

namespace App\Incidents\Domain\Repositories;

interface IncidentMetricsRepositoryInterface
{
    /**
     * Devuelve los KPIs principales: total, pendientes, en_proceso, resueltas.
     */
    public function getKpis(): array;

    /**
     * Devuelve el conteo de incidencias agrupadas por categoría.
     * Ejemplo: ['Alumbrado' => 10, 'Baches' => 5]
     */
    public function getCountsByCategory(): array;

    /**
     * Devuelve el conteo de incidencias agrupadas por prioridad.
     */
    public function getCountsByPriority(): array;

    /**
     * Devuelve el conteo de incidencias agrupadas por estado.
     */
    public function getCountsByState(): array;

    /**
     * Devuelve la tendencia mensual de registradas y resueltas de los últimos X meses.
     * @return array{months: string[], registered: int[], resolved: int[], pending: int[]}
     */
    public function getMonthlyTrend(int $months = 6): array;

    /**
     * Devuelve las ciudades con más incidencias.
     */
    public function getTopCities(int $limit = 6): array;

    /**
     * Devuelve el tiempo promedio de resolución en días.
     */
    public function getAverageResolutionDays(): float;
}
