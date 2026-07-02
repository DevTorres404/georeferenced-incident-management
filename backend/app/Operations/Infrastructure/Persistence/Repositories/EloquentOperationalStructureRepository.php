<?php

namespace App\Operations\Infrastructure\Persistence\Repositories;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Operations\Application\DTOs\AssignOperatorTerritoryInputData;
use App\Operations\Application\DTOs\AssignSupervisorToZoneInputData;
use App\Operations\Application\DTOs\OperatorProfileData;
use App\Operations\Application\DTOs\OperationalTerritoryData;
use App\Operations\Application\DTOs\OperationalUserData;
use App\Operations\Application\DTOs\OperationalZoneSummaryData;
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
use Illuminate\Support\Facades\DB;

final class EloquentOperationalStructureRepository implements OperationalStructureRepositoryInterface
{
    public function __construct(private SupervisorCapacityPolicy $supervisorCapacityPolicy)
    {
    }

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

        DB::transaction(function () use ($data, $zone, $supervisor): void {
            SupervisorProfile::query()->firstOrCreate(
                ['user_id' => $supervisor->id],
                ['max_operators' => SupervisorProfile::DEFAULT_MAX_OPERATORS]
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

            $this->deactivateSupervisorAssignmentsOutsideZone((int) $supervisor->id, $zone);
        });

        return $this->zoneSummary($zone->fresh(TerritorialUnit::PARENT_CHAIN));
    }

    public function syncSupervisorOperators(SyncSupervisorOperatorsInputData $data): SupervisorProfileData
    {
        $supervisor = $this->loadUserByRole($data->supervisorUserId, 'SUPERVISOR');
        $profile = SupervisorProfile::query()->firstOrCreate(
            ['user_id' => $supervisor->id],
            ['max_operators' => SupervisorProfile::DEFAULT_MAX_OPERATORS]
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
                ['incident_capacity' => OperatorProfile::DEFAULT_INCIDENT_CAPACITY]
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

    public function updateSupervisorProfile(UpdateSupervisorProfileInputData $data): SupervisorProfileData
    {
        $supervisor = $this->loadUserByRole($data->supervisorUserId, 'SUPERVISOR');
        $profile = SupervisorProfile::query()->firstOrCreate(
            ['user_id' => $supervisor->id],
            ['max_operators' => SupervisorProfile::DEFAULT_MAX_OPERATORS]
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
            ['incident_capacity' => OperatorProfile::DEFAULT_INCIDENT_CAPACITY]
        );

        $profile->update([
            'incident_capacity' => $data->incidentCapacity,
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
                ['max_operators' => SupervisorProfile::DEFAULT_MAX_OPERATORS]
            )
            : null;

        $activeOperatorsCount = $supervisor
            ? SupervisorOperatorAssignment::query()
                ->active()
                ->where('supervisor_user_id', $supervisor->id)
                ->count()
            : 0;

        return new OperationalZoneSummaryData(
            zone: $this->territoryData($zone),
            supervisor: $supervisor ? $this->userData($supervisor, $zone, $zone) : null,
            maxOperators: (int) ($profile?->max_operators ?? SupervisorProfile::DEFAULT_MAX_OPERATORS),
            activeOperatorsCount: $activeOperatorsCount
        );
    }

    private function supervisorProfileData(User $user): SupervisorProfileData
    {
        $profile = SupervisorProfile::query()->firstOrCreate(
            ['user_id' => $user->id],
            ['max_operators' => SupervisorProfile::DEFAULT_MAX_OPERATORS]
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
            ['incident_capacity' => OperatorProfile::DEFAULT_INCIDENT_CAPACITY]
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

        return new OperatorProfileData(
            operator: $this->userData($user, $territory, $zone),
            incidentCapacity: (int) $profile->incident_capacity,
            supervisor: $assignment ? $this->userData($assignment->supervisor, $supervisorTerritory, $supervisorZone) : null
        );
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
