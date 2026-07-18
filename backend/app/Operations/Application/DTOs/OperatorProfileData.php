<?php

namespace App\Operations\Application\DTOs;

use JsonSerializable;

final class OperatorProfileData implements JsonSerializable
{
    public function __construct(
        public readonly OperationalUserData $operator,
        public readonly int $maxActiveIncidents,
        public readonly int $maxWorkloadPoints,
        public readonly bool $active,
        public readonly int $currentActiveIncidents = 0,
        public readonly int $currentWorkloadPoints = 0,
        public readonly ?OperationalUserData $supervisor = null
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'operator' => $this->operator,
            'incident_capacity' => $this->maxActiveIncidents,
            'max_active_incidents' => $this->maxActiveIncidents,
            'max_workload_points' => $this->maxWorkloadPoints,
            'active' => $this->active,
            'current_active_incidents' => $this->currentActiveIncidents,
            'current_workload_points' => $this->currentWorkloadPoints,
            'supervisor' => $this->supervisor,
        ];
    }
}
