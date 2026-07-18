<?php

namespace App\Operations\Application\DTOs;

final class AssignSupervisorToZoneInputData
{
    public function __construct(
        public readonly int $zoneId,
        public readonly int $supervisorUserId,
        public readonly int $assignedByUserId
    ) {}
}
