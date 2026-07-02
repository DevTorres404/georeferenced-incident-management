<?php

namespace App\Incidents\Infrastructure\Persistence\Models;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Shared\Infrastructure\Persistence\Concerns\Auditable;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Incident — Tabla principal del sistema.
 *
 * Representa un reporte ciudadano con clasificación, ubicación
 * geográfica, trazabilidad de asignaciones y control de SLA.
 *
 * Campos gestionados por triggers de PostgreSQL:
 *   - ubicacion:          Sincronizado desde latitude/longitude (trg_actualizar_ubicacion)
 *   - fecha_limite:       Calculado desde SLA de prioridad (trg_calcular_fecha_limite)
 *   - asignado_actual_id: Sincronizado desde incident_asignaciones (trg_sincronizar_asignacion)
 */
#[Fillable([
    'code',
    'title',
    'description',
    'category_id',
    'subcategory_id',
    'priority_id',
    'state_id',
    'territorial_unit_id',
    'address',
    'address_reference',
    'latitude',
    'longitude',
    'reported_by_id',
    'resolution_date',
])]
class Incident extends Model
{
    use Auditable, SoftDeletes;

    protected $table = 'core.incidents';

    protected function casts(): array
    {
        return [
            'latitude'          => 'decimal:8',
            'longitude'         => 'decimal:8',
            'due_date'          => 'datetime',
            'resolution_date'   => 'datetime',
        ];
    }

    // ──────────────────────────────────────────────
    // Relaciones — Clasificación
    // ──────────────────────────────────────────────

    public function categoria(): BelongsTo
    {
        return $this->belongsTo(Category::class, 'category_id');
    }

    public function category(): BelongsTo
    {
        return $this->categoria();
    }

    public function subcategoria(): BelongsTo
    {
        return $this->belongsTo(Subcategory::class, 'subcategory_id');
    }

    public function subcategory(): BelongsTo
    {
        return $this->subcategoria();
    }

    public function prioridad(): BelongsTo
    {
        return $this->belongsTo(Priority::class, 'priority_id');
    }

    public function priority(): BelongsTo
    {
        return $this->prioridad();
    }

    public function estado(): BelongsTo
    {
        return $this->belongsTo(State::class, 'state_id');
    }

    public function state(): BelongsTo
    {
        return $this->estado();
    }

    // ──────────────────────────────────────────────
    // Relaciones — Ubicación
    // ──────────────────────────────────────────────

    public function territorialUnit(): BelongsTo
    {
        return $this->belongsTo(TerritorialUnit::class, 'territorial_unit_id');
    }

    // ──────────────────────────────────────────────
    // Relaciones — Trazabilidad
    // ──────────────────────────────────────────────

    public function reportadoPor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reported_by_id');
    }

    public function reporter(): BelongsTo
    {
        return $this->reportadoPor();
    }

    public function asignadoActual(): BelongsTo
    {
        return $this->belongsTo(User::class, 'current_assigned_id');
    }

    public function currentAssignee(): BelongsTo
    {
        return $this->asignadoActual();
    }

    // ──────────────────────────────────────────────
    // Relaciones — Detalle
    // ──────────────────────────────────────────────

    public function historialEstados(): HasMany
    {
        return $this->hasMany(IncidentState::class, 'incident_id')
            ->orderBy('created_at', 'desc');
    }

    public function stateHistory(): HasMany
    {
        return $this->historialEstados();
    }

    public function asignaciones(): HasMany
    {
        return $this->hasMany(IncidentAssignment::class, 'incident_id')
            ->orderBy('assignment_date', 'desc');
    }

    public function assignments(): HasMany
    {
        return $this->asignaciones();
    }

    public function comments(): HasMany
    {
        return $this->hasMany(IncidentComment::class, 'incident_id')
            ->orderBy('created_at', 'asc');
    }

    public function addCommentios(): HasMany
    {
        return $this->comments();
    }

    public function adjuntos(): HasMany
    {
        return $this->hasMany(IncidentAttachment::class, 'incident_id');
    }

    public function attachments(): HasMany
    {
        return $this->adjuntos();
    }

    // ──────────────────────────────────────────────
    // Scopes
    // ──────────────────────────────────────────────

    public function scopeVencidas($query)
    {
        return $query->whereNotNull('due_date')
            ->where('due_date', '<', now())
            ->whereHas('estado', fn ($q) => $q->where('is_final_state', false));
    }

    public function scopeOverdue($query)
    {
        return $this->scopeVencidas($query);
    }

    public function scopeEnRadio($query, float $lat, float $lng, float $radioKm)
    {
        $radioMetros = $radioKm * 1000;

        return $query->whereRaw(
            'ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?)',
            [$lng, $lat, $radioMetros]
        );
    }

    public function scopeWithinRadius($query, float $latitude, float $longitude, float $radiusKm)
    {
        return $this->scopeEnRadio($query, $latitude, $longitude, $radiusKm);
    }

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    public function estaVencida(): bool
    {
        return $this->due_date
            && $this->due_date->isPast()
            && ! $this->estado?->is_final_state;
    }

    public function isOverdue(): bool
    {
        return $this->estaVencida();
    }
}
