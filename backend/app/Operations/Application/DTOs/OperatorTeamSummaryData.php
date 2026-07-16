<?php

declare(strict_types=1);

namespace App\Operations\Application\DTOs;

use JsonSerializable;

final readonly class OperatorTeamSummaryData implements JsonSerializable
{
    public function __construct(
        public int $id,
        public string $firstName,
        public string $lastName,
        public string $email,
        public int $activeIncidents,
        public int $workloadPoints,
        public int $maxWorkloadPoints,
        public ?string $territory,
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'first_name' => $this->firstName,
            'last_name' => $this->lastName,
            'email' => $this->email,
            'active_incidents' => $this->activeIncidents,
            'workload_points' => $this->workloadPoints,
            'max_workload_points' => $this->maxWorkloadPoints,
            'territory' => $this->territory,
        ];
    }
}
