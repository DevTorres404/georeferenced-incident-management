<?php

namespace App\Incidents\Application\DTOs;

final class DashboardMetricsResultData
{
    /**
     * @param  array  $kpis  ['total' => 0, 'pending' => 0, 'progress' => 0, 'resolved' => 0]
     * @param  array  $countsByCategory  ['Alumbrado' => 10, 'Baches' => 5]
     * @param  array  $countsByPriority  ['Critica' => 2, 'Alta' => 10, 'Media' => 15, 'Baja' => 3]
     * @param  array  $countsByState  ['Pendiente' => 20, 'En proceso' => 5, 'Resuelta' => 5]
     * @param  array  $monthlyTrend  ['months' => [...], 'registered' => [...], 'resolved' => [...], 'pending' => [...]]
     * @param  array  $topCities  [['city' => 'Quito, Pichincha', 'count' => 50, 'pct' => 50, 'pending' => 10, 'progress' => 20, 'resolved' => 20]]
     * @param  float  $averageResolutionDays  2.5
     */
    public function __construct(
        public readonly array $kpis,
        public readonly array $countsByCategory,
        public readonly array $countsByPriority,
        public readonly array $countsByState,
        public readonly array $monthlyTrend,
        public readonly array $topCities,
        public readonly float $averageResolutionDays
    ) {}
}
