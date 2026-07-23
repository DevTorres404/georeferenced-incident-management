<?php

namespace App\Operations\Infrastructure\Persistence\Models;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Shared\Infrastructure\Persistence\Concerns\Auditable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'user_id',
    'incident_capacity',
    'max_active_incidents',
    'max_workload_points',
    'active',
])]
final class OperatorProfile extends Model
{
    use Auditable;

    protected $table = 'auth.operator_profiles';

    public const DEFAULT_INCIDENT_CAPACITY = 20;

    public const DEFAULT_MAX_ACTIVE_INCIDENTS = 10;

    public const DEFAULT_MAX_WORKLOAD_POINTS = 20;

    protected function casts(): array
    {
        return [
            'incident_capacity' => 'integer',
            'max_active_incidents' => 'integer',
            'max_workload_points' => 'integer',
            'active' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
