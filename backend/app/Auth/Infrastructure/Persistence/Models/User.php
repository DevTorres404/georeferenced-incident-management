<?php

namespace App\Auth\Infrastructure\Persistence\Models;

use App\Audit\Infrastructure\Persistence\Models\AuditLog;
use App\Audit\Infrastructure\Persistence\Models\LoginAttempt;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAssignment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentComment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentState;
use App\Incidents\Infrastructure\Persistence\Models\Notification;
use App\Operations\Infrastructure\Persistence\Models\OperatorProfile;
use App\Operations\Infrastructure\Persistence\Models\SupervisorOperatorAssignment;
use App\Operations\Infrastructure\Persistence\Models\SupervisorProfile;
use App\Operations\Infrastructure\Persistence\Models\UserTerritory;
use App\Auth\Infrastructure\Notifications\VerifyEmailNotification;
use App\Shared\Infrastructure\Persistence\Concerns\Auditable;
use Database\Factories\UserFactory;
use Illuminate\Auth\MustVerifyEmail as MustVerifyEmailTrait;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

/**
 * Modelo de usuario del sistema.
 *
 * Ubicado en auth.users. Soporta soft deletes (deleted_at)
 * y desactivación temporal (activo = false).
 */
#[Fillable([
    'first_name',
    'last_name',
    'username',
    'email',
    'password',
    'phone',
    'profile_photo',
    'is_active',
])]
#[Hidden([
    'password',
    'remember_token',
])]
class User extends Authenticatable
    implements MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use Auditable, HasApiTokens, HasFactory, MustVerifyEmailTrait, Notifiable, SoftDeletes;

    protected $table = 'auth.users';

    /**
     * Resuelve explícitamente la factory ya que el modelo
     * no está en la ruta convencional App\Models\User.
     */
    protected static function newFactory(): UserFactory
    {
        return UserFactory::new();
    }

    /**
     * Atributos que deben ser casteados a tipos nativos.
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login'        => 'datetime',
            'password'          => 'hashed',
            'is_active'         => 'boolean',
        ];
    }

    public function getEmailVerifiedAtAttribute(): mixed
    {
        return $this->attributes['email_verified_at'] ?? null;
    }

    public function setEmailVerifiedAtAttribute(mixed $value): void
    {
        $this->attributes['email_verified_at'] = $value;
    }

    public function hasVerifiedEmail(): bool
    {
        return ! is_null($this->email_verified_at);
    }

    public function markEmailAsVerified(): bool
    {
        return $this->forceFill([
            'email_verified_at' => $this->freshTimestamp(),
        ])->save();
    }

    /**
     * Send the email verification notification.
     *
     * @return void
     */
    public function sendEmailVerificationNotification()
    {
        $this->notify(new VerifyEmailNotification);
    }

    // ──────────────────────────────────────────────
    // Relaciones
    // ──────────────────────────────────────────────

    /**
     * Roles asignados al usuario (muchos a muchos).
     */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'auth.role_user')
            ->withPivot('assigned_by', 'assigned_at')
            ->withTimestamps();
    }

    /**
     * Proveedores/identidades vinculados al usuario.
     */
    public function identities(): HasMany
    {
        return $this->hasMany(UserIdentity::class, 'user_id');
    }

    /**
     * Incidents reportadas por este usuario.
     */
    public function incidentsReportadas(): HasMany
    {
        return $this->hasMany(Incident::class, 'reported_by_id');
    }

    /**
     * Incidents actualmente asignadas a este usuario.
     */
    public function incidentsAsignadas(): HasMany
    {
        return $this->hasMany(Incident::class, 'current_assigned_id');
    }

    /**
     * Notificaciones del usuario.
     */
    public function notificaciones(): HasMany
    {
        return $this->hasMany(Notification::class, 'user_id');
    }

    /**
     * Comentarios realizados por el usuario.
     */
    public function comments(): HasMany
    {
        return $this->hasMany(IncidentComment::class, 'user_id');
    }

    public function addCommentios(): HasMany
    {
        return $this->comments();
    }

    /**
     * Asignaciones de incidents a este usuario (como operador).
     */
    public function asignacionesComoOperador(): HasMany
    {
        return $this->hasMany(IncidentAssignment::class, 'user_id');
    }

    /**
     * Asignaciones de incidents realizadas por este usuario (como supervisor).
     */
    public function asignacionesComoSupervisor(): HasMany
    {
        return $this->hasMany(IncidentAssignment::class, 'assigned_by_id');
    }

    /**
     * Cambios de estado de incidents realizados por este usuario.
     */
    public function cambiosEstadoRealizados(): HasMany
    {
        return $this->hasMany(IncidentState::class, 'user_id');
    }

    /**
     * Logs de auditoría generados por este usuario.
     */
    public function logsAuditoria(): HasMany
    {
        return $this->hasMany(AuditLog::class, 'user_id');
    }

    /**
     * Intentos de acceso registrados por este usuario.
     */
    public function loginAttempts(): HasMany
    {
        return $this->hasMany(LoginAttempt::class, 'user_id');
    }

    public function territoryAssignments(): HasMany
    {
        return $this->hasMany(UserTerritory::class, 'user_id');
    }

    public function supervisorProfile(): HasOne
    {
        return $this->hasOne(SupervisorProfile::class, 'user_id');
    }

    public function operatorProfile(): HasOne
    {
        return $this->hasOne(OperatorProfile::class, 'user_id');
    }

    public function operatorAssignmentsAsSupervisor(): HasMany
    {
        return $this->hasMany(SupervisorOperatorAssignment::class, 'supervisor_user_id');
    }

    public function operatorAssignmentsAsOperator(): HasMany
    {
        return $this->hasMany(SupervisorOperatorAssignment::class, 'operator_user_id');
    }

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    /**
     * Verifica si el usuario tiene un rol específico.
     */
    public function tieneRol(string $codigo): bool
    {
        if (!$this->is_active) {
            return false;
        }

        if ($this->relationLoaded('roles')) {
            return $this->roles
                ->where('is_active', true)
                ->contains('code', $codigo);
        }

        return $this->roles()->activos()->where('code', $codigo)->exists();
    }

    /**
     * Verifica si el usuario tiene un permiso específico a través de sus roles.
     */
    public function tienePermiso(string $codigoPermiso): bool
    {
        if (!$this->is_active) {
            return false;
        }

        if ($this->relationLoaded('roles')) {
            return $this->roles
                ->where('is_active', true)
                ->flatMap(fn ($role) => $role->permissions)
                ->contains('code', $codigoPermiso);
        }

        return $this->roles()
            ->activos()
            ->whereHas('permissions', fn ($q) => $q->where('code', $codigoPermiso))
            ->exists();
    }

    /**
     * Nombre completo del usuario.
     */
    public function getNombreCompletoAttribute(): string
    {
        return "{$this->first_name} {$this->last_name}";
    }

    /**
     * Normaliza el username: sin dobles espacios, lowercase, y recortado.
     */
    public function setUsernameAttribute(?string $value): void
    {
        $this->attributes['username'] = $value !== null ? mb_strtolower(trim(preg_replace('/\s+/', ' ', $value))) : null;
    }
}
