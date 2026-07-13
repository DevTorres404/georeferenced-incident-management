<?php

namespace App\Catalogs\Application\DTOs;

use JsonSerializable;

/**
 * Data Transfer Object para Subcategoría de Incidencia.
 *
 * Representa una subcategoría de segundo nivel (ej. Bache dentro de Vialidad)
 */
final class SubcategoryData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly int $categoryId,
        public readonly string $name,
        public readonly ?string $description,
        public readonly bool $isActive
    ) {
    }

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'category_id' => $this->categoryId,
            'name' => $this->name,
            'description' => $this->description,
            'is_active' => $this->isActive,
        ];
    }
}
