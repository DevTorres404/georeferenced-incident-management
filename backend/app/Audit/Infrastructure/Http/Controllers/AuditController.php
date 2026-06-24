<?php

namespace App\Audit\Infrastructure\Http\Controllers;

use App\Audit\Application\DTOs\AuditLogFiltersData;
use App\Audit\Application\DTOs\LoginAttemptFiltersData;
use App\Audit\Application\UseCases\AuditQueryUseCase;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Shared\Infrastructure\Http\Controllers\ApiController;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * @group Auditoría (Administración)
 *
 * APIs para la consulta de logs de auditoría y accesos al sistema.
 */
class AuditController extends ApiController
{
    public function __construct(private AuditQueryUseCase $auditQueryUseCase)
    {
    }

    /**
     * Listar logs de auditoría.
     *
     * Devuelve un registro detallado de las operaciones realizadas en el sistema.
     *
     * @authenticated
     * @queryParam tabla string Filtrar por nombre de la tabla (ej. users, incidents). Example: incidents
     * @queryParam tabla_id int Filtrar por ID del registro modificado. Example: 5
     * @queryParam user_id int Filtrar por ID del usuario que realizó la acción. Example: 2
     * @queryParam accion string Filtrar por acción (crear, actualizar, eliminar). Example: actualizar
     * @queryParam per_page int Registros por página. Example: 15
     */
    public function logs(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'tabla' => ['nullable', 'string', 'max:100'],
            'tabla_id' => ['nullable', 'integer'],
            'user_id' => ['nullable', 'integer', \Illuminate\Validation\Rule::exists(User::class, 'id')],
            'accion' => ['nullable', 'string', 'max:20'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        return response()->json($this->auditQueryUseCase->logs(
            new AuditLogFiltersData(
                table: $filters['tabla'] ?? null,
                tableId: $filters['tabla_id'] ?? null,
                userId: $filters['user_id'] ?? null,
                action: $filters['accion'] ?? null,
                perPage: $filters['per_page'] ?? 25
            )
        ));
    }

    /**
     * Listar intentos de inicio de sesión.
     *
     * Devuelve un registro de los intentos de acceso al sistema, exitosos o fallidos.
     *
     * @authenticated
     * @queryParam email string Filtrar por correo electrónico intentado. Example: admin@torres404.com
     * @queryParam is_success boolean Filtrar por éxito del intento. Example: 1
     * @queryParam ip_address string Filtrar por dirección IP. Example: 192.168.1.1
     * @queryParam per_page int Registros por página. Example: 15
     */
    public function loginAttempts(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'email' => ['nullable', 'email'],
            'is_success' => ['nullable', 'boolean'],
            'ip_address' => ['nullable', 'string', 'max:45'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        return response()->json($this->auditQueryUseCase->loginAttempts(
            new LoginAttemptFiltersData(
                email: $filters['email'] ?? null,
                successful: $filters['is_success'] ?? null,
                ipAddress: $filters['ip_address'] ?? null,
                perPage: $filters['per_page'] ?? 25
            )
        ));
    }
}

