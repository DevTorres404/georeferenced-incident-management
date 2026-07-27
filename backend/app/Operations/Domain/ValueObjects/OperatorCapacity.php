<?php

declare(strict_types=1);

namespace App\Operations\Domain\ValueObjects;

final readonly class OperatorCapacity
{
    public function __construct(
        public int $maxActiveIncidents,
        public int $maxWorkloadPoints
    ) {}

    public function supports(OperatorWorkload $workload): bool
    {
        return $workload->activeIncidents <= $this->maxActiveIncidents
            && $workload->workloadPoints <= $this->maxWorkloadPoints;
    }
}
