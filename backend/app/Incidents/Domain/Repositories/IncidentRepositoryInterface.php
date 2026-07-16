<?php

namespace App\Incidents\Domain\Repositories;

use App\Incidents\Application\DTOs\AddCommentInputData;
use App\Incidents\Application\DTOs\AssignIncidentOperatorsInputData;
use App\Incidents\Application\DTOs\AssignmentData;
use App\Incidents\Application\DTOs\AssignmentOperatorOptionData;
use App\Incidents\Application\DTOs\AttachmentData;
use App\Incidents\Application\DTOs\ChangeStateInputData;
use App\Incidents\Application\DTOs\CommentData;
use App\Incidents\Application\DTOs\IncidentAssignmentBatchData;
use App\Incidents\Application\DTOs\IncidentDetailData;
use App\Incidents\Application\DTOs\IncidentFiltersData;
use App\Incidents\Application\DTOs\IncidentListResultData;
use App\Incidents\Application\DTOs\IncidentMapFiltersData;
use App\Incidents\Application\DTOs\NotificationData;
use App\Incidents\Application\DTOs\NotificationFiltersData;
use App\Incidents\Application\DTOs\RequestStateChangeInputData;
use App\Incidents\Application\DTOs\StateChangeRequestData;
use App\Incidents\Application\DTOs\StoreIncidentInputData;
use App\Incidents\Application\DTOs\UpdateIncidentInputData;
use App\Incidents\Domain\Entities\Incident;
use App\Incidents\Domain\Entities\IncidentTransition;
use App\Shared\Application\DTOs\StoredFileData;
use App\Shared\Application\Results\PaginatedResult;

interface IncidentRepositoryInterface
{
    public function paginate(IncidentFiltersData $filters, int $userId, bool $canManage): PaginatedResult;

    public function dataTable(IncidentFiltersData $filters, int $userId, bool $canManage, int $start, int $length): IncidentListResultData;

    /**
     * @return array{pendiente: int, en_proceso: int, resuelta: int}
     */
    public function countByState(IncidentFiltersData $filters, int $userId, bool $canManage): array;

    /**
     * @return array<int, \App\Incidents\Application\DTOs\IncidentMapPointData>
     */
    public function mapPoints(IncidentMapFiltersData $filters, int $userId, bool $canManage): array;

    public function store(StoreIncidentInputData $data, int $userId): Incident;

    public function load(int $incidentId, bool $withHistory = true): Incident;

    public function loadForUpdate(int $incidentId): Incident;

    public function loadDetail(int $incidentId): IncidentDetailData;

    public function findTransition(int $fromStateId, int $toStateId): ?IncidentTransition;

    public function update(int $incidentId, UpdateIncidentInputData $data): Incident;

    public function delete(int $incidentId): void;

    public function addComment(int $incidentId, int $userId, AddCommentInputData $data): CommentData;

    public function attachFile(int $incidentId, int $userId, StoredFileData $storedFileData): AttachmentData;

    public function assign(int $incidentId, int $userId, AssignIncidentOperatorsInputData $data): IncidentAssignmentBatchData;

    /**
     * @return array<int, AssignmentOperatorOptionData>
     */
    public function assignmentOperatorOptions(int $userId): array;

    public function changeState(int $incidentId, int $userId, ChangeStateInputData $data): Incident;

    public function notifications(int $userId, NotificationFiltersData $filters): PaginatedResult;

    public function unreadCount(int $userId): int;

    public function markAsRead(int $notificationId, int $userId): NotificationData;

    public function markAllAsRead(int $userId): void;

    public function findPendingStateChangeRequest(int $incidentId): ?StateChangeRequestData;

    public function stateNameById(int $stateId): ?string;

    public function hasActiveAssignment(int $incidentId, int $userId): bool;

    public function createStateChangeRequest(int $incidentId, int $userId, RequestStateChangeInputData $data): StateChangeRequestData;

    public function approveStateChangeRequest(int $incidentId, int $requestId, int $reviewerUserId, ?string $comment): void;

    public function rejectStateChangeRequest(int $requestId, int $reviewerUserId, ?string $comment): void;

    public function findStateChangeRequestById(int $requestId): ?StateChangeRequestData;

    /**
     * @return array<int, StateChangeRequestData>
     */
    public function pendingStateChangeRequestsForUser(int $userId): array;
}
