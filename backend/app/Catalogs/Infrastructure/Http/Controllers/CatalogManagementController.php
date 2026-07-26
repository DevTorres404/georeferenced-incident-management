<?php

declare(strict_types=1);

namespace App\Catalogs\Infrastructure\Http\Controllers;

use App\Catalogs\Application\DTOs\CatalogPaginationFiltersData;
use App\Catalogs\Application\UseCases\CatalogManagementUseCase;
use App\Catalogs\Infrastructure\Http\Requests\DeleteCatalogRecordRequest;
use App\Catalogs\Infrastructure\Http\Requests\ListCatalogRecordsRequest;
use App\Catalogs\Infrastructure\Http\Requests\MutateCatalogRecordRequest;
use App\Shared\Infrastructure\Http\Controllers\ApiController;
use App\Shared\Infrastructure\Notifications\AdminNotifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
    public function index(ListCatalogRecordsRequest $request, string $catalog): JsonResponse
    {
        return response()->json($this->catalogManagementUseCase->paginate(
            $catalog,
            new CatalogPaginationFiltersData(
                perPage: $request->perPage(),
                isActive: $request->isActive()
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
    public function store(MutateCatalogRecordRequest $request, string $catalog): JsonResponse
    {
        $data = $request->validated();
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
    public function update(MutateCatalogRecordRequest $request, string $catalog, int $id): JsonResponse
    {
        $this->catalogManagementUseCase->find($catalog, $id);
        $data = $request->validated();
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
    public function destroy(DeleteCatalogRecordRequest $request, string $catalog, int $id): JsonResponse
    {
        $this->catalogManagementUseCase->delete($catalog, $id);

        $this->notifyCatalogChange($request, $catalog);

        return response()->json([
            'message' => 'Registro eliminado correctamente.',
        ]);
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
