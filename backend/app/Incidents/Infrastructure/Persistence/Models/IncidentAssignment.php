<?php

namespace App\Incidents\Infrastructure\Persistence\Models;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Shared\Infrastructure\Persistence\Concerns\Auditable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Registro de asignación de incident a un operador.
 *
 * IMPORTANTE: No actualizar incidents.asignado_actual_id directamente.
 * El trigger trg_sincronizar_asignacion se encarga de eso al insertar aquí.
 */
#[Fillable([
    'incident_id',
    'incident_cycle_id',
    'user_id',
    'assigned_by_id',
    'assignment_role',
    'active',
    'assignment_date',
    'unassignment_date',
    'resolved_at',
])]
class IncidentAssignment extends Model
{
    use Auditable;

    protected $table = 'core.incident_assignments';

    public const ROLE_PRIMARY = 'primary';

    public const ROLE_SUPPORT = 'support';

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
            'assignment_date' => 'datetime',
            'unassignment_date' => 'datetime',
            'resolved_at' => 'datetime',
        ];
    }

    public function incident(): BelongsTo
    {
        return $this->belongsTo(Incident::class, 'incident_id');
    }

    public function cycle(): BelongsTo
    {
        return $this->belongsTo(IncidentCycle::class, 'incident_cycle_id');
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function user(): BelongsTo
    {
        return $this->usuario();
    }

    public function asignadoPor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by_id');
    }

    public function assignedBy(): BelongsTo
    {
        return $this->asignadoPor();
    }

    public function estaActiva(): bool
    {
        return (bool) $this->active && is_null($this->unassignment_date);
    }

    public function isActive(): bool
    {
        return $this->estaActiva();
    }
}
