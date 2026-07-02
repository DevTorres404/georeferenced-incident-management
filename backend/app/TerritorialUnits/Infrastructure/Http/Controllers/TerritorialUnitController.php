<?php

namespace App\TerritorialUnits\Infrastructure\Http\Controllers;

use App\Shared\Infrastructure\Http\Controllers\ApiController;
use App\TerritorialUnits\Application\DTOs\SaveTerritorialUnitData;
use App\TerritorialUnits\Application\DTOs\TerritorialUnitFiltersData;
use App\TerritorialUnits\Application\UseCases\TerritorialUnitUseCase;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TerritorialUnitController extends ApiController
{
    public function __construct(private TerritorialUnitUseCase $territorialUnitUseCase)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'type' => ['nullable', Rule::in(TerritorialUnit::TYPES)],
            'parent_id' => ['nullable', 'integer', Rule::exists(TerritorialUnit::class, 'id')],
            'q' => ['nullable', 'string', 'max:120'],
            'search' => ['nullable', 'string', 'max:120'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        return response()->json([
            'data' => $this->territorialUnitUseCase->list(new TerritorialUnitFiltersData(
                type: $filters['type'] ?? null,
                parentId: $filters['parent_id'] ?? null,
                search: $filters['q'] ?? ($filters['search'] ?? null),
                isActive: $filters['is_active'] ?? true
            )),
        ]);
    }

    public function tree(): JsonResponse
    {
        return response()->json([
            'data' => $this->territorialUnitUseCase->tree(),
        ]);
    }

    public function provinces(): JsonResponse
    {
        return response()->json([
            'data' => $this->territorialUnitUseCase->list(new TerritorialUnitFiltersData(
                type: TerritorialUnit::TYPE_PROVINCE,
                isActive: true
            )),
        ]);
    }

    public function cantons(int $provinceId): JsonResponse
    {
        return response()->json([
            'data' => $this->territorialUnitUseCase->list(new TerritorialUnitFiltersData(
                type: TerritorialUnit::TYPE_CANTON,
                parentId: $provinceId,
                isActive: true
            )),
        ]);
    }

    public function parishes(int $cantonId): JsonResponse
    {
        return response()->json([
            'data' => $this->territorialUnitUseCase->list(new TerritorialUnitFiltersData(
                type: TerritorialUnit::TYPE_PARISH,
                parentId: $cantonId,
                isActive: true
            )),
        ]);
    }

    public function children(int $id): JsonResponse
    {
        return response()->json([
            'data' => $this->territorialUnitUseCase->children($id),
        ]);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json([
            'data' => $this->territorialUnitUseCase->find($id),
        ]);
    }

    public function operationalZone(int $id): JsonResponse
    {
        return response()->json([
            'data' => $this->territorialUnitUseCase->resolveOperationalZone($id),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        try {
            $unit = $this->territorialUnitUseCase->create($this->dto($request));
        } catch (DomainException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Unidad territorial creada correctamente.',
            'data' => $unit,
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        try {
            $unit = $this->territorialUnitUseCase->update($id, $this->dto($request));
        } catch (DomainException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Unidad territorial actualizada correctamente.',
            'data' => $unit,
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        try {
            $this->territorialUnitUseCase->deactivate($id);
        } catch (DomainException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Unidad territorial desactivada correctamente.',
        ]);
    }

    private function dto(Request $request): SaveTerritorialUnitData
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'type' => ['required', Rule::in(TerritorialUnit::TYPES)],
            'parent_id' => ['nullable', 'integer', Rule::exists(TerritorialUnit::class, 'id')],
            'code' => ['nullable', 'string', 'max:60'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        return new SaveTerritorialUnitData(
            name: $data['name'],
            type: $data['type'],
            parentId: $data['parent_id'] ?? null,
            code: $data['code'] ?? null,
            isActive: (bool) ($data['is_active'] ?? true)
        );
    }
}
