<?php

namespace App\Audit\Infrastructure\Persistence\Models;

use App\Auth\Infrastructure\Persistence\Models\User;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Registro de intento de autenticación.
 *
 * Registra tanto accesos exitosos como fallidos para
 * monitoreo de seguridad y detección de fuerza bruta.
 */
#[Fillable([
    'email',
    'user_id',
    'login_type',
    'is_success',
    'failure_reason',
    'session_id',
    'ip_address',
    'user_agent',
])]
class LoginAttempt extends Model
{
    protected $table = 'audit.access_logs';

    const UPDATED_AT = null;
    public $timestamps = true;

    protected function casts(): array
    {
        return [
            'is_success' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function scopeSuccessful($query)
    {
        return $query->where('is_success', true);
    }

    public function scopeFailed($query)
    {
        return $query->where('is_success', false);
    }

    public function scopeFailedFromIp($query, string $ip, int $minutes = 15)
    {
        return $query->where('is_success', false)
            ->where('ip_address', $ip)
            ->where('created_at', '>=', now()->subMinutes($minutes));
    }
}

