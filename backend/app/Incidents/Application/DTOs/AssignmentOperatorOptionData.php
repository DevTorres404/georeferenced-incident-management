<?php

namespace App\Incidents\Application\DTOs;

use JsonSerializable;

final class AssignmentOperatorOptionData implements JsonSerializable
{
    public function __construct(
        public readonly int $userId,
        public readonly string $fullName,
        public readonly string $email,
        public readonly ?int $zoneId,
        public readonly ?string $zoneName,
        public readonly int $activeIncidents,
        public readonly int $workloadPoints,
        public readonly int $maxActiveIncidents,
        public readonly int $maxWorkloadPoints,
        public readonly bool $available
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'user_id' => $this->userId,
            'full_name' => $this->fullName,
            'email' => $this->email,
            'zone_id' => $this->zoneId,
            'zone_name' => $this->zoneName,
            'active_incidents' => $this->activeIncidents,
            'workload_points' => $this->workloadPoints,
            'max_active_incidents' => $this->maxActiveIncidents,
            'max_workload_points' => $this->maxWorkloadPoints,
            'available' => $this->available,
        ];
    }
}
