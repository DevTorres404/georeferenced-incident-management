<?php

namespace App\Operations\Application\DTOs;

use JsonSerializable;

final class OperatorProfileData implements JsonSerializable
{
    public function __construct(
        public readonly OperationalUserData $operator,
        public readonly int $incidentCapacity,
        public readonly ?OperationalUserData $supervisor = null
    ) {
    }

    public function jsonSerialize(): array
    {
        return [
            'operator' => $this->operator,
            'incident_capacity' => $this->incidentCapacity,
            'supervisor' => $this->supervisor,
        ];
    }
}
