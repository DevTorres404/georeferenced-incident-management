<?php

namespace App\Shared\Infrastructure\Notifications;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Notification;

final class UserNotifier
{
    public function notify(
        int $userId,
        string $title,
        string $message,
        string $type = 'STATUS_CHANGE',
        ?int $incidentId = null,
        bool $deduplicate = false
    ): bool {
        if (! $this->canReceiveNotifications($userId)) {
            return false;
        }

        if ($deduplicate && $this->alreadyExists($userId, $title, $message, $incidentId)) {
            return false;
        }

        Notification::create([
            'user_id' => $userId,
            'incident_id' => $incidentId,
            'title' => $title,
            'message' => $message,
            'type' => $type,
            'is_read' => false,
            'read_at' => null,
        ]);

        return true;
    }

    /**
     * @param  array<int, int>  $userIds
     */
    public function notifyMany(
        array $userIds,
        string $title,
        string $message,
        string $type = 'STATUS_CHANGE',
        ?int $incidentId = null,
        bool $deduplicate = false
    ): int {
        $created = 0;

        foreach (array_unique(array_map('intval', $userIds)) as $userId) {
            if ($this->notify($userId, $title, $message, $type, $incidentId, $deduplicate)) {
                $created++;
            }
        }

        return $created;
    }

    private function canReceiveNotifications(int $userId): bool
    {
        return User::query()
            ->whereKey($userId)
            ->where('is_active', true)
            ->whereHas('roles', fn ($roleQuery) => $roleQuery
                ->where('is_active', true)
                ->whereHas('permissions', fn ($permissionQuery) => $permissionQuery
                    ->where('code', 'notifications.view')))
            ->exists();
    }

    private function alreadyExists(
        int $userId,
        string $title,
        string $message,
        ?int $incidentId
    ): bool {
        return Notification::query()
            ->where('user_id', $userId)
            ->where('title', $title)
            ->where('message', $message)
            ->when(
                $incidentId === null,
                fn ($query) => $query->whereNull('incident_id'),
                fn ($query) => $query->where('incident_id', $incidentId)
            )
            ->exists();
    }
}
