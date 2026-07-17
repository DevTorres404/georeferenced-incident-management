<?php

namespace App\Incidents\Infrastructure\Persistence\Models;

use App\Auth\Infrastructure\Persistence\Models\User;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Registro histórico de cambio de estado de una incident.
 * Tabla append-only: los registros nunca se actualizan.
 */
#[Fillable([
    'incident_id',
    'incident_cycle_id',
    'previous_state_id',
    'new_state_id',
    'user_id',
    'comment',
])]
class IncidentState extends Model
{
    protected $table = 'core.incident_states';

    const UPDATED_AT = null;

    public function incident(): BelongsTo
    {
        return $this->belongsTo(Incident::class, 'incident_id');
    }

    public function estadoAnterior(): BelongsTo
    {
        return $this->belongsTo(State::class, 'previous_state_id');
    }

    public function previousState(): BelongsTo
    {
        return $this->estadoAnterior();
    }

    public function estadoNuevo(): BelongsTo
    {
        return $this->belongsTo(State::class, 'new_state_id');
    }

    public function newState(): BelongsTo
    {
        return $this->estadoNuevo();
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function user(): BelongsTo
    {
        return $this->usuario();
    }

    public function cycle(): BelongsTo
    {
        return $this->belongsTo(IncidentCycle::class, 'incident_cycle_id');
    }
}
