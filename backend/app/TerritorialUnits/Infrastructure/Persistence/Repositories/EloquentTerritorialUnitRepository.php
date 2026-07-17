<?php

namespace App\TerritorialUnits\Infrastructure\Persistence\Repositories;

use App\TerritorialUnits\Application\DTOs\SaveTerritorialUnitData;
use App\TerritorialUnits\Application\DTOs\TerritorialUnitData;
use App\TerritorialUnits\Application\DTOs\TerritorialUnitFiltersData;
use App\TerritorialUnits\Domain\Repositories\TerritorialUnitRepositoryInterface;
use App\TerritorialUnits\Domain\Services\TerritorialHierarchyRules;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use DomainException;
use Illuminate\Database\Eloquent\Collection;

final class EloquentTerritorialUnitRepository implements TerritorialUnitRepositoryInterface
{
    public function __construct(private TerritorialHierarchyRules $hierarchyRules) {}

    public function list(TerritorialUnitFiltersData $filters): array
    {
        $query = TerritorialUnit::query()
            ->with(TerritorialUnit::PARENT_CHAIN)
            ->orderBy('name');

        if ($filters->isActive !== null) {
            $query->where('is_active', $filters->isActive);
        }

        if ($filters->type !== null) {
            $query->where('type', $filters->type);
        }

        if ($filters->parentId !== null) {
            $query->where('parent_id', $filters->parentId);
        }

        if ($filters->parentCodePrefix !== null) {
            $query->where('code', 'LIKE', $filters->parentCodePrefix.'%');
        }

        if ($filters->search !== null && trim($filters->search) !== '') {
            $search = trim($filters->search);
            $query->where(function ($subQuery) use ($search) {
                $subQuery->where('name', 'ILIKE', "%{$search}%")
                    ->orWhere('code', 'ILIKE', "%{$search}%");
            });
        }

        return $query->get()
            ->map(fn (TerritorialUnit $unit) => $this->toData($unit))
            ->all();
    }

    public function tree(): array
    {
        $units = TerritorialUnit::query()
            ->active()
            ->with(TerritorialUnit::PARENT_CHAIN)
            ->orderBy('name')
            ->get();

        return $this->buildTree($units);
    }

    public function children(int $parentId): array
    {
        return TerritorialUnit::query()
            ->active()
            ->with(TerritorialUnit::PARENT_CHAIN)
            ->where('parent_id', $parentId)
            ->orderBy('name')
            ->get()
            ->map(fn (TerritorialUnit $unit) => $this->toData($unit))
            ->all();
    }

    public function find(int $id): TerritorialUnitData
    {
        return $this->toData(TerritorialUnit::with(TerritorialUnit::PARENT_CHAIN)->findOrFail($id));
    }

    public function resolveOperationalZone(int $id): TerritorialUnitData
    {
        $unit = TerritorialUnit::with(TerritorialUnit::PARENT_CHAIN)->findOrFail($id);

        if ($unit->type === TerritorialUnit::TYPE_OPERATIONAL_ZONE) {
            return $this->toData($unit);
        }

        if ($unit->type === TerritorialUnit::TYPE_PROVINCE) {
            $canton = TerritorialUnit::query()
                ->where('type', TerritorialUnit::TYPE_CANTON)
                ->where('code', 'like', $unit->code.'%')
                ->first();

            if ($canton && $canton->parent_id) {
                $zone = TerritorialUnit::with(TerritorialUnit::PARENT_CHAIN)->find($canton->parent_id);
                if ($zone && $zone->type === TerritorialUnit::TYPE_OPERATIONAL_ZONE) {
                    return $this->toData($zone);
                }
            }
        }

        $current = $unit;

        while ($current->parent) {
            $current = $current->parent;

            if ($current->type === TerritorialUnit::TYPE_OPERATIONAL_ZONE) {
                return $this->toData($current);
            }
        }

        throw new DomainException('No se pudo resolver la zona operativa para la unidad territorial seleccionada.');
    }

    public function create(SaveTerritorialUnitData $data): TerritorialUnitData
    {
        $parent = $data->parentId
            ? TerritorialUnit::with(TerritorialUnit::PARENT_CHAIN)->findOrFail($data->parentId)
            : null;
        $this->hierarchyRules->validate(
            type: $data->type,
            parentType: $parent?->type,
            parentId: $parent?->id ? (int) $parent->id : null,
            parentAncestorIds: $parent ? $this->ancestorIds($parent) : []
        );
        $this->ensureUniqueName($data->name, $data->parentId);

        $unit = TerritorialUnit::create($this->payload($data));

        return $this->toData($unit->fresh([TerritorialUnit::PARENT_CHAIN]));
    }

    public function update(int $id, SaveTerritorialUnitData $data): TerritorialUnitData
    {
        $unit = TerritorialUnit::findOrFail($id);
        $parent = $data->parentId
            ? TerritorialUnit::with(TerritorialUnit::PARENT_CHAIN)->findOrFail($data->parentId)
            : null;
        $this->hierarchyRules->validate(
            type: $data->type,
            parentType: $parent?->type,
            parentId: $parent?->id ? (int) $parent->id : null,
            parentAncestorIds: $parent ? $this->ancestorIds($parent) : [],
            currentId: $id
        );
        $this->ensureUniqueName($data->name, $data->parentId, $id);

        $unit->update($this->payload($data));

        return $this->toData($unit->fresh([TerritorialUnit::PARENT_CHAIN]));
    }

    public function deactivate(int $id): void
    {
        $unit = TerritorialUnit::withCount(['children', 'incidents'])->findOrFail($id);

        if ($unit->children_count > 0) {
            throw new DomainException('No se puede desactivar una unidad territorial con hijos.');
        }

        if ($unit->incidents_count > 0) {
            throw new DomainException('No se puede desactivar una unidad territorial asociada a incidencias.');
        }

        $unit->update(['is_active' => false]);
    }

    /**
     * @param  Collection<int, TerritorialUnit>  $units
     * @return array<int, TerritorialUnitData>
     */
    private function buildTree(Collection $units, ?int $parentId = null): array
    {
        return $units
            ->filter(fn (TerritorialUnit $unit) => (int) ($unit->parent_id ?? 0) === (int) ($parentId ?? 0))
            ->values()
            ->map(fn (TerritorialUnit $unit) => $this->toData($unit, $this->buildTree($units, (int) $unit->id)))
            ->all();
    }

    /**
     * @param  array<int, TerritorialUnitData>  $children
     */
    private function toData(TerritorialUnit $unit, array $children = []): TerritorialUnitData
    {
        return new TerritorialUnitData(
            id: (int) $unit->id,
            name: $unit->name,
            type: $unit->type,
            parentId: $unit->parent_id ? (int) $unit->parent_id : null,
            code: $unit->code,
            isActive: (bool) $unit->is_active,
            fullPath: $unit->full_path,
            children: $children
        );
    }

    private function ensureUniqueName(string $name, ?int $parentId, ?int $ignoreId = null): void
    {
        $query = TerritorialUnit::query()
            ->where('name', $name);

        $parentId === null
            ? $query->whereNull('parent_id')
            : $query->where('parent_id', $parentId);

        if ($ignoreId !== null) {
            $query->where('id', '!=', $ignoreId);
        }

        if ($query->exists()) {
            throw new DomainException('Ya existe una unidad territorial con ese nombre bajo el mismo padre.');
        }
    }

    /**
     * @return array<int, int>
     */
    private function ancestorIds(TerritorialUnit $unit): array
    {
        $ids = [];
        $parent = $unit->parent;

        while ($parent) {
            $ids[] = (int) $parent->id;
            $parent = $parent->parent;
        }

        return $ids;
    }

    private function payload(SaveTerritorialUnitData $data): array
    {
        return [
            'name' => $data->name,
            'type' => $data->type,
            'parent_id' => $data->parentId,
            'code' => $data->code,
            'is_active' => $data->isActive,
        ];
    }
}
