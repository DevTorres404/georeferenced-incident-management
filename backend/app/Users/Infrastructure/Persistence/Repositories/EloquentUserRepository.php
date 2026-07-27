<?php

namespace App\Users\Infrastructure\Persistence\Repositories;

use App\Audit\Infrastructure\Services\AuditRecorder;
use App\Auth\Application\Ports\UserNotificationPort;
use App\Auth\Domain\Entities\AuthUser;
use App\Auth\Infrastructure\Persistence\Mappers\AuthUserMapper;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Auth\Infrastructure\Persistence\Models\UserIdentity;
use App\Shared\Application\Results\PaginatedResult;
use App\Users\Application\DTOs\CreateManagedUserInputData;
use App\Users\Application\DTOs\SyncUserRolesInputData;
use App\Users\Application\DTOs\UpdateManagedUserInputData;
use App\Users\Application\DTOs\UserFiltersData;
use App\Users\Domain\Repositories\UserRepositoryInterface;
use Illuminate\Support\Facades\DB;

final class EloquentUserRepository implements UserRepositoryInterface
{
    public function __construct(
        private AuthUserMapper $userMapper,
        private UserNotificationPort $notificationPort,
        private AuditRecorder $auditRecorder
    ) {}

    public function paginate(UserFiltersData $filters): PaginatedResult
    {
        $query = User::query()->with('roles.permissions')->latest();

        if ($filters->search !== null && $filters->search !== '') {
            $search = $filters->search;
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'ILIKE', "%{$search}%")
                    ->orWhere('last_name', 'ILIKE', "%{$search}%")
                    ->orWhere('email', 'ILIKE', "%{$search}%");
            });
        }

        if ($filters->roleCode !== null && $filters->roleCode !== '') {
            $query->whereHas('roles', fn ($q) => $q->where('code', $filters->roleCode));
        }

        if ($filters->isActive !== null) {
            $query->where('is_active', $filters->isActive);
        }

        $result = $query->paginate($filters->perPage);

        return new PaginatedResult(
            items: array_map(fn (User $user) => $this->userMapper->fromModel($user), $result->items()),
            currentPage: $result->currentPage(),
            perPage: $result->perPage(),
            total: $result->total(),
            lastPage: $result->lastPage()
        );
    }

    public function create(CreateManagedUserInputData $data): AuthUser
    {
        $user = User::create([
            'first_name' => $data->firstName,
            'last_name' => $data->lastName,
            'username' => $this->normalizeNullable($data->username),
            'email' => strtolower($data->email),
            'password' => $data->password,
            'phone' => $this->normalizeNullable($data->phone),
            'profile_photo' => $this->normalizeNullable($data->profilePhoto),
            'is_active' => $data->isActive,
        ]);

        $this->syncRoles(new SyncUserRolesInputData($user->id, $data->roleCodes, $data->assignedBy));
        $this->syncLocalIdentity($user->id);
        $this->notificationPort->sendVerificationEmail($user->id);

        return $this->show($user->id);
    }

    public function show(int $userId): AuthUser
    {
        return $this->userMapper->fromModel(
            User::with(['roles.permissions', 'identities'])->findOrFail($userId)
        );
    }

    public function update(int $userId, UpdateManagedUserInputData $data): AuthUser
    {
        $user = User::findOrFail($userId);

        $payload = array_filter([
            'first_name' => $data->firstName,
            'last_name' => $data->lastName,
            'username' => $data->username !== null ? $this->normalizeNullable($data->username) : null,
            'email' => $data->email !== null ? strtolower($data->email) : null,
            'password' => $data->password,
            'phone' => $data->phone !== null ? $this->normalizeNullable($data->phone) : null,
            'profile_photo' => $data->profilePhoto !== null ? $this->normalizeNullable($data->profilePhoto) : null,
            'is_active' => $data->isActive,
        ], static fn ($value) => $value !== null);

        $user->update($payload);
        $this->syncLocalIdentity($user->id);

        if ($data->roleCodes !== null) {
            $this->syncRoles(new SyncUserRolesInputData($user->id, $data->roleCodes, $data->assignedBy));
        }

        return $this->show($user->id);
    }

    public function delete(int $userId): void
    {
        User::findOrFail($userId)->delete();
    }

    public function syncRoles(SyncUserRolesInputData $data): AuthUser
    {
        $user = User::findOrFail($data->userId);
        $previousRoleCodes = $user->roles()->pluck('code')->sort()->values()->all();
        $roles = Role::whereIn('code', $data->roleCodes)->pluck('id')->all();
        $sync = collect($roles)
            ->mapWithKeys(fn ($id) => [$id => ['assigned_by' => $data->assignedBy, 'assigned_at' => now()]])
            ->all();

        $user->roles()->sync($sync);

        $currentRoleCodes = $user->roles()->pluck('code')->sort()->values()->all();
        $this->auditRecorder->recordChange(
            User::class,
            (int) $user->id,
            ['roles' => $previousRoleCodes],
            ['roles' => $currentRoleCodes],
            $data->assignedBy,
            $user->getTable()
        );

        return $this->show($user->id);
    }

    public function resetTwoFactor(int $userId, int $actorId): AuthUser
    {
        return DB::transaction(function () use ($userId, $actorId): AuthUser {
            $user = User::findOrFail($userId);
            $wasConfigured = $user->two_factor_secret !== null
                || $user->two_factor_confirmed_at !== null
                || $user->two_factor_recovery_codes !== null;

            abort_unless($wasConfigured, 422, 'La doble autenticacion del usuario ya esta desactivada.');

            $wasEnabled = $user->two_factor_secret !== null
                && $user->two_factor_confirmed_at !== null;

            $user->forceFill([
                'two_factor_secret' => null,
                'two_factor_recovery_codes' => null,
                'two_factor_confirmed_at' => null,
            ])->save();
            $user->tokens()->delete();

            $this->auditRecorder->recordChange(
                User::class,
                (int) $user->id,
                [
                    'two_factor_configured' => true,
                    'two_factor_enabled' => $wasEnabled,
                ],
                [
                    'two_factor_configured' => false,
                    'two_factor_enabled' => false,
                ],
                $actorId,
                $user->getTable()
            );

            return $this->show($user->id);
        });
    }

    private function syncLocalIdentity(int $userId): void
    {
        $user = User::findOrFail($userId);

        UserIdentity::updateOrCreate(
            [
                'user_id' => $user->id,
                'provider' => 'local',
            ],
            [
                'provider_uid' => strtolower($user->email),
                'provider_email' => strtolower($user->email),
                'verified_at' => $user->email_verified_at,
                'last_used_at' => now(),
                'provider_data' => [
                    'source' => 'admin_form',
                ],
            ]
        );
    }

    private function normalizeNullable(?string $value): ?string
    {
        $normalized = $value !== null ? trim($value) : null;

        return $normalized === '' ? null : $normalized;
    }
}
