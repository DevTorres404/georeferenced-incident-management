<?php

namespace App\Incidents\Application\UseCases;

use App\Incidents\Application\DTOs\AddCommentInputData;
use App\Incidents\Application\DTOs\AssignIncidentOperatorsInputData;
use App\Incidents\Application\DTOs\AssignmentOperatorOptionData;
use App\Incidents\Application\DTOs\AttachmentData;
use App\Incidents\Application\DTOs\ChangeStateInputData;
use App\Incidents\Application\DTOs\CommentData;
use App\Incidents\Application\DTOs\IncidentAssignmentBatchData;
use App\Incidents\Application\DTOs\IncidentDetailData;
use App\Incidents\Application\DTOs\IncidentFiltersData;
use App\Incidents\Application\DTOs\IncidentListResultData;
use App\Incidents\Application\DTOs\IncidentMapFiltersData;
use App\Incidents\Application\DTOs\IncidentMapPointData;
use App\Incidents\Application\DTOs\NotificationData;
use App\Incidents\Application\DTOs\NotificationFiltersData;
use App\Incidents\Application\DTOs\RequestStateChangeInputData;
use App\Incidents\Application\DTOs\StateChangeRequestData;
use App\Incidents\Application\DTOs\StoreIncidentInputData;
use App\Incidents\Application\DTOs\UpdateIncidentInputData;
use App\Incidents\Application\Ports\IncidentStateChangeNotifierPort;
use App\Incidents\Domain\Entities\Incident;
use App\Incidents\Domain\Exceptions\IncidentException;
use App\Incidents\Domain\Repositories\IncidentRepositoryInterface;
use App\Incidents\Domain\States\IncidentStateType;
use App\Shared\Application\DTOs\UploadedFileData;
use App\Shared\Application\Ports\FileStoragePort;
use App\Shared\Application\Ports\TransactionManagerPort;
use App\Shared\Application\Results\PaginatedResult;

final class IncidentUseCase
{
    public function dataTable(IncidentFiltersData $filters, int $userId, bool $canManage, int $start, int $length): IncidentListResultData
    {
        return $this->incidentRepository->dataTable($filters, $userId, $canManage, $start, $length);
    }

    public function countByState(IncidentFiltersData $filters, int $userId, bool $canManage): array
    {
        return $this->incidentRepository->countByState($filters, $userId, $canManage);
    }

    public function __construct(
        private IncidentRepositoryInterface $incidentRepository,
        private FileStoragePort $fileStoragePort,
        private TransactionManagerPort $transactionManager,
        private IncidentStateChangeNotifierPort $stateChangeNotifier,
    ) {}

    public function paginate(IncidentFiltersData $filters, int $userId, bool $canManage): PaginatedResult
    {
        return $this->incidentRepository->paginate($filters, $userId, $canManage);
    }

    /**
     * @return array<int, IncidentMapPointData>
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

    public function update(int $incidentId, UpdateIncidentInputData $data): IncidentDetailData
    {
        return $this->transactionManager->run(function () use ($incidentId, $data): IncidentDetailData {
            $incident = $this->incidentRepository->load($incidentId, false);
            if (! $incident->canBeEdited()) {
                throw IncidentException::editNotAllowed();
            }

            $this->incidentRepository->update($incidentId, $data);

            return $this->incidentRepository->loadDetail($incidentId);
        });
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

    public function assign(int $incidentId, int $userId, AssignIncidentOperatorsInputData $data): IncidentAssignmentBatchData
    {
        return $this->incidentRepository->assign($incidentId, $userId, $data);
    }

    /**
     * @return array<int, AssignmentOperatorOptionData>
     */
    public function assignmentOperatorOptions(int $userId): array
    {
        return $this->incidentRepository->assignmentOperatorOptions($userId);
    }

    public function changeState(
        int $incidentId,
        int $userId,
        array $roleCodes,
        bool $canReopen,
        ChangeStateInputData $data
    ): Incident {
        return $this->transactionManager->run(function () use (
            $incidentId,
            $userId,
            $roleCodes,
            $canReopen,
            $data
        ): Incident {
            $incident = $this->incidentRepository->loadForUpdate($incidentId);
            $transition = $this->incidentRepository->findTransition($incident->stateId, $data->stateId);

            if (! $transition) {
                throw IncidentException::transitionNotAllowed();
            }

            if (! $transition->isAllowedForRoles($roleCodes)) {
                throw IncidentException::transitionForbidden();
            }

            $targetState = $this->incidentRepository->stateById($data->stateId);
            if ($targetState?->is(IncidentStateType::Reopened) && ! $canReopen) {
                throw IncidentException::transitionForbidden();
            }

            if ($transition->requiresComment && $this->isBlankComment($data->comment)) {
                throw IncidentException::transitionRequiresComment();
            }

            return $this->incidentRepository->changeState($incidentId, $userId, $data);
        });
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

    public function requestStateChange(int $incidentId, int $userId, array $roleCodes, RequestStateChangeInputData $data): StateChangeRequestData
    {
        if (! in_array('OPERADOR', $roleCodes, true)) {
            throw IncidentException::operatorCannotChangeState();
        }

        return $this->transactionManager->run(function () use ($incidentId, $userId, $data): StateChangeRequestData {
            $incident = $this->incidentRepository->loadForUpdate($incidentId);
            if (! $incident->canRequestResolution()) {
                throw IncidentException::stateChangeRequestInvalidSourceState();
            }

            $requestedState = $this->incidentRepository->stateById($data->stateId);
            if (! $requestedState?->is(IncidentStateType::Resolved)) {
                throw IncidentException::stateChangeRequestInvalidTargetState();
            }

            if (! $this->incidentRepository->hasActiveAssignment($incidentId, $userId)) {
                throw IncidentException::stateChangeRequestRequiresActiveAssignment();
            }

            if ($this->incidentRepository->findPendingStateChangeRequest($incidentId) !== null) {
                throw IncidentException::stateChangeRequestPending();
            }

            $result = $this->incidentRepository->createStateChangeRequest($incidentId, $userId, $data);

            $this->stateChangeNotifier->notifyStateChangeRequested(
                $incidentId,
                $userId,
                $result->requestedStateName,
                $data->reason
            );

            return $result;
        });
    }

    public function approveStateChange(int $incidentId, int $requestId, int $userId, array $roleCodes, ?string $comment): void
    {
        if (! in_array('SUPERVISOR', $roleCodes, true) && ! in_array('ADMIN', $roleCodes, true)) {
            throw IncidentException::stateChangeRequestForbidden();
        }

        $this->transactionManager->run(function () use ($incidentId, $requestId, $userId, $comment): void {
            $request = $this->incidentRepository->findStateChangeRequestById($requestId);

            if ($request === null || $request->incidentId !== $incidentId) {
                throw IncidentException::stateChangeRequestNotFound();
            }

            $this->incidentRepository->approveStateChangeRequest($incidentId, $requestId, $userId, $comment);

            $this->stateChangeNotifier->notifyStateChangeApproved(
                $request->incidentId,
                $request->requestedByUserId
            );
        });
    }

    public function rejectStateChange(int $incidentId, int $requestId, int $userId, array $roleCodes, ?string $comment): void
    {
        if (! in_array('SUPERVISOR', $roleCodes, true) && ! in_array('ADMIN', $roleCodes, true)) {
            throw IncidentException::stateChangeRequestForbidden();
        }

        $this->transactionManager->run(function () use ($incidentId, $requestId, $userId, $comment): void {
            $request = $this->incidentRepository->findStateChangeRequestById($requestId);

            if ($request === null || $request->incidentId !== $incidentId) {
                throw IncidentException::stateChangeRequestNotFound();
            }

            $this->incidentRepository->rejectStateChangeRequest($requestId, $userId, $comment);

            $this->stateChangeNotifier->notifyStateChangeRejected(
                $request->incidentId,
                $request->requestedByUserId,
                $comment ?? 'Solicitud rechazada.'
            );
        });
    }

    /**
     * @return array<int, StateChangeRequestData>
     */
    public function getPendingStateChangeRequests(int $userId, array $roleCodes): array
    {
        if (! in_array('SUPERVISOR', $roleCodes, true) && ! in_array('ADMIN', $roleCodes, true)) {
            return [];
        }

        return $this->incidentRepository->pendingStateChangeRequestsForUser($userId);
    }

    private function isBlankComment(?string $comment): bool
    {
        if ($comment === null) {
            return true;
        }

        return preg_match('/^[\s\p{Z}\p{Cf}]*$/u', $comment) !== 0;
    }
}
