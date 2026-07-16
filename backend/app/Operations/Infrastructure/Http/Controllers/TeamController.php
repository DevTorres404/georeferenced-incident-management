<?php

declare(strict_types=1);

namespace App\Operations\Infrastructure\Http\Controllers;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Operations\Application\DTOs\OperatorTeamSummaryData;
use App\Operations\Infrastructure\Persistence\Models\OperatorProfile;
use App\Operations\Infrastructure\Persistence\Models\SupervisorOperatorAssignment;
use App\Operations\Infrastructure\Persistence\Models\UserTerritory;
use App\Shared\Infrastructure\Http\Controllers\ApiController;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

final class TeamController extends ApiController
{
    /**
     * Listar operadores a cargo del supervisor autenticado.
     *
     * Retorna los operadores asignados al supervisor con métricas activas:
     * incidencias activas, puntos de carga actuales/máximos y territorio cubierto.
     *
     * @group Mi equipo
     *
     * @authenticated
     */
    public function operators(): JsonResponse
    {
        /** @var User $user */
        $user = auth()->user();

        $assignments = SupervisorOperatorAssignment::query()
            ->active()
            ->where('supervisor_user_id', $user->id)
            ->with('operator.profile')
            ->get();

        $operatorIds = $assignments->pluck('operator_id')->toArray();

        $activeIncidentsCounts = $this->loadActiveIncidentCounts($operatorIds);
        $workloadPointsSums = $this->loadWorkloadPointsSums($operatorIds);
        $territories = $this->loadTerritories($operatorIds);
        $profiles = $this->loadProfiles($operatorIds);

        $operators = $assignments->map(function (SupervisorOperatorAssignment $assignment) use (
            $activeIncidentsCounts, $workloadPointsSums, $territories, $profiles,
        ) {
            $operator = $assignment->operator;
            $id = (int) $operator->id;

            $profile = $profiles[$id] ?? null;

            return new OperatorTeamSummaryData(
                id: $id,
                firstName: $operator->first_name,
                lastName: $operator->last_name,
                email: $operator->email,
                activeIncidents: $activeIncidentsCounts[$id] ?? 0,
                workloadPoints: $workloadPointsSums[$id] ?? 0,
                maxWorkloadPoints: $profile?->max_workload_points ?? OperatorProfile::DEFAULT_MAX_WORKLOAD_POINTS,
                territory: $territories[$id] ?? null,
            );
        })->values()->all();

        return response()->json(['data' => $operators]);
    }

    /**
     * @param array<int, int> $operatorIds
     *
     * @return array<int, int>
     */
    private function loadActiveIncidentCounts(array $operatorIds): array
    {
        if ($operatorIds === []) {
            return [];
        }

        return Incident::query()
            ->select('current_assigned_id', DB::raw('COUNT(*) as total'))
            ->whereIn('current_assigned_id', $operatorIds)
            ->whereHas('state', fn ($q) => $q->where('is_final_state', false))
            ->groupBy('current_assigned_id')
            ->pluck('total', 'current_assigned_id')
            ->all();
    }

    /**
     * @param array<int, int> $operatorIds
     *
     * @return array<int, int>
     */
    private function loadWorkloadPointsSums(array $operatorIds): array
    {
        if ($operatorIds === []) {
            return [];
        }

        return Incident::query()
            ->select('core.incidents.current_assigned_id', DB::raw('COALESCE(SUM(core.priorities.weight), 0) as total_weight'))
            ->leftJoin('core.priorities', 'core.priorities.id', '=', 'core.incidents.priority_id')
            ->join('core.states', 'core.states.id', '=', 'core.incidents.state_id')
            ->whereIn('core.incidents.current_assigned_id', $operatorIds)
            ->where('core.states.is_final_state', false)
            ->groupBy('core.incidents.current_assigned_id')
            ->pluck('total_weight', 'current_assigned_id')
            ->map(fn ($val) => (int) $val)
            ->all();
    }

    /**
     * @param array<int, int> $operatorIds
     *
     * @return array<int, string|null>
     */
    private function loadTerritories(array $operatorIds): array
    {
        if ($operatorIds === []) {
            return [];
        }

        return UserTerritory::query()
            ->active()
            ->with('territory')
            ->whereIn('user_id', $operatorIds)
            ->get()
            ->keyBy('user_id')
            ->map(fn ($ut) => $ut->territory?->full_path)
            ->all();
    }

    /**
     * @param array<int, int> $operatorIds
     *
     * @return array<int, \App\Operations\Infrastructure\Persistence\Models\OperatorProfile>
     */
    private function loadProfiles(array $operatorIds): array
    {
        if ($operatorIds === []) {
            return [];
        }

        return OperatorProfile::query()
            ->whereIn('user_id', $operatorIds)
            ->get()
            ->keyBy('user_id')
            ->all();
    }
}
