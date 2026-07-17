<?php

namespace App\Incidents\Infrastructure\Persistence\Models;

use App\Auth\Infrastructure\Persistence\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class IncidentCycle extends Model
{
    protected $table = 'core.incident_cycles';

    protected $fillable = [
        'incident_id',
        'cycle_number',
        'opened_at',
        'opened_by',
        'reopening_reason',
        'resolved_at',
        'resolved_by',
        'resolution_description',
        'closed_at',
        'closed_by',
        'closure_reason',
        'snapshot',
        'snapshot_generated_at',
    ];

    protected function casts(): array
    {
        return [
            'cycle_number' => 'integer',
            'opened_at' => 'datetime',
            'resolved_at' => 'datetime',
            'closed_at' => 'datetime',
            'snapshot_generated_at' => 'datetime',
            'snapshot' => 'array',
        ];
    }

    public function incident(): BelongsTo
    {
        return $this->belongsTo(Incident::class, 'incident_id');
    }

    public function openedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'opened_by');
    }

    public function resolvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }

    public function closedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by');
    }

    public function statusHistory(): HasMany
    {
        return $this->hasMany(IncidentState::class, 'incident_cycle_id');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(IncidentComment::class, 'incident_cycle_id');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(IncidentAttachment::class, 'incident_cycle_id');
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(IncidentAssignment::class, 'incident_cycle_id');
    }

    public function isResolved(): bool
    {
        return $this->resolved_at !== null;
    }

    public function isClosed(): bool
    {
        return $this->closed_at !== null;
    }

    public function isActive(): bool
    {
        return ! $this->isClosed();
    }

    public function status(): string
    {
        if ($this->closed_at) {
            return 'closed';
        }

        if ($this->resolved_at) {
            return 'resolved';
        }

        return 'active';
    }

    public function scopeActive($query)
    {
        return $query->whereNull('closed_at');
    }
}
