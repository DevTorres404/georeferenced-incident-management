<?php

declare(strict_types=1);

namespace App\Operations\Application\DTOs;

use JsonSerializable;

final class OperatorMetricsData implements JsonSerializable
{
    public function __construct(
        public readonly int $totalAssigned,
        public readonly int $totalResolved,
        public readonly int $reopenedCount,
        public readonly float $avgResponseHours,
        public readonly float $reopenRate,
        public readonly int $currentWorkload
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'total_assigned' => $this->totalAssigned,
            'total_resolved' => $this->totalResolved,
            'reopened_count' => $this->reopenedCount,
            'avg_response_hours' => $this->avgResponseHours,
            'reopen_rate' => $this->reopenRate,
            'current_workload' => $this->currentWorkload,
        ];
    }
}
