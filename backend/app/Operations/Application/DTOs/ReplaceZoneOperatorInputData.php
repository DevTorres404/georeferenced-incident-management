<?php

namespace App\Operations\Application\DTOs;

final class ReplaceZoneOperatorInputData
{
    public function __construct(
        public readonly int $currentOperatorUserId,
        public readonly int $replacementOperatorUserId,
        public readonly int $assignedByUserId
    ) {}
}
