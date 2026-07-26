<?php

declare(strict_types=1);

namespace App\Operations\Application\DTOs;

final readonly class ReleaseSupervisorFromZoneInputData
{
    public function __construct(
        public int $zoneId,
        public int $releasedByUserId,
    ) {}
}
