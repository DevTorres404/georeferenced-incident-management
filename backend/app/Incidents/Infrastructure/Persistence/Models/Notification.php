<?php

namespace App\Incidents\Infrastructure\Persistence\Models;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Broadcasting\NotificationCreated;
use App\Incidents\Infrastructure\Persistence\Mappers\NotificationMapper;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Notificación in-app del sistema.
 *
 * Usa el ENUM core.tipo_notificacion de PostgreSQL para los tipos.
 * Sistema custom independiente de Laravel Notifications.
 */
#[Fillable([
    'user_id',
    'title',
    'message',
    'type',
    'is_read',
    'read_at',
])]
class Notification extends Model
{
    protected $table = 'core.notifications';

    protected static function booted(): void
    {
        static::created(function (Notification $notification): void {
            event(new NotificationCreated(
                app(NotificationMapper::class)->fromModel($notification)
            ));
        });
    }

    protected function casts(): array
    {
        return [
            'is_read'        => 'boolean',
            'read_at' => 'datetime',
        ];
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function user(): BelongsTo
    {
        return $this->usuario();
    }

    public function scopeNoLeidas($query)
    {
        return $query->where('is_read', false);
    }

    public function scopeUnread($query)
    {
        return $this->scopeNoLeidas($query);
    }

    public function scopeLeidas($query)
    {
        return $query->where('is_read', true);
    }

    public function scopeRead($query)
    {
        return $this->scopeLeidas($query);
    }

    public function markAsRead(): void
    {
        $this->update([
            'is_read'        => true,
            'read_at' => now(),
        ]);
    }

    public function marcarComoLeida(): void
    {
        $this->markAsRead();
    }
}
