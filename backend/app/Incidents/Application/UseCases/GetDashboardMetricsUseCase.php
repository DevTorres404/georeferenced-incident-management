<?php

namespace App\Incidents\Application\UseCases;

use App\Incidents\Application\DTOs\DashboardMetricsResultData;
use App\Incidents\Domain\Repositories\IncidentMetricsRepositoryInterface;

final class GetDashboardMetricsUseCase
{
    public function __construct(
        private IncidentMetricsRepositoryInterface $metricsRepository
    ) {}

    public function execute(int $userId): DashboardMetricsResultData
    {
        return new DashboardMetricsResultData(
            kpis: $this->metricsRepository->getKpis($userId),
            countsByCategory: $this->metricsRepository->getCountsByCategory($userId),
            countsByPriority: $this->metricsRepository->getCountsByPriority($userId),
            countsByState: $this->metricsRepository->getCountsByState($userId),
            monthlyTrend: $this->metricsRepository->getMonthlyTrend($userId, 6),
            topCities: $this->metricsRepository->getTopCities($userId, 6),
            averageResolutionDays: $this->metricsRepository->getAverageResolutionDays($userId)
        );
    }
}
