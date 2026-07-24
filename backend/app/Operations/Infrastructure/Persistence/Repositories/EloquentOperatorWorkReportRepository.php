<?php

declare(strict_types=1);

namespace App\Operations\Infrastructure\Persistence\Repositories;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAssignment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentCycle;
use App\Operations\Application\DTOs\OperatorInfoData;
use App\Operations\Application\DTOs\OperatorMetricsData;
use App\Operations\Application\Ports\OperatorWorkReportRepositoryInterface;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

final class EloquentOperatorWorkReportRepository implements OperatorWorkReportRepositoryInterface
{
    public function getOperatorInfo(int $operatorId): OperatorInfoData
    {
        $operator = User::findOrFail($operatorId);

        return new OperatorInfoData(
            id: (int) $operator->id,
            firstName: $operator->first_name,
            lastName: $operator->last_name,
            email: $operator->email
        );
    }

    public function getMetrics(int $operatorId): OperatorMetricsData
    {
        // 1. Total assigned (primary)
        $totalAssigned = IncidentAssignment::query()
            ->where('user_id', $operatorId)
            ->where('assignment_role', IncidentAssignment::ROLE_PRIMARY)
            ->count();

        // 2. Total resolved by operator
        $totalResolved = IncidentCycle::query()
            ->where('resolved_by', $operatorId)
            ->count();

        // 3. Reopened after this operator resolved them
        $reopenedCount = IncidentCycle::query()
            ->where('resolved_by', $operatorId)
            ->whereExists(function ($query) {
                $query->select(DB::raw(1))
                    ->from('core.incident_cycles as ic2')
                    ->whereColumn('ic2.incident_id', 'core.incident_cycles.incident_id')
                    ->whereColumn('ic2.cycle_number', '>', 'core.incident_cycles.cycle_number');
            })
            ->count();

        // 4. Average response time (SLA)
        $avgSeconds = IncidentAssignment::query()
            ->where('user_id', $operatorId)
            ->where('assignment_role', IncidentAssignment::ROLE_PRIMARY)
            ->whereNotNull('resolved_at')
            ->select(DB::raw('AVG(EXTRACT(EPOCH FROM (resolved_at - assignment_date))) as avg_seconds'))
            ->value('avg_seconds');

        $avgResponseHours = $avgSeconds ? round((float) $avgSeconds / 3600, 2) : 0.0;

        // 5. Carga laboral actual (puntos)
        $currentWorkload = Incident::query()
            ->leftJoin('core.priorities', 'core.priorities.id', '=', 'core.incidents.priority_id')
            ->join('core.states', 'core.states.id', '=', 'core.incidents.state_id')
            ->where('core.incidents.current_assigned_id', $operatorId)
            ->where('core.states.is_final_state', false)
            ->sum('core.priorities.weight');

        $reopenRate = $totalResolved > 0 ? round(($reopenedCount / $totalResolved) * 100, 2) : 0.0;

        return new OperatorMetricsData(
            totalAssigned: $totalAssigned,
            totalResolved: $totalResolved,
            reopenedCount: $reopenedCount,
            avgResponseHours: $avgResponseHours,
            reopenRate: $reopenRate,
            currentWorkload: (int) $currentWorkload
        );
    }

    public function getRecentIncidents(int $operatorId, ?int $limit = 50): array
    {
        $latestAssignmentsSub = IncidentAssignment::query()
            ->select('incident_id', DB::raw('MAX(assignment_date) as latest_date'), DB::raw('COUNT(*) - 1 as reopen_count'))
            ->where('user_id', $operatorId)
            ->where('assignment_role', IncidentAssignment::ROLE_PRIMARY)
            ->groupBy('incident_id')
            ->orderByDesc('latest_date');

        if ($limit !== null) {
            $latestAssignmentsSub->limit($limit);
        }
            
        $recentIncidentsRaw = DB::query()
            ->fromSub($latestAssignmentsSub, 'sub')
            ->get();
            
        $incidentIds = $recentIncidentsRaw->pluck('incident_id');
        $incidents = Incident::with(['priority', 'state', 'territorialUnit', 'category'])
            ->whereIn('id', $incidentIds)
            ->get()
            ->keyBy('id');
            
        $assignmentsByIncident = IncidentAssignment::query()
            ->with(['cycle', 'assignedBy'])
            ->where('user_id', $operatorId)
            ->where('assignment_role', IncidentAssignment::ROLE_PRIMARY)
            ->whereIn('incident_id', $incidentIds)
            ->orderBy('assignment_date', 'asc')
            ->get()
            ->groupBy('incident_id');
            
        $recentIncidents = $recentIncidentsRaw->map(function ($row) use ($incidents, $assignmentsByIncident) {
            $inc = $incidents[$row->incident_id] ?? null;
            if (!$inc) {
                return null;
            }
            
            $history = $assignmentsByIncident->get($row->incident_id, collect())->map(function ($a) use ($inc) {
                $snap = $a->cycle?->snapshot;
                $priorityName = $snap['incident']['priority']['name'] ?? $inc->priority?->name ?? '-';
                
                // La asignación representa la fase operativa ("En Progreso").
                // El estado del snapshot es el estado final al cerrar el ciclo (ej: Resuelta), lo cual confunde.
                $stateName = 'En Progreso';
                $finalState = $snap['incident']['status']['name'] ?? $inc->state?->name ?? '-';
                
                $endDate = $a->unassignment_date ?? $a->resolved_at;
                if (!$endDate) {
                    $stateNameLower = strtolower($inc->state?->name ?? '');
                    $isFinished = $inc->state?->is_final_state || str_contains($stateNameLower, 'resuelt') || str_contains($stateNameLower, 'cerrad');
                    
                    $endDate = $isFinished
                        ? ($inc->resolution_date ?? $inc->updated_at ?? \Carbon\Carbon::now())
                        : \Carbon\Carbon::now();
                }

                $durationMins = $a->assignment_date ? (int) abs($endDate->diffInMinutes($a->assignment_date, false)) : null;

                return [
                    'assignment_date' => $a->assignment_date ? $a->assignment_date->toIso8601String() : null,
                    'resolved_at' => $a->resolved_at ? $a->resolved_at->toIso8601String() : null,
                    'duration_minutes' => $durationMins,
                    'priority_name' => $priorityName,
                    'state_name' => $stateName,
                    'final_cycle_state' => $finalState,
                    'assigned_by_name' => $a->assignedBy ? ($a->assignedBy->first_name . ' ' . $a->assignedBy->last_name) : 'Sistema',
                ];
            });

            return [
                'incident' => $inc->toArray(),
                'latest_assignment_date' => Carbon::parse($row->latest_date)->toIso8601String(),
                'reopen_count' => (int) $row->reopen_count,
                'history' => $history->values()->all(),
            ];
        })->filter()->values();

        return $recentIncidents->all();
    }
}
