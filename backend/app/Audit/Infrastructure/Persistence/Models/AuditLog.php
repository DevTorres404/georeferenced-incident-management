<?php

namespace App\Audit\Infrastructure\Persistence\Models;

use App\Auth\Infrastructure\Persistence\Models\User;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Registro de auditoría genérico.
 *
 * Almacena snapshots JSONB de los datos antes y después de cada
 * operación INSERT/UPDATE/DELETE en las tablas del sistema.
 */
#[Fillable([
    'auditable_type',
    'auditable_id',
    'event',
    'old_values',
    'new_values',
    'url',
    'user_id',
    'ip_address',
    'user_agent',
    'tags',
])]
class AuditLog extends Model
{
    protected $table = 'audit.audit_logs';

    const UPDATED_AT = null;

    public $timestamps = true;

    protected function casts(): array
    {
        return [
            'old_values' => 'array',
            'new_values' => 'array',
            'tags' => 'array',
            'auditable_id' => 'integer',
        ];
    }

    public function auditable()
    {
        return $this->morphTo();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
