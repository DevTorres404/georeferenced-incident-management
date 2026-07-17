<?php

namespace App\Incidents\Infrastructure\Persistence\Models;

use App\Auth\Infrastructure\Persistence\Models\User;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Comentario sobre una incident.
 *
 * El flag is_internal permite comunicación entre operadores/supervisores
 * sin exponer el contenido al ciudadano que reportó.
 */
#[Fillable([
    'incident_id',
    'incident_cycle_id',
    'user_id',
    'comment',
    'is_internal',
])]
class IncidentComment extends Model
{
    protected $table = 'core.incident_comments';

    protected function casts(): array
    {
        return [
            'is_internal' => 'boolean',
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

    public function cycle(): BelongsTo
    {
        return $this->belongsTo(IncidentCycle::class, 'incident_cycle_id');
    }

    public function scopePublicos($query)
    {
        return $query->where('is_internal', false);
    }

    public function scopePublic($query)
    {
        return $this->scopePublicos($query);
    }

    public function scopeInternos($query)
    {
        return $query->where('is_internal', true);
    }

    public function scopeInternal($query)
    {
        return $this->scopeInternos($query);
    }
}
