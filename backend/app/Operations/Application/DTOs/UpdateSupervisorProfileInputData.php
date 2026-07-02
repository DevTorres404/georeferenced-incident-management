<?php

namespace App\Operations\Application\DTOs;

final class UpdateSupervisorProfileInputData
{
    public function __construct(
        public readonly int $supervisorUserId,
        public readonly int $maxOperators
    ) {
    }
}
