<?php

namespace App\Catalogs\Application\UseCases;

use App\Catalogs\Application\DTOs\CatalogPaginationFiltersData;
use App\Shared\Application\Results\PaginatedResult;
use App\Catalogs\Domain\Repositories\CatalogRepositoryInterface;

final class CatalogManagementUseCase
{
    public function __construct(private CatalogRepositoryInterface $catalogRepository)
    {
    }

    public function paginate(string $catalog, CatalogPaginationFiltersData $filters): PaginatedResult
    {
        return $this->catalogRepository->paginate($catalog, $filters);
    }

    public function create(string $catalog, array $data)
    {
        return $this->catalogRepository->create($catalog, $data);
    }

    public function find(string $catalog, int $id)
    {
        return $this->catalogRepository->find($catalog, $id);
    }

    public function update(string $catalog, int $id, array $data)
    {
        return $this->catalogRepository->update($catalog, $id, $data);
    }

    public function delete(string $catalog, int $id): void
    {
        $this->catalogRepository->delete($catalog, $id);
    }
}
