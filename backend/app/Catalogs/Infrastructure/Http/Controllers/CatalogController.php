<?php

namespace App\Catalogs\Infrastructure\Http\Controllers;

use App\Catalogs\Application\UseCases\CatalogQueryUseCase;
use App\Shared\Infrastructure\Http\Controllers\ApiController;
use Illuminate\Http\JsonResponse;

/**
 * @group Catálogos
 *
 * APIs para obtener datos de catálogos del sistema.
 */
class CatalogController extends ApiController
{
    public function __construct(private CatalogQueryUseCase $catalogQueryUseCase) {}

    /**
     * Resumen de catálogos.
     *
     * Devuelve una vista general de los catálogos principales.
     *
     * @group Categorías y subcategorías
     */
    public function index(): JsonResponse
    {
        return response()->json([
            ...$this->catalogQueryUseCase->overview(),
        ]);
    }

    /**
     * Listar categorías.
     *
     * @group Categorías y subcategorías
     */
    public function categories(): JsonResponse
    {
        return response()->json([
            'data' => $this->catalogQueryUseCase->categories(),
        ]);
    }

    /**
     * Listar subcategorías.
     *
     * Devuelve las subcategorías de una categoría específica.
     *
     * @group Categorías y subcategorías
     *
     * @urlParam categoria int required El ID de la categoría. Example: 3
     */
    public function subcategories(int $categoria): JsonResponse
    {
        return response()->json([
            'data' => $this->catalogQueryUseCase->subcategories($categoria),
        ]);
    }

    /**
     * Listar prioridades.
     *
     * @group Categorías y subcategorías
     */
    public function priorities(): JsonResponse
    {
        return response()->json([
            'data' => $this->catalogQueryUseCase->priorities(),
        ]);
    }

    /**
     * Listar estados.
     *
     * @group Estados de incidencia
     */
    public function states(): JsonResponse
    {
        return response()->json([
            'data' => $this->catalogQueryUseCase->states(),
        ]);
    }

    /**
     * Listar transiciones de estado.
     *
     * Devuelve las transiciones posibles desde un estado específico, o todas si no se envía el estado.
     *
     * @group Estados de incidencia
     *
     * @urlParam estado int El ID del estado origen. Example: 1
     */
    public function transitions(?int $estado = null): JsonResponse
    {
        return response()->json([
            'data' => $this->catalogQueryUseCase->transitions($estado),
        ]);
    }

    /**
     * Listar roles.
     *
     * @group Roles y permisos
     *
     * @authenticated
     */
    public function roles(): JsonResponse
    {
        return response()->json([
            'data' => $this->catalogQueryUseCase->roles(),
        ]);
    }

    /**
     * Listar permisos.
     *
     * @group Roles y permisos
     *
     * @authenticated
     */
    public function permissions(): JsonResponse
    {
        return response()->json([
            'data' => $this->catalogQueryUseCase->permissions(),
        ]);
    }
}
