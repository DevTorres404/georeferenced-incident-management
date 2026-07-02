<?php

namespace App\TerritorialUnits\Application\UseCases;

use App\TerritorialUnits\Application\DTOs\SaveTerritorialUnitData;
use App\TerritorialUnits\Application\DTOs\TerritorialUnitData;
use App\TerritorialUnits\Application\DTOs\TerritorialUnitFiltersData;
use App\TerritorialUnits\Domain\Repositories\TerritorialUnitRepositoryInterface;

final class TerritorialUnitUseCase
{
    public function __construct(private TerritorialUnitRepositoryInterface $territorialUnitRepository)
    {
    }

    /**
     * @return array<int, TerritorialUnitData>
     */
    public function list(TerritorialUnitFiltersData $filters): array
    {
        return $this->territorialUnitRepository->list($filters);
    }

    /**
     * @return array<int, TerritorialUnitData>
     */
    public function tree(): array
    {
        return $this->territorialUnitRepository->tree();
    }

    /**
     * @return array<int, TerritorialUnitData>
     */
    public function children(int $parentId): array
    {
        return $this->territorialUnitRepository->children($parentId);
    }

    public function find(int $id): TerritorialUnitData
    {
        return $this->territorialUnitRepository->find($id);
    }

    public function resolveOperationalZone(int $id): TerritorialUnitData
    {
        return $this->territorialUnitRepository->resolveOperationalZone($id);
    }

    public function create(SaveTerritorialUnitData $data): TerritorialUnitData
    {
        return $this->territorialUnitRepository->create($data);
    }

    public function update(int $id, SaveTerritorialUnitData $data): TerritorialUnitData
    {
        return $this->territorialUnitRepository->update($id, $data);
    }

    public function deactivate(int $id): void
    {
        $this->territorialUnitRepository->deactivate($id);
    }
}
