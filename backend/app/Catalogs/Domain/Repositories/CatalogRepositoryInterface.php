<?php

namespace App\Catalogs\Domain\Repositories;

use App\Catalogs\Application\DTOs\CatalogPaginationFiltersData;
use App\Catalogs\Application\DTOs\CategoryData;
use App\Catalogs\Application\DTOs\PermissionData;
use App\Catalogs\Application\DTOs\PriorityData;
use App\Catalogs\Application\DTOs\RoleData;
use App\Catalogs\Application\DTOs\StateData;
use App\Catalogs\Application\DTOs\StateTransitionData;
use App\Catalogs\Application\DTOs\SubcategoryData;
use App\Shared\Application\Results\PaginatedResult;

interface CatalogRepositoryInterface
{
    /**
     * Retorna un overview completo de los catálogos principales.
     *
     * @return array<string, array>
     */
    public function overview(): array;

    /**
     * Obtiene todas las categorías activas con sus subcategorías.
     *
     * @return array<int, CategoryData>
     */
    public function categories(): array;

    /**
     * Obtiene todas las subcategorías de una categoría.
     *
     * @return array<int, SubcategoryData>
     */
    public function subcategories(int $categoriaId): array;

    /**
     * Obtiene todas las prioridades activas.
     *
     * @return array<int, PriorityData>
     */
    public function priorities(): array;

    /**
     * Obtiene todos los estados activos.
     *
     * @return array<int, StateData>
     */
    public function states(): array;

    /**
     * Obtiene las transiciones de estado.
     *
     * @return array<int, StateTransitionData>
     */
    public function transitions(?int $estadoId = null): array;

    /**
     * Obtiene todos los roles activos.
     *
     * @return array<int, RoleData>
     */
    public function roles(): array;

    /**
     * Obtiene todos los permisos.
     *
     * @return array<int, PermissionData>
     */
    public function permissions(): array;

    /**
     * Pagina registros de un catálogo.
     */
    public function paginate(string $catalog, CatalogPaginationFiltersData $filters): PaginatedResult;

    /**
     * Crea un nuevo registro en un catálogo.
     *
     * @return array<string, mixed>
     */
    public function create(string $catalog, array $data): array;

    /**
     * Encuentra un registro en un catálogo.
     *
     * @return array<string, mixed>
     */
    public function find(string $catalog, int $id): array;

    /**
     * Actualiza un registro en un catálogo.
     *
     * @return array<string, mixed>
     */
    public function update(string $catalog, int $id, array $data): array;

    /**
     * Elimina un registro de un catálogo.
     */
    public function delete(string $catalog, int $id): void;
}
