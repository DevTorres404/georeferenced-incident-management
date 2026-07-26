<?php

declare(strict_types=1);

namespace App\Catalogs\Application\Ports;

use App\Catalogs\Application\DTOs\ApproveCategoryRequestInputData;
use App\Catalogs\Application\DTOs\CreatedCatalogPairData;

interface CatalogProvisioningPort
{
    public function createCategoryWithSubcategory(
        ApproveCategoryRequestInputData $data
    ): CreatedCatalogPairData;
}
