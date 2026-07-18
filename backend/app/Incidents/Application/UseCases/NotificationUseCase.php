<?php

namespace App\Incidents\Application\UseCases;

use App\Incidents\Application\DTOs\NotificationData;
use App\Incidents\Application\DTOs\NotificationFiltersData;
use App\Incidents\Domain\Repositories\IncidentRepositoryInterface;
use App\Shared\Application\Results\PaginatedResult;

final class NotificationUseCase
{
    public function __construct(private IncidentRepositoryInterface $incidentRepository) {}

    public function listForUser(int $userId, NotificationFiltersData $filters): PaginatedResult
    {
        return $this->incidentRepository->notifications($userId, $filters);
    }

    public function unreadCount(int $userId): int
    {
        return $this->incidentRepository->unreadCount($userId);
    }

    public function markAsRead(int $notificationId, int $userId): NotificationData
    {
        return $this->incidentRepository->markAsRead($notificationId, $userId);
    }

    public function markAllAsRead(int $userId): void
    {
        $this->incidentRepository->markAllAsRead($userId);
    }
}
