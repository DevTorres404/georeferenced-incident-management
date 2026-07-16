<?php

namespace App\Incidents\Application\DTOs;

final readonly class StateChangeRequestData
{
    public function __construct(
        public int $id,
        public int $incidentId,
        public int $requestedByUserId,
        public string $requestedByUserName,
        public int $requestedStateId,
        public string $requestedStateName,
        public string $reason,
        public string $status,
        public ?int $reviewedByUserId,
        public ?string $reviewedByUserName,
        public ?string $reviewerComment,
        public string $createdAt,
        public ?string $reviewedAt,
    ) {}
}
