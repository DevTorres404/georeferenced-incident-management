<?php

namespace App\Auth\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * Permiso granular del sistema.
 *
 * Los permissions se agrupan por módulo y se asignan a roles.
 * Formato del código: module.action (ej: incidents.create)
 */
#[Fillable([
    'code',
    'name',
    'description',
    'module',
])]
class Permission extends Model
{
    protected $table = 'auth.permissions';

    // ──────────────────────────────────────────────
    // Relaciones
    // ──────────────────────────────────────────────

    /**
     * Roles que tienen este permiso.
     */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'auth.permission_role')
            ->withTimestamps();
    }

    // ──────────────────────────────────────────────
    // Scopes
    // ──────────────────────────────────────────────

    /**
     * Filtra permissions por módulo.
     */
    public function scopeDelModulo($query, string $module)
    {
        return $query->where('module', $module);
    }
}
