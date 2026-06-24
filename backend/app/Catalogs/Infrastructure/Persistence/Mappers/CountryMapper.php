<?php

namespace App\Catalogs\Infrastructure\Persistence\Mappers;

use App\Catalogs\Application\DTOs\CountryData;
use App\Incidents\Infrastructure\Persistence\Models\Country;

final class CountryMapper
{
    public function fromModel(Country $country): CountryData
    {
        return new CountryData(
            id: (int) $country->id,
            name: $country->name,
            isoCode: $country->iso_code
        );
    }
}
