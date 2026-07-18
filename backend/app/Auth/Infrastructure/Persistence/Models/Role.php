<?php

namespace App\Auth\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * Rol del sistema (ADMIN, SUPERVISOR, OPERADOR, CIUDADANO).
 *
 * Cada rol agrupa un conjunto de permissions y puede assignse
 * a múltiples usuarios.
 */
#[Fillable([
    'code',
    'name',
    'description',
    'is_active',
])]
class Role extends Model
{
    protected $table = 'auth.roles';

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    // ──────────────────────────────────────────────
    // Relaciones
    // ──────────────────────────────────────────────

    /**
     * Usuarios que tienen este rol.
     */
    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'auth.role_user')
            ->withPivot('assigned_by', 'assigned_at')
            ->withTimestamps();
    }

    /**
     * Permisos asignados a este rol.
     */
    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'auth.permission_role')
            ->withTimestamps();
    }

    // ──────────────────────────────────────────────
    // Scopes
    // ──────────────────────────────────────────────

    /**
     * Filtra solo roles activos.
     */
    public function scopeActivos($query)
    {
        return $query->where('is_active', true);
    }
}
