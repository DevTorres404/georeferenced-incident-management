<?php

namespace App\Incidents\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Nivel de prioridad con SLA en horas.
 *
 * Niveles predefinidos:
 *   1 = Crítica (8h), 2 = Alta (24h), 3 = Media (72h), 4 = Baja (168h)
 */
#[Fillable(['name', 'level', 'color', 'sla_hours', 'weight', 'is_active'])]
class Priority extends Model
{
    protected $table = 'core.priorities';

    protected function casts(): array
    {
        return [
            'level' => 'integer',
            'sla_hours' => 'integer',
            'weight' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function incidents(): HasMany
    {
        return $this->hasMany(Incident::class);
    }

    public function scopeActivos($query)
    {
        return $query->where('is_active', true);
    }
}
