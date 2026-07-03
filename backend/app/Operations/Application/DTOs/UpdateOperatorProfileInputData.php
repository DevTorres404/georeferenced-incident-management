<?php

namespace App\Operations\Application\DTOs;

final class UpdateOperatorProfileInputData
{
    public function __construct(
        public readonly int $operatorUserId,
        public readonly int $maxActiveIncidents,
        public readonly int $maxWorkloadPoints,
        public readonly bool $active
    ) {
    }
}
