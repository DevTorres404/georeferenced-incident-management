<?php

namespace App\Catalogs\Application\DTOs;

use JsonSerializable;

final class PermissionData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly string $code,
        public readonly string $name,
        public readonly string $description,
        public readonly string $module
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'description' => $this->description,
            'module' => $this->module,
        ];
    }
}
