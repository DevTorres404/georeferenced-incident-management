<?php

namespace App\Incidents\Infrastructure\Persistence\Models;

use App\Shared\Infrastructure\Persistence\Concerns\Auditable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * State del ciclo de vida de una incident.
 *
 * Controla el flujo de trabajo con metadatos:
 *   - es_estado_inicial: punto de entrada (ej: NUEVA)
 *   - es_estado_final: punto terminal (ej: CERRADA, RECHAZADA)
 *   - permite_edicion: si la incident puede modificarse
 *   - orden: secuencia visual en el flujo
 */
#[Fillable([
    'name',
    'description',
    'color',
    'is_initial_state',
    'is_final_state',
    'allows_edition',
    'order',
    'is_active',
])]
class State extends Model
{
    use Auditable;

    protected $table = 'core.states';

    protected function casts(): array
    {
        return [
            'is_initial_state' => 'boolean',
            'is_final_state' => 'boolean',
            'allows_edition' => 'boolean',
            'is_active' => 'boolean',
            'order' => 'integer',
        ];
    }

    // ──────────────────────────────────────────────
    // Relaciones
    // ──────────────────────────────────────────────

    public function incidents(): HasMany
    {
        return $this->hasMany(Incident::class);
    }

    /**
     * Transiciones válidas DESDE este estado.
     */
    public function transitionsOrigen(): HasMany
    {
        return $this->hasMany(StateTransition::class, 'source_state_id');
    }

    /**
     * Transiciones válidas HACIA este estado.
     */
    public function transitionsDestino(): HasMany
    {
        return $this->hasMany(StateTransition::class, 'target_state_id');
    }

    // ──────────────────────────────────────────────
    // Scopes
    // ──────────────────────────────────────────────

    public function scopeActivos($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeActive($query)
    {
        return $this->scopeActivos($query);
    }

    public function scopeOrdenado($query)
    {
        return $query->orderBy('order');
    }

    public function scopeOrdered($query)
    {
        return $this->scopeOrdenado($query);
    }

    /**
     * Obtiene el estado inicial del sistema.
     */
    public function scopeInicial($query)
    {
        return $query->where('is_initial_state', true);
    }

    public function scopeInitial($query)
    {
        return $this->scopeInicial($query);
    }
}
