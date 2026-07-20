<?php

declare(strict_types=1);

namespace App\Operations\Application\DTOs;

use JsonSerializable;

final class OperatorInfoData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly string $firstName,
        public readonly string $lastName,
        public readonly string $email
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'first_name' => $this->firstName,
            'last_name' => $this->lastName,
            'email' => $this->email,
        ];
    }
}
