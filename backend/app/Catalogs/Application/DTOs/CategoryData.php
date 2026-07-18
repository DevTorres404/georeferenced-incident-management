<?php

namespace App\Catalogs\Application\DTOs;

use JsonSerializable;

/**
 * Data Transfer Object para Categoría de Incidencia.
 *
 * Representa una categoría de primer nivel (Vialidad, Servicios, etc.)
 */
final class CategoryData implements JsonSerializable
{
    /**
     * @param  array<int, SubcategoryData>  $subcategories
     */
    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly ?string $description,
        public readonly ?string $icon,
        public readonly ?string $color,
        public readonly bool $isActive,
        public readonly array $subcategories = []
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'icon' => $this->icon,
            'color' => $this->color,
            'is_active' => $this->isActive,
            'subcategories' => $this->subcategories,
        ];
    }
}
