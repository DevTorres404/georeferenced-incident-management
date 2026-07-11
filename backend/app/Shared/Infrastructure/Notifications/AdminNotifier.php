<?php

namespace App\Shared\Infrastructure\Notifications;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Notification;

final class AdminNotifier
{
    /**
     * @param  array<int, int>  $excludeUserIds
     */
    public function notify(string $title, string $message, string $type = 'STATUS_CHANGE', array $excludeUserIds = [], ?int $incidentId = null): void
    {
        $adminUserIds = $this->adminUserIds($excludeUserIds);
        if ($adminUserIds === []) {
            return;
        }

        $existingUserIds = Notification::query()
            ->whereIn('user_id', $adminUserIds)
            ->where('title', $title)
            ->where('message', $message)
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $missingUserIds = array_values(array_diff($adminUserIds, $existingUserIds));
        if ($missingUserIds === []) {
            return;
        }

        foreach ($missingUserIds as $userId) {
            Notification::create([
                'user_id' => $userId,
                'incident_id' => $incidentId,
                'title' => $title,
                'message' => $message,
                'type' => $type,
                'is_read' => false,
                'read_at' => null,
            ]);
        }
    }

    /**
     * @param  array<int, int>  $excludeUserIds
     * @return array<int, int>
     */
    private function adminUserIds(array $excludeUserIds = []): array
    {
        return User::query()
            ->where('is_active', true)
            ->whereNotIn('id', $excludeUserIds)
            ->whereHas('roles', fn ($query) => $query->where('code', 'ADMIN')->where('is_active', true))
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }
}
