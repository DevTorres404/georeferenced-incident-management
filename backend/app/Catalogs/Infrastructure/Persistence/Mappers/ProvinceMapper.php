<?php

namespace App\Catalogs\Infrastructure\Persistence\Mappers;

use App\Catalogs\Application\DTOs\ProvinceData;
use App\Incidents\Infrastructure\Persistence\Models\Province;

final class ProvinceMapper
{
    public function fromModel(Province $province): ProvinceData
    {
        return new ProvinceData(
            id: (int) $province->id,
            countryId: (int) $province->country_id,
            name: $province->name
        );
    }
}
