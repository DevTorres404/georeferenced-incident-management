<?php

namespace App\Incidents\Application\UseCases;

use App\Incidents\Application\DTOs\DashboardMetricsResultData;
use App\Incidents\Domain\Repositories\IncidentMetricsRepositoryInterface;

final class GetDashboardMetricsUseCase
{
    public function __construct(
        private IncidentMetricsRepositoryInterface $metricsRepository
    ) {
    }

    public function execute(): DashboardMetricsResultData
    {
        return new DashboardMetricsResultData(
            kpis: $this->metricsRepository->getKpis(),
            countsByCategory: $this->metricsRepository->getCountsByCategory(),
            countsByPriority: $this->metricsRepository->getCountsByPriority(),
            countsByState: $this->metricsRepository->getCountsByState(),
            monthlyTrend: $this->metricsRepository->getMonthlyTrend(6),
            topCities: $this->metricsRepository->getTopCities(6),
            averageResolutionDays: $this->metricsRepository->getAverageResolutionDays()
        );
    }
}
