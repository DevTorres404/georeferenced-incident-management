<?php

namespace App\Incidents\Infrastructure\Persistence\Models;

use App\Auth\Infrastructure\Persistence\Models\User;
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
    'user_id',
    'assigned_by_id',
    'assignment_date',
    'unassignment_date',
])]
class IncidentAssignment extends Model
{
    protected $table = 'core.incident_assignments';

    protected function casts(): array
    {
        return [
            'assignment_date'    => 'datetime',
            'unassignment_date' => 'datetime',
        ];
    }

    public function incident(): BelongsTo
    {
        return $this->belongsTo(Incident::class, 'incident_id');
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
        return is_null($this->unassignment_date);
    }

    public function isActive(): bool
    {
        return $this->estaActiva();
    }
}

