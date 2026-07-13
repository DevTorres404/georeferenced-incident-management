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
use App\Operations\Infrastructure\Persistence\Models\SupervisorOperatorAssignment;
use App\Operations\Infrastructure\Persistence\Models\UserTerritory;
use App\Shared\Infrastructure\Http\Controllers\ApiController;
use App\Shared\Infrastructure\Notifications\UserNotifier;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class OperationalStructureController extends ApiController
{
    public function __construct(
        private OperationalStructureUseCase $operationalStructureUseCase,
        private UserNotifier $userNotifier
    ) {}

    public function zones(): JsonResponse
    {
        return response()->json([
            'data' => $this->operationalStructureUseCase->zones(),
        ]);
    }

    public function zonesGeoJson(): JsonResponse
    {
        $path = database_path('seeders/data/ecuador-operational-provinces.geojson');

        abort_unless(is_file($path), 404, 'No se encontro el GeoJSON provincial.');

        $contents = (string) file_get_contents($path);
        $contents = preg_replace('/^\xEF\xBB\xBF/', '', $contents) ?: $contents;
        $payload = json_decode($contents, true);

        abort_unless(
            is_array($payload) && isset($payload['features']) && is_array($payload['features']),
            500,
            'El GeoJSON provincial no tiene un formato valido.'
        );

        return response()->json($payload);
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
        $previousSupervisorUserId = UserTerritory::query()
            ->active()
            ->where('territorial_unit_id', $zoneId)
            ->whereHas('user.roles', fn ($query) => $query
                ->where('code', 'SUPERVISOR')
                ->where('is_active', true))
            ->value('user_id');

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

        $zoneName = TerritorialUnit::query()->whereKey($zoneId)->value('name') ?: "#{$zoneId}";
        $this->userNotifier->notify(
            (int) $data['supervisor_user_id'],
            'Zona operativa asignada',
            "Ahora eres responsable de la zona {$zoneName}.",
            'STATUS_CHANGE'
        );
        if ($previousSupervisorUserId && (int) $previousSupervisorUserId !== (int) $data['supervisor_user_id']) {
            $this->userNotifier->notify(
                (int) $previousSupervisorUserId,
                'Zona operativa reasignada',
                "La responsabilidad de la zona {$zoneName} fue transferida a otro supervisor.",
                'STATUS_CHANGE'
            );
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
        $previousOperatorUserIds = SupervisorOperatorAssignment::query()
            ->active()
            ->where('supervisor_user_id', $supervisorUserId)
            ->pluck('operator_user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

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

        $this->userNotifier->notify(
            $supervisorUserId,
            'Equipo operativo actualizado',
            'La lista de operadores bajo tu supervision fue actualizada.',
            'STATUS_CHANGE'
        );
        $this->userNotifier->notifyMany(
            array_map('intval', $data['operator_user_ids']),
            'Supervisor operativo actualizado',
            'Tu vinculacion con el equipo de supervision fue actualizada.',
            'STATUS_CHANGE'
        );
        $removedOperatorUserIds = array_values(array_diff(
            $previousOperatorUserIds,
            array_map('intval', $data['operator_user_ids'])
        ));
        $this->userNotifier->notifyMany(
            $removedOperatorUserIds,
            'Supervisor operativo actualizado',
            'Ya no formas parte del equipo operativo de este supervisor.',
            'STATUS_CHANGE'
        );

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

        $territoryName = TerritorialUnit::query()->whereKey((int) $data['territorial_unit_id'])->value('name')
            ?: "#{$data['territorial_unit_id']}";
        $this->userNotifier->notify(
            $operatorUserId,
            'Territorio operativo actualizado',
            "Tu territorio operativo ahora es {$territoryName}.",
            'STATUS_CHANGE'
        );

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

        $replacementOperatorUserId = (int) $data['replacement_operator_user_id'];
        $this->userNotifier->notify(
            $replacementOperatorUserId,
            'Carga operativa transferida',
            'Recibiste el territorio y las incidencias activas de otro operador.',
            'INCIDENT_ASSIGNED'
        );
        $this->userNotifier->notify(
            $operatorUserId,
            'Reemplazo operativo completado',
            'Tus incidencias activas fueron transferidas al operador de reemplazo.',
            'STATUS_CHANGE'
        );

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
