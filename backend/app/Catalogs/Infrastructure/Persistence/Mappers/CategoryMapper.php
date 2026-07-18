<?php

namespace App\Catalogs\Infrastructure\Persistence\Mappers;

use App\Catalogs\Application\DTOs\CategoryData;
use App\Incidents\Infrastructure\Persistence\Models\Category;

final class CategoryMapper
{
    public function __construct(private SubcategoryMapper $subcategoryMapper) {}

    public function fromModel(Category $category): CategoryData
    {
        $subcategories = [];

        if ($category->relationLoaded('subcategories')) {
            $subcategories = $category->subcategories
                ->map(fn ($subcategory) => $this->subcategoryMapper->fromModel($subcategory))
                ->toArray();
        }

        return new CategoryData(
            id: (int) $category->id,
            name: $category->name,
            description: $category->description ?? null,
            icon: $category->icon ?? null,
            color: $category->color ?? null,
            isActive: (bool) $category->is_active,
            subcategories: $subcategories
        );
    }
}
