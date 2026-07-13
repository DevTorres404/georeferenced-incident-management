<?php

namespace App\Catalogs\Infrastructure\Persistence\Repositories;

use App\Auth\Infrastructure\Persistence\Models\Permission;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Catalogs\Application\DTOs\CatalogPaginationFiltersData;
use App\Catalogs\Domain\Repositories\CatalogRepositoryInterface;
use App\Catalogs\Infrastructure\Persistence\Mappers\CategoryMapper;
use App\Catalogs\Infrastructure\Persistence\Mappers\PermissionMapper;
use App\Catalogs\Infrastructure\Persistence\Mappers\PriorityMapper;
use App\Catalogs\Infrastructure\Persistence\Mappers\RoleMapper;
use App\Catalogs\Infrastructure\Persistence\Mappers\StateMapper;
use App\Catalogs\Infrastructure\Persistence\Mappers\StateTransitionMapper;
use App\Catalogs\Infrastructure\Persistence\Mappers\SubcategoryMapper;
use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\Configuration;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Incidents\Infrastructure\Persistence\Models\StateTransition;
use App\Incidents\Infrastructure\Persistence\Models\Subcategory;
use App\Shared\Application\Results\PaginatedResult;
use Illuminate\Database\Eloquent\Model;

final class EloquentCatalogRepository implements CatalogRepositoryInterface
{
    private const MODELS = [
        'categories' => Category::class,
        'subcategories' => Subcategory::class,
        'priorities' => Priority::class,
        'states' => State::class,
        'transitions' => StateTransition::class,
        'configuraciones' => Configuration::class,
    ];

    public function __construct(
        private CategoryMapper $categoryMapper,
        private SubcategoryMapper $subcategoryMapper,
        private PriorityMapper $priorityMapper,
        private StateMapper $stateMapper,
        private StateTransitionMapper $transitionMapper,
        private RoleMapper $roleMapper,
        private PermissionMapper $permissionMapper
    ) {}

    public function overview(): array
    {
        return [
            'categories' => Category::activos()
                ->with(['subcategories' => fn ($q) => $q->activos()->orderBy('name')])
                ->orderBy('name')
                ->get()
                ->map(fn (Category $category) => $this->categoryMapper->fromModel($category))
                ->toArray(),
            'priorities' => Priority::activos()
                ->orderBy('level')
                ->get()
                ->map(fn (Priority $priority) => $this->priorityMapper->fromModel($priority))
                ->toArray(),
            'states' => State::activos()
                ->ordenado()
                ->get()
                ->map(fn (State $state) => $this->stateMapper->fromModel($state))
                ->toArray(),
            'roles' => Role::activos()
                ->with('permissions')
                ->orderBy('name')
                ->get()
                ->map(fn (Role $role) => $this->roleMapper->fromModel($role))
                ->toArray(),
        ];
    }

    public function categories(): array
    {
        return Category::activos()
            ->with(['subcategories' => fn ($q) => $q->activos()->orderBy('name')])
            ->orderBy('name')
            ->get()
            ->map(fn (Category $category) => $this->categoryMapper->fromModel($category))
            ->toArray();
    }

    public function subcategories(int $categoriaId): array
    {
        return Subcategory::activos()
            ->where('category_id', $categoriaId)
            ->orderBy('name')
            ->get()
            ->map(fn (Subcategory $subcategory) => $this->subcategoryMapper->fromModel($subcategory))
            ->toArray();
    }

    public function priorities(): array
    {
        return Priority::activos()
            ->orderBy('level')
            ->get()
            ->map(fn (Priority $priority) => $this->priorityMapper->fromModel($priority))
            ->toArray();
    }

    public function states(): array
    {
        return State::activos()
            ->ordenado()
            ->get()
            ->map(fn (State $state) => $this->stateMapper->fromModel($state))
            ->toArray();
    }

    public function transitions(?int $stateId = null): array
    {
        $query = StateTransition::with(['sourceState', 'targetState'])
            ->where('is_active', true);

        if ($stateId) {
            $query->where('source_state_id', $stateId);
        }

        return $query
            ->orderBy('source_state_id')
            ->orderBy('target_state_id')
            ->get()
            ->map(fn (StateTransition $transition) => $this->transitionMapper->fromModel($transition))
            ->toArray();
    }

    public function roles(): array
    {
        return Role::activos()
            ->with('permissions')
            ->orderBy('name')
            ->get()
            ->map(fn (Role $role) => $this->roleMapper->fromModel($role))
            ->toArray();
    }

    public function permissions(): array
    {
        return Permission::orderBy('module')
            ->orderBy('code')
            ->get()
            ->map(fn (Permission $permission) => $this->permissionMapper->fromModel($permission))
            ->toArray();
    }

    public function paginate(string $catalog, CatalogPaginationFiltersData $filters): PaginatedResult
    {
        $model = $this->model($catalog);
        $query = $model::query();

        if ($filters->isActive !== null) {
            if ($this->hasColumn($model, 'is_active')) {
                $query->where('is_active', $filters->isActive);
            } elseif ($this->hasColumn($model, 'activo')) {
                $query->where('activo', $filters->isActive);
            }
        }

        $result = $query->paginate($filters->perPage);

        return new PaginatedResult(
            items: array_map(fn ($item) => $item->toArray(), $result->items()),
            currentPage: $result->currentPage(),
            perPage: $result->perPage(),
            total: $result->total(),
            lastPage: $result->lastPage()
        );
    }

    public function create(string $catalog, array $data): array
    {
        $model = $this->model($catalog);

        return $model::create($data)->toArray();
    }

    public function find(string $catalog, int $id): array
    {
        $model = $this->model($catalog);

        return $model::findOrFail($id)->toArray();
    }

    public function update(string $catalog, int $id, array $data): array
    {
        $model = $this->model($catalog);
        $record = $model::findOrFail($id);
        $record->update($data);

        return $record->fresh()->toArray();
    }

    public function delete(string $catalog, int $id): void
    {
        $model = $this->model($catalog);
        $model::findOrFail($id)->delete();
    }

    private function model(string $catalog): string
    {
        abort_unless(array_key_exists($catalog, self::MODELS), 404, 'Catalogo no encontrado.');

        return self::MODELS[$catalog];
    }

    private function hasColumn(string $model, string $column): bool
    {
        /** @var Model $instance */
        $instance = new $model;

        return in_array($column, $instance->getFillable(), true);
    }
}
