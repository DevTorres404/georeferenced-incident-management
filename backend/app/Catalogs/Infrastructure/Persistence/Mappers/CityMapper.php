<?php

namespace App\Catalogs\Infrastructure\Persistence\Mappers;

use App\Catalogs\Application\DTOs\CityData;
use App\Incidents\Infrastructure\Persistence\Models\City;

final class CityMapper
{
    public function fromModel(City $city): CityData
    {
        return new CityData(
            id: (int) $city->id,
            provinceId: (int) $city->province_id,
            name: $city->name
        );
    }
}
