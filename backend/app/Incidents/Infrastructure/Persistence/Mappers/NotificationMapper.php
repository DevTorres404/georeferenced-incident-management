<?php

namespace App\Incidents\Infrastructure\Persistence\Mappers;

use App\Incidents\Application\DTOs\NotificationData;
use App\Incidents\Infrastructure\Persistence\Models\Notification;

final class NotificationMapper
{
    public function fromModel(Notification $notification): NotificationData
    {
        return new NotificationData(
            id: (int) $notification->id,
            userId: (int) $notification->user_id,
            title: $notification->title,
            message: $notification->message,
            type: $notification->type,
            isRead: (bool) $notification->is_read,
            readAt: $notification->read_at?->toIso8601String(),
            createdAt: $notification->created_at?->toIso8601String()
        );
    }
}
