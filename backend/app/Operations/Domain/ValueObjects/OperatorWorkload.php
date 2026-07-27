<?php

declare(strict_types=1);

namespace App\Operations\Domain\ValueObjects;

final readonly class OperatorWorkload
{
    public function __construct(
        public int $activeIncidents,
        public int $workloadPoints
    ) {}

    public static function empty(): self
    {
        return new self(0, 0);
    }

    public function plus(self $incoming): self
    {
        return new self(
            activeIncidents: $this->activeIncidents + $incoming->activeIncidents,
            workloadPoints: $this->workloadPoints + $incoming->workloadPoints
        );
    }
}
