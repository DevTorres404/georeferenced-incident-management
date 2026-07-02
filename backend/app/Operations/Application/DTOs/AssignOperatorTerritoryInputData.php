<?php

namespace App\Operations\Application\DTOs;

final class AssignOperatorTerritoryInputData
{
    public function __construct(
        public readonly int $operatorUserId,
        public readonly int $territorialUnitId,
        public readonly int $assignedByUserId
    ) {
    }
}
