<?php

namespace App\Operations\Application\DTOs;

final class UpdateOperatorProfileInputData
{
    public function __construct(
        public readonly int $operatorUserId,
        public readonly int $incidentCapacity
    ) {
    }
}
