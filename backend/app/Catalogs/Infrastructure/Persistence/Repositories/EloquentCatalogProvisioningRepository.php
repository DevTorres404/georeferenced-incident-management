<?php

declare(strict_types=1);

namespace App\Catalogs\Infrastructure\Persistence\Repositories;

use App\Catalogs\Application\DTOs\ApproveCategoryRequestInputData;
use App\Catalogs\Application\DTOs\CreatedCatalogPairData;
use App\Catalogs\Application\Ports\CatalogProvisioningPort;
use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\Subcategory;

final class EloquentCatalogProvisioningRepository implements CatalogProvisioningPort
{
    public function createCategoryWithSubcategory(
        ApproveCategoryRequestInputData $data
    ): CreatedCatalogPairData {
        $category = Category::create([
            'name' => trim($data->categoryName),
            'description' => $data->categoryDescription,
            'icon' => $data->icon,
            'color' => $data->color,
            'is_active' => true,
            'is_fallback' => false,
        ]);

        $subcategory = Subcategory::create([
            'category_id' => $category->id,
            'name' => trim($data->subcategoryName),
            'description' => $data->subcategoryDescription,
            'is_active' => true,
        ]);

        return new CreatedCatalogPairData(
            categoryId: (int) $category->id,
            subcategoryId: (int) $subcategory->id,
        );
    }
}
