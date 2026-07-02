<?php

namespace App\Operations\Application\DTOs;

final class SyncSupervisorOperatorsInputData
{
    /**
     * @param array<int, int> $operatorUserIds
     */
    public function __construct(
        public readonly int $supervisorUserId,
        public readonly array $operatorUserIds,
        public readonly int $assignedByUserId
    ) {
    }
}
