<?php

declare(strict_types=1);

namespace App\Operations\Application\Ports;

use App\Operations\Application\DTOs\OperatorInfoData;
use App\Operations\Application\DTOs\OperatorMetricsData;

interface OperatorWorkReportRepositoryInterface
{
    public function getOperatorInfo(int $operatorId): OperatorInfoData;

    public function getMetrics(int $operatorId): OperatorMetricsData;

    /**
     * @return array<int, array>
     */
    public function getRecentIncidents(int $operatorId, ?int $limit = 50): array;
}
