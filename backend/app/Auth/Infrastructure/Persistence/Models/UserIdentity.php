<?php

namespace App\Auth\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'user_id',
    'provider',
    'provider_uid',
    'provider_email',
    'verified_at',
    'last_used_at',
    'provider_data',
])]
class UserIdentity extends Model
{
    protected $table = 'auth.user_identities';

    protected function casts(): array
    {
        return [
            'verified_at' => 'datetime',
            'last_used_at' => 'datetime',
            'provider_data' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}

