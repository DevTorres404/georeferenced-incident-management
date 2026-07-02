<?php

namespace App\Operations\Application\DTOs;

use JsonSerializable;

final class OperationalUserData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly string $firstName,
        public readonly string $lastName,
        public readonly string $email,
        public readonly ?string $roleCode,
        public readonly ?OperationalTerritoryData $territory = null,
        public readonly ?OperationalTerritoryData $operationalZone = null
    ) {
    }

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'first_name' => $this->firstName,
            'last_name' => $this->lastName,
            'email' => $this->email,
            'role_code' => $this->roleCode,
            'territory' => $this->territory,
            'operational_zone' => $this->operationalZone,
        ];
    }
}
