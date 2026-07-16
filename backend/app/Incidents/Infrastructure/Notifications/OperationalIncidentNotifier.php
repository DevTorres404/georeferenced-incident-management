<?php

namespace App\Incidents\Infrastructure\Notifications;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Application\Ports\IncidentStateChangeNotifierPort;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAssignment;
use App\Operations\Infrastructure\Persistence\Models\UserTerritory;
use App\Shared\Infrastructure\Notifications\AdminNotifier;
use App\Shared\Infrastructure\Notifications\UserNotifier;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

final class OperationalIncidentNotifier implements IncidentStateChangeNotifierPort
{
    public function __construct(
        private readonly UserNotifier $userNotifier,
        private readonly AdminNotifier $adminNotifier
    ) {}

    public function notifyStateChangeRequested(
        int $incidentId,
        int $requestedByUserId,
        string $requestedStateName,
        string $reason
    ): void {
        $incident = Incident::query()->findOrFail($incidentId);
        $requestedBy = User::query()->find($requestedByUserId);
        $requestedByName = $requestedBy?->getNombreCompletoAttribute() ?? "Usuario #{$requestedByUserId}";

        $title = 'Solicitud de cambio de estado';
        $message = "El operador {$requestedByName} solicita cambiar el estado de la incidencia {$incident->code} a {$requestedStateName}. Motivo: {$reason}.";
        $type = 'STATUS_CHANGE';

        $supervisorUserIds = $this->supervisorUserIdsForIncident($incident);

        if ($supervisorUserIds !== []) {
            $this->userNotifier->notifyMany(
                $supervisorUserIds,
                $title,
                $message,
                $type,
                (int) $incident->id,
                true
            );

            return;
        }

        $this->adminNotifier->notify($title, $message, $type, [], (int) $incident->id);
    }

    public function notifyStateChangeApproved(int $incidentId, int $requestedByUserId): void
    {
        $incident = Incident::query()->findOrFail($incidentId);
        $this->userNotifier->notify(
            $requestedByUserId,
            'Cambio de estado aprobado',
            "Tu solicitud de cambio de estado para la incidencia {$incident->code} fue aprobada. El estado fue actualizado.",
            'STATUS_CHANGE',
            (int) $incident->id,
            false
        );
    }

    public function notifyStateChangeRejected(int $incidentId, int $requestedByUserId, string $reason): void
    {
        $incident = Incident::query()->findOrFail($incidentId);
        $this->userNotifier->notify(
            $requestedByUserId,
            'Cambio de estado rechazado',
            "Tu solicitud de cambio de estado para la incidencia {$incident->code} fue rechazada. Motivo: {$reason}.",
            'STATUS_CHANGE',
            (int) $incident->id,
            false
        );
    }

    public function notifyOperators(): int
    {
        $created = 0;

        $unreviewedIncidents = Incident::query()
            ->whereNull('current_assigned_id')
            ->where('created_at', '<=', now()->subMinutes(30))
            ->whereHas('state', fn ($query) => $query->where('is_final_state', false))
            ->with('territorialUnit.'.TerritorialUnit::PARENT_CHAIN)
            ->get();

        foreach ($unreviewedIncidents as $incident) {
            $created += $this->notifySupervisorsOrAdmins(
                $incident,
                'Incidencia sin atender',
                "La incidencia {$incident->code} lleva 30 minutos sin revision.",
                'INCIDENT_OVERDUE'
            );
        }

        $nearDueIncidents = Incident::query()
            ->whereNotNull('due_date')
            ->whereBetween('due_date', [now(), now()->addHour()])
            ->whereHas('state', fn ($query) => $query->where('is_final_state', false))
            ->with('territorialUnit.'.TerritorialUnit::PARENT_CHAIN)
            ->get();

        foreach ($nearDueIncidents as $incident) {
            $title = 'Incidencia proxima a vencer';
            $message = "La incidencia {$incident->code} esta cerca de superar el tiempo de atencion.";
            $operatorUserIds = $this->assignedOperatorUserIds($incident);

            $created += $operatorUserIds !== []
                ? $this->userNotifier->notifyMany(
                    $operatorUserIds,
                    $title,
                    $message,
                    'INCIDENT_OVERDUE',
                    (int) $incident->id,
                    true
                )
                : $this->notifySupervisorsOrAdmins($incident, $title, $message, 'INCIDENT_OVERDUE');
        }

        return $created;
    }

    public function notifySupervisors(): int
    {
        $created = 0;

        $overdueIncidents = Incident::query()
            ->whereNotNull('due_date')
            ->where('due_date', '<', now())
            ->whereHas('state', fn ($query) => $query->where('is_final_state', false))
            ->with('territorialUnit.'.TerritorialUnit::PARENT_CHAIN)
            ->get();

        foreach ($overdueIncidents as $incident) {
            $created += $this->notifySupervisorsOrAdmins(
                $incident,
                'Incidencia vencida por SLA',
                "La incidencia {$incident->code} supero el tiempo maximo de atencion.",
                'INCIDENT_OVERDUE'
            );
        }

        $crowdedTerritories = Incident::query()
            ->select('territorial_unit_id', DB::raw('COUNT(*) as total'))
            ->where('created_at', '>=', now()->subDay())
            ->whereNotNull('territorial_unit_id')
            ->groupBy('territorial_unit_id')
            ->havingRaw('COUNT(*) >= 8')
            ->get();

        foreach ($crowdedTerritories as $crowdedTerritory) {
            $incident = Incident::query()
                ->where('territorial_unit_id', $crowdedTerritory->territorial_unit_id)
                ->with('territorialUnit.'.TerritorialUnit::PARENT_CHAIN)
                ->latest()
                ->first();

            if (! $incident) {
                continue;
            }

            $territory = $incident->territorialUnit?->full_path ?: "territorio {$crowdedTerritory->territorial_unit_id}";
            $created += $this->notifySupervisorsOrAdmins(
                $incident,
                'Muchas incidencias en una zona',
                "Se detectaron {$crowdedTerritory->total} reportes similares en {$territory}.",
                'STATUS_CHANGE'
            );
        }

        $stalledAssignments = Incident::query()
            ->whereNotNull('current_assigned_id')
            ->where('updated_at', '<=', now()->subMinutes(30))
            ->whereHas('state', fn ($query) => $query->where('is_final_state', false))
            ->with('territorialUnit.'.TerritorialUnit::PARENT_CHAIN)
            ->get();

        foreach ($stalledAssignments as $incident) {
            $created += $this->notifySupervisorsOrAdmins(
                $incident,
                'Operador no atiende incidencia',
                "Una incidencia asignada lleva demasiado tiempo sin avance: {$incident->code}.",
                'INCIDENT_OVERDUE'
            );
        }

        $created += $this->notifyDailyZoneSummaries();
        $created += $this->notifyHighOperatorLoads();

        return $created;
    }

    private function notifyDailyZoneSummaries(): int
    {
        $todayStart = now()->startOfDay();
        $summaryBySupervisor = [];
        $supervisorUserIds = UserTerritory::query()
            ->active()
            ->whereHas('territory', fn (Builder $query) => $query
                ->where('type', TerritorialUnit::TYPE_OPERATIONAL_ZONE)
                ->where('is_active', true))
            ->whereHas('user', fn (Builder $query) => $this->applyNotificationEligibility($query, 'SUPERVISOR'))
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();

        foreach ($supervisorUserIds as $supervisorUserId) {
            $summaryBySupervisor[$supervisorUserId] = ['new' => 0, 'resolved' => 0, 'overdue' => 0];
        }

        $this->incrementSupervisorSummary(
            Incident::query()->where('created_at', '>=', $todayStart)->with('territorialUnit.'.TerritorialUnit::PARENT_CHAIN)->get(),
            $summaryBySupervisor,
            'new'
        );
        $this->incrementSupervisorSummary(
            Incident::query()->where('resolution_date', '>=', $todayStart)->with('territorialUnit.'.TerritorialUnit::PARENT_CHAIN)->get(),
            $summaryBySupervisor,
            'resolved'
        );
        $this->incrementSupervisorSummary(
            Incident::query()
                ->whereNotNull('due_date')
                ->where('due_date', '<', now())
                ->whereHas('state', fn ($query) => $query->where('is_final_state', false))
                ->with('territorialUnit.'.TerritorialUnit::PARENT_CHAIN)
                ->get(),
            $summaryBySupervisor,
            'overdue'
        );

        $created = 0;
        foreach ($summaryBySupervisor as $supervisorUserId => $summary) {
            $created += (int) $this->userNotifier->notify(
                (int) $supervisorUserId,
                'Reporte diario',
                "Resumen de tu zona para {$todayStart->toDateString()}: {$summary['new']} incidencias nuevas, {$summary['resolved']} resueltas, {$summary['overdue']} vencidas.",
                'STATUS_CHANGE',
                null,
                true
            );
        }

        return $created;
    }

    /**
     * @param  Collection<int, Incident>  $incidents
     * @param  array<int, array{new: int, resolved: int, overdue: int}>  $summaryBySupervisor
     */
    private function incrementSupervisorSummary(Collection $incidents, array &$summaryBySupervisor, string $key): void
    {
        foreach ($incidents as $incident) {
            foreach ($this->supervisorUserIdsForIncident($incident) as $supervisorUserId) {
                if (isset($summaryBySupervisor[$supervisorUserId])) {
                    $summaryBySupervisor[$supervisorUserId][$key]++;
                }
            }
        }
    }

    private function notifyHighOperatorLoads(): int
    {
        $highLoads = Incident::query()
            ->select('current_assigned_id', DB::raw('COUNT(*) as total'))
            ->whereNotNull('current_assigned_id')
            ->whereHas('state', fn ($query) => $query->where('is_final_state', false))
            ->groupBy('current_assigned_id')
            ->havingRaw('COUNT(*) >= 10')
            ->get();

        $created = 0;
        foreach ($highLoads as $load) {
            $operator = User::query()->find((int) $load->current_assigned_id);
            $operatorName = trim(($operator?->first_name ?? '').' '.($operator?->last_name ?? ''));
            $operatorLabel = $operatorName !== '' ? $operatorName : "Operador #{$load->current_assigned_id}";
            $representativeIncident = Incident::query()
                ->where('current_assigned_id', $load->current_assigned_id)
                ->whereHas('state', fn ($query) => $query->where('is_final_state', false))
                ->with('territorialUnit.'.TerritorialUnit::PARENT_CHAIN)
                ->first();
            $representativeIncidentId = $representativeIncident ? (int) $representativeIncident->id : null;
            $supervisorUserIds = $representativeIncident
                ? $this->supervisorUserIdsForIncident($representativeIncident)
                : [];

            $message = "{$operatorLabel} tiene demasiadas incidencias asignadas: {$load->total}.";

            if ($supervisorUserIds === []) {
                $this->adminNotifier->notify(
                    'Carga alta de operadores',
                    $message,
                    'STATUS_CHANGE',
                    [],
                    $representativeIncidentId
                );
            } else {
                $created += $this->userNotifier->notifyMany(
                    $supervisorUserIds,
                    'Carga alta de operadores',
                    $message,
                    'STATUS_CHANGE',
                    $representativeIncidentId,
                    true
                );
            }
        }

        return $created;
    }

    private function notifySupervisorsOrAdmins(
        Incident $incident,
        string $title,
        string $message,
        string $type
    ): int {
        $supervisorUserIds = $this->supervisorUserIdsForIncident($incident);

        if ($supervisorUserIds !== []) {
            return $this->userNotifier->notifyMany(
                $supervisorUserIds,
                $title,
                $message,
                $type,
                (int) $incident->id,
                true
            );
        }

        $this->adminNotifier->notify($title, $message, $type, [], (int) $incident->id);

        return 0;
    }

    /** @return array<int, int> */
    private function assignedOperatorUserIds(Incident $incident): array
    {
        return IncidentAssignment::query()
            ->where('incident_id', $incident->id)
            ->where('active', true)
            ->whereHas('user', fn (Builder $query) => $this->applyNotificationEligibility($query, 'OPERADOR'))
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
    }

    /** @return array<int, int> */
    private function supervisorUserIdsForIncident(Incident $incident): array
    {
        $zone = $this->resolveOperationalZoneForIncident($incident);

        if (! $zone) {
            return [];
        }

        return UserTerritory::query()
            ->active()
            ->where('territorial_unit_id', $zone->id)
            ->whereHas('user', fn (Builder $query) => $this->applyNotificationEligibility($query, 'SUPERVISOR'))
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
    }

    private function applyNotificationEligibility(Builder $query, string $roleCode): void
    {
        $query->where('is_active', true)
            ->whereHas('roles', fn ($roleQuery) => $roleQuery
                ->where('code', $roleCode)
                ->where('is_active', true)
                ->whereHas('permissions', fn ($permissionQuery) => $permissionQuery
                    ->where('code', 'notifications.view')));
    }

    private function resolveOperationalZoneForIncident(Incident $incident): ?TerritorialUnit
    {
        if ($incident->latitude !== null && $incident->longitude !== null) {
            try {
                $spatialZone = TerritorialUnit::query()
                    ->where('type', TerritorialUnit::TYPE_OPERATIONAL_ZONE)
                    ->where('is_active', true)
                    ->whereNotNull('coverage_area')
                    ->whereRaw(
                        'ST_Within(ST_SetSRID(ST_MakePoint(?, ?), 4326), coverage_area)',
                        [(float) $incident->longitude, (float) $incident->latitude]
                    )
                    ->first();

                if ($spatialZone) {
                    return $spatialZone;
                }
            } catch (\Throwable) {
                // Continue with the territorial hierarchy if spatial coverage is unavailable.
            }
        }

        $territory = $incident->relationLoaded('territorialUnit')
            ? $incident->territorialUnit
            : $incident->territorialUnit()->with(TerritorialUnit::PARENT_CHAIN)->first();

        if (! $territory) {
            return null;
        }

        if ($territory->type === TerritorialUnit::TYPE_OPERATIONAL_ZONE) {
            return $territory;
        }

        $current = $territory;
        while ($current->parent) {
            $current = $current->parent;

            if ($current->type === TerritorialUnit::TYPE_OPERATIONAL_ZONE) {
                return $current;
            }
        }

        return null;
    }
}
