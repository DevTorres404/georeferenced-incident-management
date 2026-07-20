<?php

declare(strict_types=1);

namespace App\Operations\Application\DTOs;

use JsonSerializable;

final class OperatorWorkReportData implements JsonSerializable
{
    /**
     * @param OperatorInfoData $operator
     * @param OperatorMetricsData $metrics
     * @param array<int, array> $recentIncidents
     */
    public function __construct(
        public readonly OperatorInfoData $operator,
        public readonly OperatorMetricsData $metrics,
        public readonly array $recentIncidents
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'operator' => $this->operator->jsonSerialize(),
            'metrics' => $this->metrics->jsonSerialize(),
            'recent_incidents' => $this->recentIncidents,
        ];
    }

    public function toArray(): array
    {
        return $this->jsonSerialize();
    }
}
