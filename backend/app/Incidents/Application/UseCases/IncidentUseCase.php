<?php

namespace App\Incidents\Application\UseCases;

use App\Incidents\Application\DTOs\AddCommentInputData;
use App\Incidents\Application\DTOs\AssignmentData;
use App\Incidents\Application\DTOs\AttachmentData;
use App\Incidents\Application\DTOs\IncidentDetailData;
use App\Incidents\Application\DTOs\NotificationFiltersData;
use App\Incidents\Application\DTOs\ChangeStateInputData;
use App\Incidents\Application\DTOs\CommentData;
use App\Incidents\Application\DTOs\IncidentFiltersData;
use App\Incidents\Application\DTOs\IncidentMapFiltersData;
use App\Incidents\Application\DTOs\NotificationData;
use App\Incidents\Application\DTOs\StoreIncidentInputData;
use App\Incidents\Application\DTOs\UpdateIncidentInputData;
use App\Incidents\Domain\Entities\Incident;
use App\Incidents\Domain\Exceptions\IncidentException;
use App\Incidents\Domain\Repositories\IncidentRepositoryInterface;
use App\Shared\Application\DTOs\UploadedFileData;
use App\Shared\Application\Ports\FileStoragePort;
use App\Shared\Application\Results\PaginatedResult;

final class IncidentUseCase
{
    public function __construct(
        private IncidentRepositoryInterface $incidentRepository,
        private FileStoragePort $fileStoragePort
    )
    {
    }

    public function paginate(IncidentFiltersData $filters, int $userId, bool $canManage): PaginatedResult
    {
        return $this->incidentRepository->paginate($filters, $userId, $canManage);
    }

    /**
     * @return array<int, \App\Incidents\Application\DTOs\IncidentMapPointData>
     */
    public function mapPoints(IncidentMapFiltersData $filters, int $userId, bool $canManage): array
    {
        return $this->incidentRepository->mapPoints($filters, $userId, $canManage);
    }

    public function store(int $userId, StoreIncidentInputData $data): Incident
    {
        return $this->incidentRepository->store($data, $userId);
    }

    public function detail(int $incidentId): IncidentDetailData
    {
        return $this->incidentRepository->loadDetail($incidentId);
    }

    public function update(int $incidentId, UpdateIncidentInputData $data): Incident
    {
        $incident = $this->incidentRepository->load($incidentId, false);
        if (! $incident->canBeEdited()) {
            throw IncidentException::editNotAllowed();
        }

        return $this->incidentRepository->update($incidentId, $data);
    }

    public function delete(int $incidentId): void
    {
        $this->incidentRepository->delete($incidentId);
    }

    public function addComment(int $incidentId, int $userId, AddCommentInputData $data): CommentData
    {
        return $this->incidentRepository->addComment($incidentId, $userId, $data);
    }

    public function attachFile(int $incidentId, int $userId, UploadedFileData $fileData): AttachmentData
    {
        $storedFile = $this->fileStoragePort->storeIncidentFile($incidentId, $fileData);

        return $this->incidentRepository->attachFile($incidentId, $userId, $storedFile);
    }

    public function assign(int $incidentId, int $userId, int $assigneeUserId): AssignmentData
    {
        return $this->incidentRepository->assign($incidentId, $userId, $assigneeUserId);
    }

    public function changeState(int $incidentId, int $userId, array $roleCodes, ChangeStateInputData $data): Incident
    {
        $incident = $this->incidentRepository->load($incidentId, false);
        $transition = $this->incidentRepository->findTransition($incident->stateId, $data->stateId);

        if (! $transition) {
            throw IncidentException::transitionNotAllowed();
        }

        if (! $transition->isAllowedForRoles($roleCodes)) {
            throw IncidentException::transitionForbidden();
        }

        if ($transition->requiresComment && empty($data->comment)) {
            throw IncidentException::transitionRequiresComment();
        }

        return $this->incidentRepository->changeState($incidentId, $userId, $data);
    }

    public function notifications(int $userId, NotificationFiltersData $filters): PaginatedResult
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
