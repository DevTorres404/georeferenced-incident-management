<?php

namespace App\Auth\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'email',
    'token',
    'created_at',
    'expires_at',
    'attempts',
    'used_at',
])]
class PasswordResetToken extends Model
{
    protected $table = 'auth.password_reset_tokens';

    protected $primaryKey = 'email';
    public $incrementing = false;
    protected $keyType = 'string';

    const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'expires_at' => 'datetime',
            'used_at' => 'datetime',
            'attempts' => 'integer',
        ];
    }
}
