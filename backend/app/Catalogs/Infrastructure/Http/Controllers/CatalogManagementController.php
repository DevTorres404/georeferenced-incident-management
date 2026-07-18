<?php

namespace App\Catalogs\Infrastructure\Http\Controllers;

use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Catalogs\Application\DTOs\CatalogPaginationFiltersData;
use App\Catalogs\Application\UseCases\CatalogManagementUseCase;
use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\Configuration;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Shared\Infrastructure\Http\Controllers\ApiController;
use App\Shared\Infrastructure\Notifications\AdminNotifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * @group Catálogos (Administración)
 *
 * APIs para la gestión (CRUD) de todos los catálogos del sistema.
 */
class CatalogManagementController extends ApiController
{
    public function __construct(
        private CatalogManagementUseCase $catalogManagementUseCase,
        private AdminNotifier $adminNotifier
    ) {}

    /**
     * Listar registros de un catálogo.
     *
     * Devuelve una lista paginada de un catálogo específico.
     *
     * @authenticated
     *
     * @urlParam catalog string required El nombre del catálogo. Example: categories
     *
     * @queryParam per_page int Cantidad por página. Example: 15
     * @queryParam is_active boolean Filtrar por estado. Example: 1
     */
    public function index(Request $request, string $catalog): JsonResponse
    {
        $filters = $request->validate([
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        return response()->json($this->catalogManagementUseCase->paginate(
            $catalog,
            new CatalogPaginationFiltersData(
                perPage: $filters['per_page'] ?? 50,
                isActive: $filters['is_active'] ?? null
            )
        ));
    }

    /**
     * Crear registro de catálogo.
     *
     * Permite crear un nuevo registro en un catálogo. Los parámetros del body dependen del catálogo.
     *
     * @authenticated
     *
     * @urlParam catalog string required El nombre del catálogo. Example: categories
     */
    public function store(Request $request, string $catalog): JsonResponse
    {
        $data = $request->validate($this->rules($catalog));
        $record = $this->catalogManagementUseCase->create($catalog, $data);

        $this->notifyCatalogChange($request, $catalog);

        return response()->json([
            'message' => 'Registro creado correctamente.',
            'data' => $record,
        ], 201);
    }

    /**
     * Ver registro de catálogo.
     *
     * Devuelve el detalle de un registro específico de un catálogo.
     *
     * @authenticated
     *
     * @urlParam catalog string required El nombre del catálogo. Example: categories
     * @urlParam id int required El ID del registro. Example: 2
     */
    public function show(string $catalog, int $id): JsonResponse
    {
        return response()->json([
            'data' => $this->catalogManagementUseCase->find($catalog, $id),
        ]);
    }

    /**
     * Actualizar registro de catálogo.
     *
     * Permite modificar un registro existente en un catálogo. Los parámetros del body dependen del catálogo.
     *
     * @authenticated
     *
     * @urlParam catalog string required El nombre del catálogo. Example: categories
     * @urlParam id int required El ID del registro. Example: 2
     */
    public function update(Request $request, string $catalog, int $id): JsonResponse
    {
        $this->catalogManagementUseCase->find($catalog, $id);
        $data = $request->validate($this->rules($catalog, $id));
        $record = $this->catalogManagementUseCase->update($catalog, $id, $data);

        $this->notifyCatalogChange($request, $catalog);

        return response()->json([
            'message' => 'Registro actualizado correctamente.',
            'data' => $record,
        ]);
    }

    /**
     * Eliminar registro de catálogo.
     *
     * Elimina un registro de un catálogo.
     *
     * @authenticated
     *
     * @urlParam catalog string required El nombre del catálogo. Example: categories
     * @urlParam id int required El ID del registro. Example: 2
     */
    public function destroy(Request $request, string $catalog, int $id): JsonResponse
    {
        $this->catalogManagementUseCase->delete($catalog, $id);

        $this->notifyCatalogChange($request, $catalog);

        return response()->json([
            'message' => 'Registro eliminado correctamente.',
        ]);
    }

    private function rules(string $catalog, ?int $id = null): array
    {
        return match ($catalog) {
            'categories' => [
                'name' => ['required', 'string', 'max:100', Rule::unique(Category::class, 'name')->ignore($id)],
                'description' => ['nullable', 'string', 'max:255'],
                'icon' => ['nullable', 'string', 'max:100'],
                'color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
                'is_active' => ['sometimes', 'boolean'],
            ],
            'subcategories' => [
                'category_id' => ['required', 'integer', Rule::exists(Category::class, 'id')],
                'name' => ['required', 'string', 'max:100'],
                'description' => ['nullable', 'string', 'max:255'],
                'is_active' => ['sometimes', 'boolean'],
            ],
            'priorities' => [
                'name' => ['required', 'string', 'max:50'],
                'level' => ['required', 'integer', 'min:1', 'max:10', Rule::unique(Priority::class, 'level')->ignore($id)],
                'color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
                'sla_hours' => ['required', 'integer', 'min:1'],
                'weight' => ['required', 'integer', 'min:1', 'max:999'],
                'is_active' => ['sometimes', 'boolean'],
            ],
            'states' => [
                'name' => ['required', 'string', 'max:50', Rule::unique(State::class, 'name')->ignore($id)],
                'description' => ['nullable', 'string', 'max:255'],
                'color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
                'is_initial_state' => ['sometimes', 'boolean'],
                'is_final_state' => ['sometimes', 'boolean'],
                'allows_edition' => ['sometimes', 'boolean'],
                'order' => ['sometimes', 'integer'],
                'is_active' => ['sometimes', 'boolean'],
            ],
            'transitions' => [
                'source_state_id' => ['required', 'integer', Rule::exists(State::class, 'id')],
                'target_state_id' => ['required', 'integer', Rule::exists(State::class, 'id')],
                'requires_comment' => ['sometimes', 'boolean'],
                'allowed_roles' => ['nullable', 'array'],
                'allowed_roles.*' => ['string', Rule::exists(Role::class, 'code')],
                'is_active' => ['sometimes', 'boolean'],
            ],
            'configuraciones' => [
                'clave' => ['required', 'string', 'max:100', Rule::unique(Configuration::class, 'clave')->ignore($id)],
                'valor' => ['required', 'string'],
                'tipo' => ['required', Rule::in(['string', 'integer', 'boolean', 'json'])],
                'description' => ['nullable', 'string', 'max:255'],
            ],
            default => [],
        };
    }

    private function notifyCatalogChange(Request $request, string $catalog): void
    {
        if (! in_array($catalog, ['categories', 'subcategories', 'priorities', 'states'], true)) {
            return;
        }

        $this->adminNotifier->notify(
            title: 'Configuración modificada',
            message: 'Se cambió una categoría, subcategoría, prioridad o estado.',
            type: 'STATUS_CHANGE'
        );
    }
}
