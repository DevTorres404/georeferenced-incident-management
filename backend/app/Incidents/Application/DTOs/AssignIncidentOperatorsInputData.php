<?php

namespace App\Incidents\Application\DTOs;

final class AssignIncidentOperatorsInputData
{
    /**
     * @param  array<int, int>  $supportOperatorIds
     */
    public function __construct(
        public readonly int $primaryOperatorId,
        public readonly array $supportOperatorIds = []
    ) {}
}
