<?php

namespace Database\Seeders;

use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use SplFileObject;

class TerritorialUnitSeeder extends Seeder
{
    private const DATA_FILE = 'seeders/data/territorial_units_cge_2026.csv';

    private const COUNTRY_CODE = 'EC';

    public function run(): void
    {
        $path = database_path(self::DATA_FILE);

        if (! is_file($path)) {
            throw new RuntimeException("No se encontro el dataset territorial: {$path}");
        }

        DB::transaction(function () use ($path): void {
            $country = $this->unit(
                name: 'Ecuador',
                type: TerritorialUnit::TYPE_COUNTRY,
                parentId: null,
                code: self::COUNTRY_CODE,
                isActive: true
            );
            $zones = $this->operationalZones((int) $country->id);
            $syncedIds = [];

            // In testing environment, limit to a small subset to drastically speed up RefreshDatabase
            $isTesting = app()->environment('testing');

            foreach ($this->rows($path) as $row) {
                if ($isTesting && ! in_array($this->normalizeName($row['province_name']), ['Pichincha', 'Guayas', 'Azuay', 'Santa Elena', 'Esmeraldas'])) {
                    continue;
                }

                $isActive = $row['is_active'];
                $zone = $zones[$this->zoneCodeForProvince($row['province_code'])] ?? null;

                if (! $zone) {
                    if (! $isActive) {
                        continue;
                    }

                    throw new RuntimeException("No se encontro zona operativa para la provincia {$row['province_code']}");
                }

                $province = $this->unit(
                    name: $this->normalizeName($row['province_name']),
                    type: TerritorialUnit::TYPE_PROVINCE,
                    parentId: $country->id,
                    code: $row['province_code'] !== '' ? $row['province_code'] : null,
                    isActive: $isActive
                );
                $syncedIds[] = $province->id;

                $canton = $this->unit(
                    name: $this->normalizeName($row['canton_name']),
                    type: TerritorialUnit::TYPE_CANTON,
                    parentId: $zone->id,
                    code: $row['canton_code'] !== '' ? $row['canton_code'] : null,
                    isActive: $isActive
                );
                $syncedIds[] = $canton->id;

                $parish = $this->unit(
                    name: $this->normalizeName($row['parish_name']),
                    type: TerritorialUnit::TYPE_PARISH,
                    parentId: $canton->id,
                    code: $row['parish_code'] !== '' ? $row['parish_code'] : null,
                    isActive: $isActive
                );
                $syncedIds[] = $parish->id;
            }

            TerritorialUnit::query()
                ->whereIn('type', [
                    TerritorialUnit::TYPE_PROVINCE,
                    TerritorialUnit::TYPE_CANTON,
                    TerritorialUnit::TYPE_PARISH,
                ])
                ->whereNotIn('id', array_unique($syncedIds))
                ->update(['is_active' => false]);
        });
    }

    /**
     * @return iterable<array{province_code: string, province_name: string, canton_code: string, canton_name: string, parish_code: string, parish_name: string, is_active: bool}>
     */
    private function rows(string $path): iterable
    {
        $file = new SplFileObject($path);
        $file->setFlags(SplFileObject::READ_CSV | SplFileObject::SKIP_EMPTY | SplFileObject::DROP_NEW_LINE);

        $headers = null;

        foreach ($file as $row) {
            if (! is_array($row) || $row === [null] || count($row) < 4) {
                continue;
            }

            if ($headers === null) {
                $headers = array_map(fn ($header) => trim((string) $header), $row);

                continue;
            }

            $data = array_combine($headers, array_map(fn ($value) => trim((string) $value), $row));

            if (! is_array($data)) {
                continue;
            }

            if (
                ($data['province_name'] ?? '') === ''
                || ($data['canton_name'] ?? '') === ''
                || ($data['parish_name'] ?? '') === ''
            ) {
                continue;
            }

            yield [
                'province_code' => $data['province_code'] ?? '',
                'province_name' => $data['province_name'],
                'canton_code' => $data['canton_code'] ?? '',
                'canton_name' => $data['canton_name'],
                'parish_code' => $data['parish_code'] ?? '',
                'parish_name' => $data['parish_name'],
                'is_active' => $this->toBoolean($data['is_active'] ?? true),
            ];
        }
    }

    private function unit(string $name, string $type, ?int $parentId, ?string $code = null, bool $isActive = true): TerritorialUnit
    {
        $unit = $code
            ? TerritorialUnit::query()->where('code', $code)->first()
            : null;

        $unit ??= TerritorialUnit::query()
            ->where('parent_id', $parentId)
            ->where('name', $name)
            ->where(function ($query) use ($code): void {
                $query->whereNull('code');

                if ($code !== null) {
                    $query->orWhere('code', $code);
                }
            })
            ->first();

        if ($unit) {
            $unit->forceFill([
                'name' => $name,
                'type' => $type,
                'parent_id' => $parentId,
                'code' => $code,
                'is_active' => $isActive,
            ])->save();

            return $unit;
        }

        return TerritorialUnit::create([
            'name' => $name,
            'type' => $type,
            'parent_id' => $parentId,
            'code' => $code,
            'is_active' => $isActive,
        ]);
    }

    private function normalizeName(string $name): string
    {
        return mb_convert_case(trim($name), MB_CASE_TITLE, 'UTF-8');
    }

    private function toBoolean(mixed $value): bool
    {
        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    /**
     * @return array<string, TerritorialUnit>
     */
    private function operationalZones(int $countryId): array
    {
        $zones = [
            'Z1' => 'Costa Norte',
            'Z2' => 'Guayas',
            'Z3' => 'Costa Sur',
            'Z4' => 'Sierra Norte / Centro',
            'Z5' => 'Sierra Sur / Austro',
            'Z6' => 'Amazonia Sur',
            'Z7' => 'Insular',
            'Z8' => 'Amazonia Norte',
        ];

        $created = [];

        foreach ($zones as $code => $name) {
            $created[$code] = $this->unit(
                name: $name,
                type: TerritorialUnit::TYPE_OPERATIONAL_ZONE,
                parentId: $countryId,
                code: $code,
                isActive: true
            );
        }

        return $created;
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
}
