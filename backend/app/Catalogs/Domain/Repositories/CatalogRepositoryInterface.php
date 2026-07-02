<?php

namespace App\Catalogs\Domain\Repositories;

use App\Catalogs\Application\DTOs\CatalogPaginationFiltersData;
use App\Shared\Application\Results\PaginatedResult;

interface CatalogRepositoryInterface
{
    public function overview(): array;

    public function categories();

    public function subcategories(int $categoriaId);

    public function priorities();

    public function states();

    public function transitions(?int $estadoId = null);

    public function roles();

    public function permissions();

    public function paginate(string $catalog, CatalogPaginationFiltersData $filters): PaginatedResult;

    public function create(string $catalog, array $data);

    public function find(string $catalog, int $id);

    public function update(string $catalog, int $id, array $data);

    public function delete(string $catalog, int $id): void;
}
