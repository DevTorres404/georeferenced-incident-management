<?php

namespace App\Operations\Infrastructure\Persistence\Models;

use App\Auth\Infrastructure\Persistence\Models\User;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'user_id',
    'max_operators',
    'active',
])]
final class SupervisorProfile extends Model
{
    protected $table = 'auth.supervisor_profiles';

    public const DEFAULT_MAX_OPERATORS = 5;

    protected function casts(): array
    {
        return [
            'max_operators' => 'integer',
            'active' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
