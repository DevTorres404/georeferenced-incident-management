<?php

namespace App\Catalogs\Infrastructure\Persistence\Repositories;

use App\Auth\Infrastructure\Persistence\Models\Permission;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Catalogs\Application\DTOs\CatalogPaginationFiltersData;
use App\Catalogs\Domain\Repositories\CatalogRepositoryInterface;
use App\Catalogs\Infrastructure\Persistence\Mappers\CityMapper;
use App\Catalogs\Infrastructure\Persistence\Mappers\CountryMapper;
use App\Catalogs\Infrastructure\Persistence\Mappers\PermissionMapper;
use App\Catalogs\Infrastructure\Persistence\Mappers\ProvinceMapper;
use App\Catalogs\Infrastructure\Persistence\Mappers\RoleMapper;
use App\Catalogs\Infrastructure\Persistence\Mappers\StateMapper;
use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\City;
use App\Incidents\Infrastructure\Persistence\Models\Configuration;
use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Incidents\Infrastructure\Persistence\Models\Country;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\Province;
use App\Incidents\Infrastructure\Persistence\Models\Subcategory;
use App\Incidents\Infrastructure\Persistence\Models\StateTransition;
use App\Shared\Application\Results\PaginatedResult;
use Illuminate\Database\Eloquent\Model;

final class EloquentCatalogRepository implements CatalogRepositoryInterface
{
    private const MODELS = [
        'countries' => Country::class,
        'provinces' => Province::class,
        'cities' => City::class,
        'categories' => Category::class,
        'subcategories' => Subcategory::class,
        'priorities' => Priority::class,
        'states' => State::class,
        'transitions' => StateTransition::class,
        'configuraciones' => Configuration::class,
    ];

    public function __construct(
        private CountryMapper $countryMapper,
        private ProvinceMapper $provinceMapper,
        private CityMapper $cityMapper,
        private StateMapper $stateMapper,
        private RoleMapper $roleMapper,
        private PermissionMapper $permissionMapper
    ) {
    }

    public function overview(): array
    {
        return [
            'countries' => Country::activos()
                ->orderBy('name')
                ->get()
                ->map(fn (Country $country) => $this->countryMapper->fromModel($country))
                ->toArray(),
            'categories' => Category::activos()
                ->with(['subcategories' => fn ($q) => $q->activos()->orderBy('name')])
                ->orderBy('name')
                ->get()
                ->map(fn (Category $category) => $this->mapCategory($category))
                ->all(),
            'priorities' => Priority::activos()
                ->orderBy('level')
                ->get()
                ->map(fn (Priority $priority) => $this->mapPriority($priority))
                ->all(),
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

    public function countries()
    {
        return Country::activos()
            ->orderBy('name')
            ->get()
            ->map(fn (Country $country) => $this->countryMapper->fromModel($country))
            ->toArray();
    }

    public function provinces(int $paisId)
    {
        return Province::activos()
            ->where('country_id', $paisId)
            ->orderBy('name')
            ->get()
            ->map(fn (Province $province) => $this->provinceMapper->fromModel($province))
            ->toArray();
    }

    public function cities(int $provinciaId)
    {
        return City::activos()
            ->where('province_id', $provinciaId)
            ->orderBy('name')
            ->get()
            ->map(fn (City $city) => $this->cityMapper->fromModel($city))
            ->toArray();
    }

    public function categories()
    {
        return Category::activos()
            ->with(['subcategories' => fn ($q) => $q->activos()->orderBy('name')])
            ->orderBy('name')
            ->get();
    }

    public function subcategories(int $categoriaId)
    {
        return Subcategory::activos()->where('category_id', $categoriaId)->orderBy('name')->get();
    }

    public function priorities()
    {
        return Priority::activos()->orderBy('level')->get();
    }

    public function states()
    {
        return State::activos()
            ->ordenado()
            ->get()
            ->map(fn (State $state) => $this->stateMapper->fromModel($state))
            ->toArray();
    }

    public function transitions(?int $stateId = null)
    {
        $query = StateTransition::with(['sourceState', 'targetState'])
            ->where('is_active', true);

        if ($stateId) {
            $query->where('source_state_id', $stateId);
        }

        return $query->orderBy('source_state_id')->orderBy('target_state_id')->get();
    }

    public function roles()
    {
        return Role::activos()
            ->with('permissions')
            ->orderBy('name')
            ->get()
            ->map(fn (Role $role) => $this->roleMapper->fromModel($role))
            ->toArray();
    }

    public function permissions()
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
            items: $result->items(),
            currentPage: $result->currentPage(),
            perPage: $result->perPage(),
            total: $result->total(),
            lastPage: $result->lastPage()
        );
    }

    public function create(string $catalog, array $data)
    {
        $model = $this->model($catalog);

        return $model::create($data);
    }

    public function find(string $catalog, int $id)
    {
        $model = $this->model($catalog);

        return $model::findOrFail($id);
    }

    public function update(string $catalog, int $id, array $data)
    {
        $record = $this->find($catalog, $id);
        $record->update($data);

        return $record->fresh();
    }

    public function delete(string $catalog, int $id): void
    {
        $this->find($catalog, $id)->delete();
    }

    private function model(string $catalog): string
    {
        abort_unless(array_key_exists($catalog, self::MODELS), 404, 'Catalogo no encontrado.');

        return self::MODELS[$catalog];
    }

    private function hasColumn(string $model, string $column): bool
    {
        /** @var Model $instance */
        $instance = new $model();

        return in_array($column, $instance->getFillable(), true);
    }

    private function mapCategory(Category|Subcategory $category): array
    {
        $data = [
            'id' => (int) $category->id,
            'name' => $category->name,
            'description' => $category->description,
            'icon' => $category->icon,
            'color' => $category->color,
            'is_active' => (bool) $category->is_active,
        ];

        if ($category instanceof Category && $category->relationLoaded('subcategories')) {
            $data['subcategories'] = $category->subcategories
                ->map(fn (Subcategory $subcategory) => $this->mapCategory($subcategory))
                ->all();
        }

        return $data;
    }

    private function mapPriority(Priority $priority): array
    {
        return [
            'id' => (int) $priority->id,
            'name' => $priority->name,
            'level' => (int) $priority->level,
            'color' => $priority->color,
            'sla_hours' => (int) $priority->sla_hours,
            'is_active' => (bool) $priority->is_active,
        ];
    }
}
