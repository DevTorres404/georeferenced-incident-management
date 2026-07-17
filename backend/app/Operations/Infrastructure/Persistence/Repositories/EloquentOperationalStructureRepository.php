<?php

namespace App\Operations\Infrastructure\Persistence\Repositories;

use App\Audit\Infrastructure\Persistence\Models\AuditLog;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAssignment;
use App\Incidents\Infrastructure\Persistence\Models\Notification;
use App\Operations\Application\DTOs\AssignOperatorTerritoryInputData;
use App\Operations\Application\DTOs\AssignSupervisorToZoneInputData;
use App\Operations\Application\DTOs\OperationalTerritoryData;
use App\Operations\Application\DTOs\OperationalUserData;
use App\Operations\Application\DTOs\OperationalZoneSummaryData;
use App\Operations\Application\DTOs\OperatorProfileData;
use App\Operations\Application\DTOs\ReplaceZoneOperatorInputData;
use App\Operations\Application\DTOs\SupervisorProfileData;
use App\Operations\Application\DTOs\SyncSupervisorOperatorsInputData;
use App\Operations\Application\DTOs\UpdateOperatorProfileInputData;
use App\Operations\Application\DTOs\UpdateSupervisorProfileInputData;
use App\Operations\Domain\Exceptions\OperationalAssignmentException;
use App\Operations\Domain\Repositories\OperationalStructureRepositoryInterface;
use App\Operations\Domain\Services\SupervisorCapacityPolicy;
use App\Operations\Infrastructure\Persistence\Models\OperatorProfile;
use App\Operations\Infrastructure\Persistence\Models\SupervisorOperatorAssignment;
use App\Operations\Infrastructure\Persistence\Models\SupervisorProfile;
use App\Operations\Infrastructure\Persistence\Models\UserTerritory;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

final class EloquentOperationalStructureRepository implements OperationalStructureRepositoryInterface
{
    private const INACTIVE_WORKLOAD_STATE_NAMES = [
        'CERRADA',
        'CANCELADA',
        'RECHAZADA',
        'CLOSED',
        'CANCELLED',
        'REJECTED',
    ];

    private const TRANSFER_AUDIT_EVENT = 'transferred';

    public function __construct(private SupervisorCapacityPolicy $supervisorCapacityPolicy) {}

    public function zones(): array
    {
        return TerritorialUnit::query()
            ->active()
            ->with(TerritorialUnit::PARENT_CHAIN)
            ->where('type', TerritorialUnit::TYPE_OPERATIONAL_ZONE)
            ->orderBy('name')
            ->get()
            ->map(fn (TerritorialUnit $zone) => $this->zoneSummary($zone))
            ->all();
    }

    public function supervisors(): array
    {
        return $this->usersByRole('SUPERVISOR')
            ->map(fn (User $user) => $this->supervisorProfileData($user))
            ->all();
    }

    public function operators(): array
    {
        return $this->usersByRole('OPERADOR')
            ->map(fn (User $user) => $this->operatorProfileData($user))
            ->all();
    }

    public function assignSupervisorToZone(AssignSupervisorToZoneInputData $data): OperationalZoneSummaryData
    {
        $zone = $this->loadZone($data->zoneId);
        $supervisor = $this->loadUserByRole($data->supervisorUserId, 'SUPERVISOR');
        $supervisorProfile = $this->loadActiveSupervisorProfile((int) $supervisor->id);
        $currentSupervisorAssignment = UserTerritory::query()
            ->active()
            ->where('territorial_unit_id', $zone->id)
            ->whereHas('user.roles', fn (Builder $query) => $query->where('code', 'SUPERVISOR')->where('is_active', true))
            ->latest('assigned_at')
            ->first();
        $currentSupervisorUserId = $currentSupervisorAssignment?->user_id ? (int) $currentSupervisorAssignment->user_id : null;
        $zoneOperatorIds = $this->activeOperatorIdsForZone($zone);

        try {
            $this->supervisorCapacityPolicy->ensureWithinLimit(count($zoneOperatorIds), (int) $supervisorProfile->max_operators);
        } catch (OperationalAssignmentException) {
            throw OperationalAssignmentException::supervisorTransferLimitExceeded();
        }

        DB::transaction(function () use ($data, $zone, $supervisor, $currentSupervisorUserId, $zoneOperatorIds): void {
            SupervisorProfile::query()->firstOrCreate(
                ['user_id' => $supervisor->id],
                ['max_operators' => SupervisorProfile::DEFAULT_MAX_OPERATORS, 'active' => true]
            );

            $this->deactivateUserTerritories(
                UserTerritory::query()
                    ->active()
                    ->where('user_id', $supervisor->id)
                    ->where('territorial_unit_id', '!=', $zone->id)
            );

            $this->deactivateUserTerritories(
                UserTerritory::query()
                    ->active()
                    ->where('territorial_unit_id', $zone->id)
                    ->where('user_id', '!=', $supervisor->id)
                    ->whereHas('user.roles', fn (Builder $query) => $query->where('code', 'SUPERVISOR')->where('is_active', true))
            );

            if (! UserTerritory::query()->active()->where('user_id', $supervisor->id)->where('territorial_unit_id', $zone->id)->exists()) {
                UserTerritory::create([
                    'user_id' => $supervisor->id,
                    'territorial_unit_id' => $zone->id,
                    'assigned_by' => $data->assignedByUserId,
                    'assigned_at' => now(),
                    'is_active' => true,
                ]);
            }

            $this->transferZoneOperatorsToSupervisor(
                zone: $zone,
                operatorIds: $zoneOperatorIds,
                newSupervisorUserId: (int) $supervisor->id,
                assignedByUserId: $data->assignedByUserId,
            );
            $this->deactivateSupervisorAssignmentsOutsideZone((int) $supervisor->id, $zone);
            $this->transferUnreadNotificationsByIncidentCodes(
                fromUserId: $currentSupervisorUserId,
                toUserId: (int) $supervisor->id,
                incidentCodes: $this->activeZoneIncidentCodes($zone),
            );
            $this->writeTransferAudit(
                auditableType: TerritorialUnit::class,
                auditableId: (int) $zone->id,
                userId: $data->assignedByUserId,
                oldValues: [
                    'supervisor_user_id' => $currentSupervisorUserId,
                    'operator_user_ids' => $zoneOperatorIds,
                ],
                newValues: [
                    'supervisor_user_id' => (int) $supervisor->id,
                    'operator_user_ids' => $zoneOperatorIds,
                ],
                tags: ['operations', 'zone-supervisor-transfer']
            );
        });

        return $this->zoneSummary($zone->fresh(TerritorialUnit::PARENT_CHAIN));
    }

    public function syncSupervisorOperators(SyncSupervisorOperatorsInputData $data): SupervisorProfileData
    {
        $supervisor = $this->loadUserByRole($data->supervisorUserId, 'SUPERVISOR');
        $profile = SupervisorProfile::query()->firstOrCreate(
            ['user_id' => $supervisor->id],
            ['max_operators' => SupervisorProfile::DEFAULT_MAX_OPERATORS, 'active' => true]
        );
        $zone = $this->activeZoneForUser((int) $supervisor->id);

        if (! $zone) {
            throw OperationalAssignmentException::supervisorZoneRequired();
        }

        $operatorIds = array_values(array_unique(array_map('intval', $data->operatorUserIds)));
        $this->supervisorCapacityPolicy->ensureWithinLimit(count($operatorIds), (int) $profile->max_operators);

        $operators = User::query()
            ->whereIn('id', $operatorIds)
            ->whereHas('roles', fn (Builder $query) => $query->where('code', 'OPERADOR')->where('is_active', true))
            ->get()
            ->keyBy('id');

        if (count($operatorIds) !== $operators->count()) {
            throw OperationalAssignmentException::operatorRoleRequired();
        }

        foreach ($operators as $operator) {
            $operatorZone = $this->activeZoneForUser((int) $operator->id);
            if (! $operatorZone || (int) $operatorZone->id !== (int) $zone->id) {
                throw OperationalAssignmentException::operatorZoneMismatch();
            }
        }

        DB::transaction(function () use ($data, $operatorIds, $supervisor): void {
            $toDeactivate = SupervisorOperatorAssignment::query()
                ->active()
                ->where('supervisor_user_id', $supervisor->id);

            if ($operatorIds !== []) {
                $toDeactivate->whereNotIn('operator_user_id', $operatorIds);
            }

            $this->deactivateSupervisorAssignments($toDeactivate);

            foreach ($operatorIds as $operatorId) {
                $activeAssignment = SupervisorOperatorAssignment::query()
                    ->active()
                    ->where('operator_user_id', $operatorId)
                    ->first();

                if ($activeAssignment && (int) $activeAssignment->supervisor_user_id === (int) $supervisor->id) {
                    continue;
                }

                if ($activeAssignment) {
                    $this->deactivateSupervisorAssignment($activeAssignment);
                }

                SupervisorOperatorAssignment::create([
                    'supervisor_user_id' => $supervisor->id,
                    'operator_user_id' => $operatorId,
                    'assigned_by' => $data->assignedByUserId,
                    'assigned_at' => now(),
                    'is_active' => true,
                ]);
            }
        });

        return $this->supervisorProfileData($supervisor->fresh(['roles']));
    }

    public function assignOperatorTerritory(AssignOperatorTerritoryInputData $data): OperatorProfileData
    {
        $operator = $this->loadUserByRole($data->operatorUserId, 'OPERADOR');
        $territory = TerritorialUnit::query()->with(TerritorialUnit::PARENT_CHAIN)->findOrFail($data->territorialUnitId);

        if ($territory->type === TerritorialUnit::TYPE_COUNTRY) {
            throw OperationalAssignmentException::territoryRequired();
        }

        $zone = $this->resolveOperationalZoneModel($territory);

        DB::transaction(function () use ($data, $operator, $territory, $zone): void {
            OperatorProfile::query()->firstOrCreate(
                ['user_id' => $operator->id],
                [
                    'incident_capacity' => OperatorProfile::DEFAULT_INCIDENT_CAPACITY,
                    'max_active_incidents' => OperatorProfile::DEFAULT_MAX_ACTIVE_INCIDENTS,
                    'max_workload_points' => OperatorProfile::DEFAULT_MAX_WORKLOAD_POINTS,
                    'active' => true,
                ]
            );

            $this->deactivateUserTerritories(
                UserTerritory::query()
                    ->active()
                    ->where('user_id', $operator->id)
                    ->where('territorial_unit_id', '!=', $territory->id)
            );

            if (! UserTerritory::query()->active()->where('user_id', $operator->id)->where('territorial_unit_id', $territory->id)->exists()) {
                UserTerritory::create([
                    'user_id' => $operator->id,
                    'territorial_unit_id' => $territory->id,
                    'assigned_by' => $data->assignedByUserId,
                    'assigned_at' => now(),
                    'is_active' => true,
                ]);
            }

            $activeSupervisorAssignment = SupervisorOperatorAssignment::query()
                ->active()
                ->where('operator_user_id', $operator->id)
                ->first();

            if ($activeSupervisorAssignment) {
                $supervisorZone = $this->activeZoneForUser((int) $activeSupervisorAssignment->supervisor_user_id);

                if (! $supervisorZone || (int) $supervisorZone->id !== (int) $zone->id) {
                    $this->deactivateSupervisorAssignment($activeSupervisorAssignment);
                }
            }
        });

        return $this->operatorProfileData($operator->fresh(['roles']));
    }

    public function replaceZoneOperator(ReplaceZoneOperatorInputData $data): OperatorProfileData
    {
        $currentOperator = $this->loadUserByRole($data->currentOperatorUserId, 'OPERADOR');
        if ($data->currentOperatorUserId === $data->replacementOperatorUserId) {
            return $this->operatorProfileData($currentOperator->fresh(['roles']));
        }

        $replacementOperator = $this->loadUserByRole($data->replacementOperatorUserId, 'OPERADOR');
        $replacementProfile = $this->loadActiveOperatorProfile((int) $replacementOperator->id);
        $currentZone = $this->activeZoneForUser((int) $currentOperator->id);
        $replacementZone = $this->activeZoneForUser((int) $replacementOperator->id);

        if (! $currentZone) {
            throw OperationalAssignmentException::operatorZoneMismatch();
        }

        $isCrossZoneTransfer = ! $replacementZone || (int) $currentZone->id !== (int) $replacementZone->id;

        $transferIncidents = $this->activeTransferIncidentsForOperator((int) $currentOperator->id);
        $this->ensureOperatorCanReceiveTransferredIncidents($transferIncidents, $replacementProfile, (int) $replacementOperator->id);

        DB::transaction(function () use ($data, $currentOperator, $replacementOperator, $currentZone, $replacementZone, $isCrossZoneTransfer, $transferIncidents): void {
            if ($isCrossZoneTransfer) {
                $this->deactivateUserTerritories(
                    UserTerritory::query()
                        ->active()
                        ->where('user_id', $replacementOperator->id)
                        ->where('territorial_unit_id', '!=', $currentZone->id)
                );

                if (! UserTerritory::query()->active()->where('user_id', $replacementOperator->id)->where('territorial_unit_id', $currentZone->id)->exists()) {
                    UserTerritory::create([
                        'user_id' => $replacementOperator->id,
                        'territorial_unit_id' => $currentZone->id,
                        'assigned_by' => $data->assignedByUserId,
                        'assigned_at' => now(),
                        'is_active' => true,
                    ]);
                }
            }

            $currentAssignment = SupervisorOperatorAssignment::query()
                ->active()
                ->where('operator_user_id', $currentOperator->id)
                ->latest('assigned_at')
                ->first();

            if ($currentAssignment) {
                $this->deactivateSupervisorAssignment($currentAssignment);

                $replacementAssignment = SupervisorOperatorAssignment::query()
                    ->active()
                    ->where('operator_user_id', $replacementOperator->id)
                    ->latest('assigned_at')
                    ->first();

                if ($replacementAssignment && (int) $replacementAssignment->supervisor_user_id !== (int) $currentAssignment->supervisor_user_id) {
                    $this->deactivateSupervisorAssignment($replacementAssignment);
                    $replacementAssignment = null;
                }

                if (! $replacementAssignment) {
                    SupervisorOperatorAssignment::create([
                        'supervisor_user_id' => $currentAssignment->supervisor_user_id,
                        'operator_user_id' => $replacementOperator->id,
                        'assigned_by' => $data->assignedByUserId,
                        'assigned_at' => now(),
                        'is_active' => true,
                    ]);
                }
            }

            $this->transferIncidentsToOperator(
                incidents: $transferIncidents,
                newOperatorUserId: (int) $replacementOperator->id,
                assignedByUserId: $data->assignedByUserId,
            );
            $this->transferUnreadNotificationsByIncidentCodes(
                fromUserId: (int) $currentOperator->id,
                toUserId: (int) $replacementOperator->id,
                incidentCodes: $transferIncidents->pluck('code')->all(),
            );
            $this->writeTransferAudit(
                auditableType: User::class,
                auditableId: (int) $replacementOperator->id,
                userId: $data->assignedByUserId,
                oldValues: [
                    'replaced_operator_user_id' => (int) $currentOperator->id,
                    'incident_codes' => $transferIncidents->pluck('code')->all(),
                    'zone_id' => $replacementZone ? (int) $replacementZone->id : null,
                ],
                newValues: [
                    'replacement_operator_user_id' => (int) $replacementOperator->id,
                    'incident_codes' => $transferIncidents->pluck('code')->all(),
                    'zone_id' => (int) $currentZone->id,
                ],
                tags: ['operations', 'operator-transfer']
            );
        });

        return $this->operatorProfileData($replacementOperator->fresh(['roles']));
    }

    public function updateSupervisorProfile(UpdateSupervisorProfileInputData $data): SupervisorProfileData
    {
        $supervisor = $this->loadUserByRole($data->supervisorUserId, 'SUPERVISOR');
        $profile = SupervisorProfile::query()->firstOrCreate(
            ['user_id' => $supervisor->id],
            ['max_operators' => SupervisorProfile::DEFAULT_MAX_OPERATORS, 'active' => true]
        );

        $currentActiveOperators = SupervisorOperatorAssignment::query()
            ->active()
            ->where('supervisor_user_id', $supervisor->id)
            ->count();

        $this->supervisorCapacityPolicy->ensureLimitNotBelowCurrent($currentActiveOperators, $data->maxOperators);

        $profile->update([
            'max_operators' => $data->maxOperators,
        ]);

        return $this->supervisorProfileData($supervisor->fresh(['roles']));
    }

    public function updateOperatorProfile(UpdateOperatorProfileInputData $data): OperatorProfileData
    {
        $operator = $this->loadUserByRole($data->operatorUserId, 'OPERADOR');
        $profile = OperatorProfile::query()->firstOrCreate(
            ['user_id' => $operator->id],
            [
                'incident_capacity' => OperatorProfile::DEFAULT_INCIDENT_CAPACITY,
                'max_active_incidents' => OperatorProfile::DEFAULT_MAX_ACTIVE_INCIDENTS,
                'max_workload_points' => OperatorProfile::DEFAULT_MAX_WORKLOAD_POINTS,
                'active' => true,
            ]
        );

        $profile->update([
            'incident_capacity' => $data->maxActiveIncidents,
            'max_active_incidents' => $data->maxActiveIncidents,
            'max_workload_points' => $data->maxWorkloadPoints,
            'active' => $data->active,
        ]);

        return $this->operatorProfileData($operator->fresh(['roles']));
    }

    /**
     * @return \Illuminate\Database\Eloquent\Collection<int, User>
     */
    private function usersByRole(string $roleCode)
    {
        return User::query()
            ->where('is_active', true)
            ->with(['roles'])
            ->whereHas('roles', fn (Builder $query) => $query->where('code', $roleCode)->where('is_active', true))
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->get();
    }

    private function loadUserByRole(int $userId, string $roleCode): User
    {
        $user = User::query()
            ->with(['roles'])
            ->whereKey($userId)
            ->where('is_active', true)
            ->firstOrFail();

        if (! $user->tieneRol($roleCode)) {
            throw $roleCode === 'SUPERVISOR'
                ? OperationalAssignmentException::supervisorRoleRequired()
                : OperationalAssignmentException::operatorRoleRequired();
        }

        return $user;
    }

    private function loadZone(int $zoneId): TerritorialUnit
    {
        $zone = TerritorialUnit::query()->with(TerritorialUnit::PARENT_CHAIN)->findOrFail($zoneId);

        if ($zone->type !== TerritorialUnit::TYPE_OPERATIONAL_ZONE || ! $zone->is_active) {
            throw OperationalAssignmentException::operationalZoneRequired();
        }

        return $zone;
    }

    private function zoneSummary(TerritorialUnit $zone): OperationalZoneSummaryData
    {
        $cantonCodes = TerritorialUnit::query()
            ->where('parent_id', $zone->id)
            ->where('type', TerritorialUnit::TYPE_CANTON)
            ->where('is_active', true)
            ->pluck('code');

        $provinceCodes = $cantonCodes
            ->map(fn (?string $code) => $code ? substr($code, 0, 2) : null)
            ->filter()
            ->unique()
            ->values()
            ->all();

        $provinces = TerritorialUnit::query()
            ->where('type', TerritorialUnit::TYPE_PROVINCE)
            ->where('is_active', true)
            ->whereIn('code', $provinceCodes)
            ->orderBy('name')
            ->get();

        $supervisorAssignment = UserTerritory::query()
            ->with(['user.roles'])
            ->active()
            ->where('territorial_unit_id', $zone->id)
            ->whereHas('user.roles', fn (Builder $query) => $query->where('code', 'SUPERVISOR')->where('is_active', true))
            ->latest('assigned_at')
            ->first();

        $supervisor = $supervisorAssignment?->user;
        $profile = $supervisor
            ? SupervisorProfile::query()->firstOrCreate(
                ['user_id' => $supervisor->id],
                ['max_operators' => SupervisorProfile::DEFAULT_MAX_OPERATORS, 'active' => true]
            )
            : null;

        $activeOperatorsCount = $supervisor
            ? SupervisorOperatorAssignment::query()
                ->active()
                ->where('supervisor_user_id', $supervisor->id)
                ->count()
            : 0;

        $operatorIds = $this->usersByRole('OPERADOR')
            ->filter(function (User $user) use ($zone): bool {
                $operatorZone = $this->activeZoneForUser((int) $user->id);

                return $operatorZone && (int) $operatorZone->id === (int) $zone->id;
            })
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $activeIncidents = $operatorIds === [] ? 0 : Incident::query()
            ->whereIn('current_assigned_id', $operatorIds)
            ->whereDoesntHave('state', fn (Builder $query) => $query->whereIn('name', self::INACTIVE_WORKLOAD_STATE_NAMES))
            ->count();

        $totalWorkloadPoints = $operatorIds === [] ? 0 : $this->activeWorkloadPointsForOperators($operatorIds);
        $averageWorkloadPoints = $activeOperatorsCount > 0
            ? round($totalWorkloadPoints / $activeOperatorsCount, 1)
            : 0.0;

        return new OperationalZoneSummaryData(
            zone: $this->territoryData($zone),
            supervisor: $supervisor ? $this->userData($supervisor, $zone, $zone) : null,
            maxOperators: (int) ($profile?->max_operators ?? SupervisorProfile::DEFAULT_MAX_OPERATORS),
            activeOperatorsCount: $activeOperatorsCount,
            activeIncidents: $activeIncidents,
            averageWorkloadPoints: $averageWorkloadPoints,
            provincesCovered: $provinces
                ->map(fn (TerritorialUnit $province) => $this->territoryData($province))
                ->all()
        );
    }

    private function supervisorProfileData(User $user): SupervisorProfileData
    {
        $profile = SupervisorProfile::query()->firstOrCreate(
            ['user_id' => $user->id],
            ['max_operators' => SupervisorProfile::DEFAULT_MAX_OPERATORS, 'active' => true]
        );
        $territory = $this->activeTerritoryForUser((int) $user->id);
        $zone = $territory ? $this->resolveOperationalZoneModel($territory) : null;

        $activeAssignments = SupervisorOperatorAssignment::query()
            ->with(['operator.roles'])
            ->active()
            ->where('supervisor_user_id', $user->id)
            ->orderBy('assigned_at')
            ->get();

        $operators = $activeAssignments
            ->map(function (SupervisorOperatorAssignment $assignment) {
                $operatorTerritory = $this->activeTerritoryForUser((int) $assignment->operator_user_id);
                $operatorZone = $operatorTerritory ? $this->resolveOperationalZoneModel($operatorTerritory) : null;

                return $this->userData($assignment->operator, $operatorTerritory, $operatorZone);
            })
            ->all();

        return new SupervisorProfileData(
            supervisor: $this->userData($user, $territory, $zone),
            maxOperators: (int) $profile->max_operators,
            activeOperatorsCount: count($operators),
            operators: $operators
        );
    }

    private function operatorProfileData(User $user): OperatorProfileData
    {
        $profile = OperatorProfile::query()->firstOrCreate(
            ['user_id' => $user->id],
            [
                'incident_capacity' => OperatorProfile::DEFAULT_INCIDENT_CAPACITY,
                'max_active_incidents' => OperatorProfile::DEFAULT_MAX_ACTIVE_INCIDENTS,
                'max_workload_points' => OperatorProfile::DEFAULT_MAX_WORKLOAD_POINTS,
                'active' => true,
            ]
        );
        $territory = $this->activeTerritoryForUser((int) $user->id);
        $zone = $territory ? $this->resolveOperationalZoneModel($territory) : null;

        $assignment = SupervisorOperatorAssignment::query()
            ->with(['supervisor.roles'])
            ->active()
            ->where('operator_user_id', $user->id)
            ->latest('assigned_at')
            ->first();

        $supervisorTerritory = $assignment ? $this->activeTerritoryForUser((int) $assignment->supervisor_user_id) : null;
        $supervisorZone = $supervisorTerritory ? $this->resolveOperationalZoneModel($supervisorTerritory) : null;
        $currentActiveIncidents = $this->activeIncidentCountForOperator((int) $user->id);
        $currentWorkloadPoints = $this->activeWorkloadPointsForOperator((int) $user->id);

        return new OperatorProfileData(
            operator: $this->userData($user, $territory, $zone),
            maxActiveIncidents: (int) $profile->max_active_incidents,
            maxWorkloadPoints: (int) $profile->max_workload_points,
            active: (bool) $profile->active,
            currentActiveIncidents: $currentActiveIncidents,
            currentWorkloadPoints: $currentWorkloadPoints,
            supervisor: $assignment ? $this->userData($assignment->supervisor, $supervisorTerritory, $supervisorZone) : null
        );
    }

    private function activeIncidentCountForOperator(int $operatorUserId): int
    {
        return Incident::query()
            ->where('current_assigned_id', $operatorUserId)
            ->whereDoesntHave('state', fn ($query) => $query->whereIn('name', self::INACTIVE_WORKLOAD_STATE_NAMES))
            ->count();
    }

    private function activeWorkloadPointsForOperator(int $operatorUserId): int
    {
        return (int) Incident::query()
            ->leftJoin('core.priorities', 'core.priorities.id', '=', 'core.incidents.priority_id')
            ->join('core.states', 'core.states.id', '=', 'core.incidents.state_id')
            ->where('core.incidents.current_assigned_id', $operatorUserId)
            ->whereNotIn('core.states.name', self::INACTIVE_WORKLOAD_STATE_NAMES)
            ->sum(DB::raw('COALESCE(core.priorities.weight, 0)'));
    }

    /**
     * @param  array<int, int>  $operatorIds
     */
    private function activeWorkloadPointsForOperators(array $operatorIds): int
    {
        if ($operatorIds === []) {
            return 0;
        }

        return (int) Incident::query()
            ->leftJoin('core.priorities', 'core.priorities.id', '=', 'core.incidents.priority_id')
            ->join('core.states', 'core.states.id', '=', 'core.incidents.state_id')
            ->whereIn('core.incidents.current_assigned_id', $operatorIds)
            ->whereNotIn('core.states.name', self::INACTIVE_WORKLOAD_STATE_NAMES)
            ->sum(DB::raw('COALESCE(core.priorities.weight, 0)'));
    }

    private function activeTerritoryForUser(int $userId): ?TerritorialUnit
    {
        return UserTerritory::query()
            ->with(['territory.'.TerritorialUnit::PARENT_CHAIN])
            ->active()
            ->where('user_id', $userId)
            ->latest('assigned_at')
            ->first()
            ?->territory;
    }

    private function activeZoneForUser(int $userId): ?TerritorialUnit
    {
        $territory = $this->activeTerritoryForUser($userId);

        return $territory ? $this->resolveOperationalZoneModel($territory) : null;
    }

    private function resolveOperationalZoneModel(TerritorialUnit $territory): ?TerritorialUnit
    {
        if ($territory->type === TerritorialUnit::TYPE_OPERATIONAL_ZONE) {
            return $territory;
        }

        if ($territory->type === TerritorialUnit::TYPE_PROVINCE) {
            $canton = TerritorialUnit::query()
                ->where('type', TerritorialUnit::TYPE_CANTON)
                ->where('code', 'like', $territory->code.'%')
                ->first();

            if ($canton && $canton->parent_id) {
                $zone = TerritorialUnit::find($canton->parent_id);
                if ($zone && $zone->type === TerritorialUnit::TYPE_OPERATIONAL_ZONE) {
                    return $zone;
                }
            }
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

    private function userData(User $user, ?TerritorialUnit $territory = null, ?TerritorialUnit $zone = null): OperationalUserData
    {
        return new OperationalUserData(
            id: (int) $user->id,
            firstName: $user->first_name,
            lastName: $user->last_name,
            email: $user->email,
            roleCode: $user->roles->first()?->code,
            territory: $territory ? $this->territoryData($territory) : null,
            operationalZone: $zone ? $this->territoryData($zone) : null
        );
    }

    private function territoryData(TerritorialUnit $territory): OperationalTerritoryData
    {
        return new OperationalTerritoryData(
            id: (int) $territory->id,
            name: $territory->name,
            type: $territory->type,
            code: $territory->code,
            fullPath: $territory->full_path
        );
    }

    private function loadActiveSupervisorProfile(int $supervisorUserId): SupervisorProfile
    {
        $profile = SupervisorProfile::query()->firstOrCreate(
            ['user_id' => $supervisorUserId],
            ['max_operators' => SupervisorProfile::DEFAULT_MAX_OPERATORS, 'active' => true]
        );

        if (! (bool) $profile->active) {
            throw OperationalAssignmentException::supervisorProfileInactive();
        }

        return $profile;
    }

    private function loadActiveOperatorProfile(int $operatorUserId): OperatorProfile
    {
        $profile = OperatorProfile::query()->firstOrCreate(
            ['user_id' => $operatorUserId],
            [
                'incident_capacity' => OperatorProfile::DEFAULT_INCIDENT_CAPACITY,
                'max_active_incidents' => OperatorProfile::DEFAULT_MAX_ACTIVE_INCIDENTS,
                'max_workload_points' => OperatorProfile::DEFAULT_MAX_WORKLOAD_POINTS,
                'active' => true,
            ]
        );

        if (! (bool) $profile->active) {
            throw OperationalAssignmentException::operatorProfileInactive();
        }

        return $profile;
    }

    /**
     * @return array<int, int>
     */
    private function activeOperatorIdsForZone(TerritorialUnit $zone): array
    {
        return $this->usersByRole('OPERADOR')
            ->filter(function (User $user) use ($zone): bool {
                $operatorZone = $this->activeZoneForUser((int) $user->id);

                return $operatorZone && (int) $operatorZone->id === (int) $zone->id;
            })
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();
    }

    /**
     * @return Collection<int, Incident>
     */
    private function activeTransferIncidentsForOperator(int $operatorUserId)
    {
        return Incident::query()
            ->with(['state', 'priority'])
            ->where('current_assigned_id', $operatorUserId)
            ->whereDoesntHave('state', fn (Builder $query) => $query->whereIn('name', self::INACTIVE_WORKLOAD_STATE_NAMES))
            ->get();
    }

    /**
     * @return array<int, string>
     */
    private function activeZoneIncidentCodes(TerritorialUnit $zone): array
    {
        $operatorIds = $this->activeOperatorIdsForZone($zone);

        if ($operatorIds === []) {
            return [];
        }

        return Incident::query()
            ->whereIn('current_assigned_id', $operatorIds)
            ->whereDoesntHave('state', fn (Builder $query) => $query->whereIn('name', self::INACTIVE_WORKLOAD_STATE_NAMES))
            ->pluck('code')
            ->filter()
            ->values()
            ->all();
    }

    private function ensureOperatorCanReceiveTransferredIncidents($incidents, OperatorProfile $profile, int $replacementOperatorUserId): void
    {
        $currentActiveIncidents = $this->activeIncidentCountForOperator($replacementOperatorUserId);
        $currentWorkloadPoints = $this->activeWorkloadPointsForOperator($replacementOperatorUserId);
        $transferIncidentCount = $incidents->count();
        $transferWorkloadPoints = (int) $incidents->sum(fn (Incident $incident) => (int) ($incident->priority?->weight ?? 0));

        if (
            ($currentActiveIncidents + $transferIncidentCount) > (int) $profile->max_active_incidents
            || ($currentWorkloadPoints + $transferWorkloadPoints) > (int) $profile->max_workload_points
        ) {
            throw OperationalAssignmentException::operatorCapacityExceeded();
        }
    }

    /**
     * @param  array<int, int>  $operatorIds
     */
    private function transferZoneOperatorsToSupervisor(TerritorialUnit $zone, array $operatorIds, int $newSupervisorUserId, int $assignedByUserId): void
    {
        foreach ($operatorIds as $operatorId) {
            $currentAssignment = SupervisorOperatorAssignment::query()
                ->active()
                ->where('operator_user_id', $operatorId)
                ->latest('assigned_at')
                ->first();

            if ($currentAssignment && (int) $currentAssignment->supervisor_user_id === $newSupervisorUserId) {
                continue;
            }

            if ($currentAssignment) {
                $this->deactivateSupervisorAssignment($currentAssignment);
            }

            SupervisorOperatorAssignment::create([
                'supervisor_user_id' => $newSupervisorUserId,
                'operator_user_id' => $operatorId,
                'assigned_by' => $assignedByUserId,
                'assigned_at' => now(),
                'is_active' => true,
            ]);
        }
    }

    private function transferIncidentsToOperator($incidents, int $newOperatorUserId, int $assignedByUserId): void
    {
        foreach ($incidents as $incident) {
            $lockedIncident = Incident::query()
                ->lockForUpdate()
                ->findOrFail($incident->id);

            $activeAssignment = IncidentAssignment::query()
                ->where('incident_id', $lockedIncident->id)
                ->where('active', true)
                ->where('assignment_role', IncidentAssignment::ROLE_PRIMARY)
                ->latest('assignment_date')
                ->first();

            if ($activeAssignment) {
                $activeAssignment->update([
                    'active' => false,
                    'unassignment_date' => now(),
                ]);
            }

            IncidentAssignment::create([
                'incident_id' => $lockedIncident->id,
                'incident_cycle_id' => $lockedIncident->current_cycle_id,
                'user_id' => $newOperatorUserId,
                'assigned_by_id' => $assignedByUserId,
                'assignment_role' => IncidentAssignment::ROLE_PRIMARY,
                'active' => true,
            ]);
        }
    }

    /**
     * @param  array<int, string>  $incidentCodes
     */
    private function transferUnreadNotificationsByIncidentCodes(?int $fromUserId, int $toUserId, array $incidentCodes): void
    {
        if (! $fromUserId || $incidentCodes === []) {
            return;
        }

        $query = Notification::query()
            ->where('user_id', $fromUserId)
            ->where('is_read', false)
            ->where(function (Builder $notificationQuery) use ($incidentCodes): void {
                foreach ($incidentCodes as $incidentCode) {
                    $notificationQuery->orWhere('title', 'ILIKE', "%{$incidentCode}%")
                        ->orWhere('message', 'ILIKE', "%{$incidentCode}%");
                }
            });

        $query->update([
            'user_id' => $toUserId,
            'updated_at' => now(),
        ]);
    }

    /**
     * @param  array<string, mixed>  $oldValues
     * @param  array<string, mixed>  $newValues
     * @param  array<int, string>  $tags
     */
    private function writeTransferAudit(
        string $auditableType,
        int $auditableId,
        int $userId,
        array $oldValues,
        array $newValues,
        array $tags = []
    ): void {
        AuditLog::query()->create([
            'auditable_type' => $auditableType,
            'auditable_id' => $auditableId,
            'event' => self::TRANSFER_AUDIT_EVENT,
            'old_values' => $oldValues,
            'new_values' => $newValues,
            'user_id' => $userId,
            'tags' => $tags,
        ]);
    }

    private function deactivateUserTerritories(Builder $query): void
    {
        $query->get()->each(fn (UserTerritory $assignment) => $this->deactivateUserTerritoryAssignment($assignment));
    }

    private function deactivateSupervisorAssignments(Builder $query): void
    {
        $query->get()->each(fn (SupervisorOperatorAssignment $assignment) => $this->deactivateSupervisorAssignment($assignment));
    }

    private function deactivateUserTerritoryAssignment(UserTerritory $assignment): void
    {
        $assignment->update([
            'is_active' => false,
            'unassigned_at' => now(),
        ]);
    }

    private function deactivateSupervisorAssignment(SupervisorOperatorAssignment $assignment): void
    {
        $assignment->update([
            'is_active' => false,
            'unassigned_at' => now(),
        ]);
    }

    private function deactivateSupervisorAssignmentsOutsideZone(int $supervisorUserId, TerritorialUnit $zone): void
    {
        $assignments = SupervisorOperatorAssignment::query()
            ->active()
            ->where('supervisor_user_id', $supervisorUserId)
            ->get();

        foreach ($assignments as $assignment) {
            $operatorZone = $this->activeZoneForUser((int) $assignment->operator_user_id);

            if (! $operatorZone || (int) $operatorZone->id !== (int) $zone->id) {
                $this->deactivateSupervisorAssignment($assignment);
            }
        }
    }
}
