<?php

namespace App\Incidents\Application\DTOs;

final readonly class RequestStateChangeInputData
{
    public function __construct(
        public int $stateId,
        public string $reason,
    ) {}
}
