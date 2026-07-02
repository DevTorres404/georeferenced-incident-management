<?php

namespace App\TerritorialUnits\Domain\Repositories;

use App\TerritorialUnits\Application\DTOs\SaveTerritorialUnitData;
use App\TerritorialUnits\Application\DTOs\TerritorialUnitData;
use App\TerritorialUnits\Application\DTOs\TerritorialUnitFiltersData;

interface TerritorialUnitRepositoryInterface
{
    /**
     * @return array<int, TerritorialUnitData>
     */
    public function list(TerritorialUnitFiltersData $filters): array;

    /**
     * @return array<int, TerritorialUnitData>
     */
    public function tree(): array;

    /**
     * @return array<int, TerritorialUnitData>
     */
    public function children(int $parentId): array;

    public function find(int $id): TerritorialUnitData;

    public function resolveOperationalZone(int $id): TerritorialUnitData;

    public function create(SaveTerritorialUnitData $data): TerritorialUnitData;

    public function update(int $id, SaveTerritorialUnitData $data): TerritorialUnitData;

    public function deactivate(int $id): void;
}
