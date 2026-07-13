<?php

namespace App\Catalogs\Infrastructure\Persistence\Mappers;

use App\Catalogs\Application\DTOs\SubcategoryData;
use App\Incidents\Infrastructure\Persistence\Models\Subcategory;

final class SubcategoryMapper
{
    public function fromModel(Subcategory $subcategory): SubcategoryData
    {
        return new SubcategoryData(
            id: (int) $subcategory->id,
            categoryId: (int) $subcategory->category_id,
            name: $subcategory->name,
            description: $subcategory->description ?? null,
            isActive: (bool) $subcategory->is_active
        );
    }
}
