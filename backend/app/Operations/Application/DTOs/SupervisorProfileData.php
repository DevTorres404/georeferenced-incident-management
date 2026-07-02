<?php

namespace App\Operations\Application\DTOs;

use JsonSerializable;

final class SupervisorProfileData implements JsonSerializable
{
    /**
     * @param array<int, OperationalUserData> $operators
     */
    public function __construct(
        public readonly OperationalUserData $supervisor,
        public readonly int $maxOperators,
        public readonly int $activeOperatorsCount,
        public readonly array $operators = []
    ) {
    }

    public function jsonSerialize(): array
    {
        return [
            'supervisor' => $this->supervisor,
            'max_operators' => $this->maxOperators,
            'active_operators_count' => $this->activeOperatorsCount,
            'operators' => $this->operators,
        ];
    }
}
