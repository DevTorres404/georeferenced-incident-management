<?php

declare(strict_types=1);

namespace App\Operations\Application\UseCases;

use App\Operations\Application\DTOs\OperatorWorkReportData;
use App\Operations\Application\Ports\OperatorWorkReportRepositoryInterface;

final class OperatorWorkReportUseCase
{
    public function __construct(
        private readonly OperatorWorkReportRepositoryInterface $reportRepository
    ) {}

    public function generate(int $operatorId, ?int $limit = 50): OperatorWorkReportData
    {
        $operator = $this->reportRepository->getOperatorInfo($operatorId);
        $metrics = $this->reportRepository->getMetrics($operatorId);
        $recentIncidents = $this->reportRepository->getRecentIncidents($operatorId, $limit);

        return new OperatorWorkReportData(
            operator: $operator,
            metrics: $metrics,
            recentIncidents: $recentIncidents
        );
    }
}
