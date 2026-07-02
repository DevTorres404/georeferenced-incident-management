<?php

namespace App\Operations\Infrastructure\Persistence\Models;

use App\Auth\Infrastructure\Persistence\Models\User;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'user_id',
    'incident_capacity',
])]
final class OperatorProfile extends Model
{
    protected $table = 'auth.operator_profiles';

    public const DEFAULT_INCIDENT_CAPACITY = 20;

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
