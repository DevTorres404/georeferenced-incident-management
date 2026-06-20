<?php

namespace Database\Seeders;

use App\Incidents\Infrastructure\Persistence\Models\City;
use App\Incidents\Infrastructure\Persistence\Models\Country;
use App\Incidents\Infrastructure\Persistence\Models\Province;
use Illuminate\Database\Seeder;

/**
 * Seeder geográfico base.
 *
 * Crea el país, provinces y cities principales de Ecuador
 * como datos iniciales. Ajustar según el país de despliegue.
 */
class CountrySeeder extends Seeder
{
    public function run(): void
    {
        // ── País ──
        $ecuador = Country::updateOrCreate(
            ['iso_code' => 'EC'],
            ['name' => 'Ecuador']
        );

        // ── Provincias con cities principales ──
        $provinces = [
            'Pichincha' => ['Quito', 'Cayambe', 'Rumiñahui'],
            'Guayas'    => ['Guayaquil', 'Durán', 'Samborondón'],
            'Azuay'     => ['Cuenca', 'Gualaceo'],
            'Manabí'    => ['Portoviejo', 'Manta'],
            'Tungurahua'=> ['Ambato', 'Baños'],
            'El Oro'    => ['Machala', 'Pasaje'],
        ];

        foreach ($provinces as $nombreProvincia => $cities) {
            $provincia = Province::updateOrCreate(
                ['country_id' => $ecuador->id, 'name' => $nombreProvincia],
                ['is_active' => true]
            );

            foreach ($cities as $nombreCiudad) {
                City::updateOrCreate(
                    ['province_id' => $provincia->id, 'name' => $nombreCiudad],
                    ['is_active' => true]
                );
            }
        }
    }
}

