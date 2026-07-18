<?php

namespace App\Incidents\Application\DTOs;

final class ChangeStateInputData
{
    public function __construct(
        public readonly int $stateId,
        public readonly ?string $comment = null
    ) {}
}
