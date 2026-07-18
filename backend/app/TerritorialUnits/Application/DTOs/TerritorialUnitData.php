<?php

namespace App\TerritorialUnits\Application\DTOs;

use JsonSerializable;

final class TerritorialUnitData implements JsonSerializable
{
    /**
     * @param  array<int, TerritorialUnitData>  $children
     */
    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly string $type,
        public readonly ?int $parentId,
        public readonly ?string $code,
        public readonly bool $isActive,
        public readonly string $fullPath,
        public readonly array $children = []
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'type' => $this->type,
            'parent_id' => $this->parentId,
            'code' => $this->code,
            'is_active' => $this->isActive,
            'full_path' => $this->fullPath,
            'children' => $this->children,
        ];
    }
}
