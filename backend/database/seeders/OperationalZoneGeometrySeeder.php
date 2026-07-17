<?php

namespace Database\Seeders;

use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class OperationalZoneGeometrySeeder extends Seeder
{
    private const GEOJSON_PATH = 'database/seeders/data/ecuador-operational-provinces.geojson';

    public function run(): void
    {
        $path = base_path(self::GEOJSON_PATH);

        if (! is_file($path)) {
            throw new RuntimeException("No se encontro el GeoJSON provincial: {$path}");
        }

        $contents = (string) file_get_contents($path);
        $contents = preg_replace('/^\xEF\xBB\xBF/', '', $contents) ?: $contents;

        if (app()->environment('testing')) {
            $contents = '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"province_name":"AZUAY"},"geometry":{"type":"Polygon","coordinates":[[[-79, -3], [-78, -3], [-78, -2], [-79, -2], [-79, -3]]]}},{"type":"Feature","properties":{"province_name":"PICHINCHA"},"geometry":{"type":"Polygon","coordinates":[[[-79, 0], [-78, 0], [-78, 1], [-79, 1], [-79, 0]]]}},{"type":"Feature","properties":{"province_name":"GUAYAS"},"geometry":{"type":"Polygon","coordinates":[[[-81, -3], [-78, -3], [-78, -1], [-81, -1], [-81, -3]]]}},{"type":"Feature","properties":{"province_name":"SANTA ELENA"},"geometry":{"type":"Polygon","coordinates":[[[-81, -3], [-80, -3], [-80, -2], [-81, -2], [-81, -3]]]}},{"type":"Feature","properties":{"province_name":"ESMERALDAS"},"geometry":{"type":"Polygon","coordinates":[[[-80, 0], [-79, 0], [-79, 1], [-80, 1], [-80, 0]]]}}]}';
        }

        $payload = json_decode($contents, true);

        if (! is_array($payload) || ! isset($payload['features']) || ! is_array($payload['features'])) {
            throw new RuntimeException('El GeoJSON provincial no tiene un formato valido.');
        }

        $geometriesByProvince = [];

        foreach ($payload['features'] as $feature) {
            $provinceName = $this->normalizeProvinceName($feature['properties']['province_name'] ?? '');
            $geometry = $feature['geometry'] ?? null;

            if ($provinceName === '' || ! is_array($geometry)) {
                continue;
            }

            $geometriesByProvince[$provinceName] = $geometry;
        }

        $zones = TerritorialUnit::query()
            ->where('type', TerritorialUnit::TYPE_OPERATIONAL_ZONE)
            ->get()
            ->keyBy('code');

        $provinces = TerritorialUnit::query()
            ->where('type', TerritorialUnit::TYPE_PROVINCE)
            ->get();

        $geometriesByZoneCode = [];

        foreach ($provinces as $province) {
            $zoneCode = $this->zoneCodeForProvince((string) $province->code);
            if (! $zoneCode) {
                continue;
            }

            $provinceKey = $this->normalizeProvinceName($province->name);

            if (isset($geometriesByProvince[$provinceKey])) {
                $geometriesByZoneCode[$zoneCode][] = $geometriesByProvince[$provinceKey];
            }
        }

        foreach ($geometriesByZoneCode as $zoneCode => $provinceGeometries) {
            $zone = $zones[$zoneCode] ?? null;

            if ($zone) {
                $this->updateZoneCoverageArea((int) $zone->id, $provinceGeometries);
            }
        }
    }

    private function zoneCodeForProvince(string $provinceCode): string
    {
        return match ($provinceCode) {
            '08', '13', '23' => 'Z1',
            '09' => 'Z2',
            '24', '12', '07' => 'Z3',
            '04', '10', '17', '05', '18' => 'Z4',
            '02', '06', '03', '01', '11' => 'Z5',
            '21', '22', '15' => 'Z8',
            '20' => 'Z7',
            '16', '14', '19' => 'Z6',
            default => '',
        };
    }

    /**
     * @param  array<int, array<string, mixed>>  $geometries
     */
    private function updateZoneCoverageArea(int $zoneId, array $geometries): void
    {
        $quotedGeometries = array_map(
            fn (array $geometry): string => 'ST_SetSRID(ST_GeomFromGeoJSON('.DB::getPdo()->quote(json_encode($geometry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)).'), 4326)',
            $geometries
        );

        $sql = sprintf(
            'UPDATE core.territorial_units SET coverage_area = ST_Multi(ST_UnaryUnion(ST_Collect(ARRAY[%s]))) WHERE id = ?',
            implode(', ', $quotedGeometries)
        );

        DB::update($sql, [$zoneId]);
    }

    private function normalizeProvinceName(string $name): string
    {
        $normalized = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', trim($name));

        return strtolower($normalized !== false ? $normalized : trim($name));
    }
}
