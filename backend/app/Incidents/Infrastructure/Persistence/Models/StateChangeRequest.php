<?php

namespace App\Incidents\Infrastructure\Persistence\Models;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Shared\Infrastructure\Persistence\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class StateChangeRequest extends Model
{
    use Auditable;

    public const UPDATED_AT = null;

    protected $table = 'state_change_requests';

    protected $fillable = [
        'incident_id',
        'requested_by_user_id',
        'requested_state_id',
        'reason',
        'status',
        'reviewed_by_user_id',
        'reviewer_comment',
        'reviewed_at',
    ];

    protected function casts(): array
    {
        return [
            'reviewed_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    public function incident(): BelongsTo
    {
        return $this->belongsTo(Incident::class);
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by_user_id');
    }

    public function requestedState(): BelongsTo
    {
        return $this->belongsTo(State::class, 'requested_state_id');
    }
}
