<?php

namespace App\Operations\Infrastructure\Http\Controllers;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Operations\Application\DTOs\AssignOperatorTerritoryInputData;
use App\Operations\Application\DTOs\AssignSupervisorToZoneInputData;
use App\Operations\Application\DTOs\ReplaceZoneOperatorInputData;
use App\Operations\Application\DTOs\SyncSupervisorOperatorsInputData;
use App\Operations\Application\DTOs\UpdateOperatorProfileInputData;
use App\Operations\Application\DTOs\UpdateSupervisorProfileInputData;
use App\Operations\Application\UseCases\OperationalStructureUseCase;
use App\Operations\Domain\Exceptions\OperationalAssignmentException;
use App\Shared\Infrastructure\Http\Controllers\ApiController;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class OperationalStructureController extends ApiController
{
    public function __construct(private OperationalStructureUseCase $operationalStructureUseCase)
    {
    }

    public function zones(): JsonResponse
    {
        return response()->json([
            'data' => $this->operationalStructureUseCase->zones(),
        ]);
    }

    public function supervisors(): JsonResponse
    {
        return response()->json([
            'data' => $this->operationalStructureUseCase->supervisors(),
        ]);
    }

    public function operators(): JsonResponse
    {
        return response()->json([
            'data' => $this->operationalStructureUseCase->operators(),
        ]);
    }

    public function assignSupervisor(Request $request, int $zoneId): JsonResponse
    {
        $this->ensureAdministrator($request);

        $data = $request->validate([
            'supervisor_user_id' => ['required', 'integer', Rule::exists(User::class, 'id')],
        ]);

        try {
            $zone = $this->operationalStructureUseCase->assignSupervisorToZone(
                new AssignSupervisorToZoneInputData(
                    zoneId: $zoneId,
                    supervisorUserId: (int) $data['supervisor_user_id'],
                    assignedByUserId: (int) $request->user()->id
                )
            );
        } catch (OperationalAssignmentException $exception) {
            return response()->json(['message' => $exception->getMessage()], $exception->getCode());
        }

        return response()->json([
            'message' => 'Supervisor asignado correctamente a la zona operativa.',
            'data' => $zone,
        ]);
    }

    public function syncSupervisorOperators(Request $request, int $supervisorUserId): JsonResponse
    {
        $this->ensureAdministrator($request);

        $data = $request->validate([
            'operator_user_ids' => ['required', 'array'],
            'operator_user_ids.*' => ['integer', 'distinct', Rule::exists(User::class, 'id')],
        ]);

        try {
            $profile = $this->operationalStructureUseCase->syncSupervisorOperators(
                new SyncSupervisorOperatorsInputData(
                    supervisorUserId: $supervisorUserId,
                    operatorUserIds: array_map('intval', $data['operator_user_ids']),
                    assignedByUserId: (int) $request->user()->id
                )
            );
        } catch (OperationalAssignmentException $exception) {
            return response()->json(['message' => $exception->getMessage()], $exception->getCode());
        }

        return response()->json([
            'message' => 'Operadores del supervisor sincronizados correctamente.',
            'data' => $profile,
        ]);
    }

    public function assignOperatorTerritory(Request $request, int $operatorUserId): JsonResponse
    {
        $this->ensureAdministratorOrSupervisor($request);

        $data = $request->validate([
            'territorial_unit_id' => ['required', 'integer', Rule::exists(TerritorialUnit::class, 'id')],
        ]);

        try {
            $profile = $this->operationalStructureUseCase->assignOperatorTerritory(
                new AssignOperatorTerritoryInputData(
                    operatorUserId: $operatorUserId,
                    territorialUnitId: (int) $data['territorial_unit_id'],
                    assignedByUserId: (int) $request->user()->id
                )
            );
        } catch (OperationalAssignmentException $exception) {
            return response()->json(['message' => $exception->getMessage()], $exception->getCode());
        }

        return response()->json([
            'message' => 'Territorio operativo del operador actualizado correctamente.',
            'data' => $profile,
        ]);
    }

    public function updateSupervisorProfile(Request $request, int $supervisorUserId): JsonResponse
    {
        $this->ensureAdministrator($request);

        $data = $request->validate([
            'max_operators' => ['required', 'integer', 'min:1', 'max:999'],
        ]);

        try {
            $profile = $this->operationalStructureUseCase->updateSupervisorProfile(
                new UpdateSupervisorProfileInputData(
                    supervisorUserId: $supervisorUserId,
                    maxOperators: (int) $data['max_operators']
                )
            );
        } catch (OperationalAssignmentException $exception) {
            return response()->json(['message' => $exception->getMessage()], $exception->getCode());
        }

        return response()->json([
            'message' => 'Limite operativo del supervisor actualizado correctamente.',
            'data' => $profile,
        ]);
    }

    public function updateOperatorProfile(Request $request, int $operatorUserId): JsonResponse
    {
        $this->ensureAdministrator($request);

        $data = $request->validate([
            'max_active_incidents' => ['required', 'integer', 'min:1', 'max:9999'],
            'max_workload_points' => ['required', 'integer', 'min:1', 'max:9999'],
            'active' => ['required', 'boolean'],
        ]);

        try {
            $profile = $this->operationalStructureUseCase->updateOperatorProfile(
                new UpdateOperatorProfileInputData(
                    operatorUserId: $operatorUserId,
                    maxActiveIncidents: (int) $data['max_active_incidents'],
                    maxWorkloadPoints: (int) $data['max_workload_points'],
                    active: (bool) $data['active']
                )
            );
        } catch (OperationalAssignmentException $exception) {
            return response()->json(['message' => $exception->getMessage()], $exception->getCode());
        }

        return response()->json([
            'message' => 'Capacidad de incidencias del operador actualizada correctamente.',
            'data' => $profile,
        ]);
    }

    public function replaceOperator(Request $request, int $operatorUserId): JsonResponse
    {
        $this->ensureAdministratorOrSupervisor($request);

        $data = $request->validate([
            'replacement_operator_user_id' => ['required', 'integer', Rule::exists(User::class, 'id')],
        ]);

        try {
            $profile = $this->operationalStructureUseCase->replaceZoneOperator(
                new ReplaceZoneOperatorInputData(
                    currentOperatorUserId: $operatorUserId,
                    replacementOperatorUserId: (int) $data['replacement_operator_user_id'],
                    assignedByUserId: (int) $request->user()->id,
                )
            );
        } catch (OperationalAssignmentException $exception) {
            return response()->json(['message' => $exception->getMessage()], $exception->getCode());
        }

        return response()->json([
            'message' => 'Operador reemplazado y carga operativa transferida correctamente.',
            'data' => $profile,
        ]);
    }

    private function ensureAdministrator(Request $request): void
    {
        abort_unless($request->user()?->tieneRol('ADMIN'), 403, 'Solo un administrador puede gestionar encargados operativos.');
    }

    private function ensureAdministratorOrSupervisor(Request $request): void
    {
        $user = $request->user();
        abort_unless(
            $user && ($user->tieneRol('ADMIN') || $user->tieneRol('SUPERVISOR')),
            403,
            'Solo administradores o supervisores pueden gestionar operadores.'
        );
    }
}
