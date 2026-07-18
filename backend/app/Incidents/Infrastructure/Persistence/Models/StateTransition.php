<?php

namespace App\Incidents\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Regla de transición entre states.
 *
 * Define qué cambios de estado son válidos, qué roles pueden
 * ejecutarlos, y si requieren comment obligatorio.
 */
#[Fillable([
    'source_state_id',
    'target_state_id',
    'requires_comment',
    'allowed_roles',
    'is_active',
])]
class StateTransition extends Model
{
    protected $table = 'core.state_transitions';

    protected function casts(): array
    {
        return [
            'requires_comment' => 'boolean',
            'allowed_roles' => 'array', // JSONB → array PHP
            'is_active' => 'boolean',
        ];
    }

    // ──────────────────────────────────────────────
    // Relaciones
    // ──────────────────────────────────────────────

    public function sourceState(): BelongsTo
    {
        return $this->belongsTo(State::class, 'source_state_id');
    }

    public function targetState(): BelongsTo
    {
        return $this->belongsTo(State::class, 'target_state_id');
    }

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    /**
     * Verifica si un rol puede ejecutar esta transición.
     */
    public function isAllowedForRole(string $roleCode): bool
    {
        if (empty($this->allowed_roles)) {
            return true;
        }

        return in_array($roleCode, $this->allowed_roles);
    }
}
