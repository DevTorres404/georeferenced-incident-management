<?php

declare(strict_types=1);

namespace App\Catalogs\Application\UseCases;

use App\Catalogs\Application\DTOs\ApproveCategoryRequestInputData;
use App\Catalogs\Application\DTOs\CategoryRequestData;
use App\Catalogs\Application\DTOs\StoreCategoryRequestInputData;
use App\Catalogs\Application\Ports\CatalogProvisioningPort;
use App\Catalogs\Application\Ports\CategoryRequestNotificationPort;
use App\Catalogs\Domain\Exceptions\CategoryRequestException;
use App\Catalogs\Domain\Repositories\CategoryRequestRepositoryInterface;
use App\Incidents\Application\DTOs\ClassifyIncidentInputData;
use App\Incidents\Domain\Repositories\IncidentRepositoryInterface;
use App\Shared\Application\Ports\TransactionManagerPort;

final class CategoryRequestUseCase
{
    public function __construct(
        private CategoryRequestRepositoryInterface $categoryRequestRepository,
        private CatalogProvisioningPort $catalogProvisioning,
        private CategoryRequestNotificationPort $notifier,
        private IncidentRepositoryInterface $incidentRepository,
        private TransactionManagerPort $transactionManager,
    ) {}

    /**
     * @return array<int, CategoryRequestData>
     */
    public function getPendingRequests(): array
    {
        return $this->categoryRequestRepository->getPendingRequests();
    }

    public function requestCategoryCreation(int $userId, StoreCategoryRequestInputData $data): CategoryRequestData
    {
        $request = $this->transactionManager->run(function () use ($userId, $data): CategoryRequestData {
            $incident = $this->incidentRepository->loadForUpdate($data->incidentId);
            if (! $incident->requiresClassification()) {
                throw CategoryRequestException::incidentDoesNotRequireClassification();
            }

            if ($this->categoryRequestRepository->hasPendingForIncident($data->incidentId)) {
                throw CategoryRequestException::pendingRequestAlreadyExists();
            }

            return $this->categoryRequestRepository->store($data, $userId);
        });

        $this->notifier->notifyRequested($request);

        return $request;
    }

    public function approveRequest(
        int $requestId,
        int $adminId,
        ApproveCategoryRequestInputData $data
    ): CategoryRequestData {
        [$request, $createdCatalog] = $this->transactionManager->run(function () use (
            $requestId,
            $adminId,
            $data
        ): array {
            $request = $this->pendingRequestForUpdate($requestId);
            $createdCatalog = $this->catalogProvisioning->createCategoryWithSubcategory($data);

            $this->incidentRepository->classify(
                $request->incidentId,
                $adminId,
                new ClassifyIncidentInputData(
                    categoryId: $createdCatalog->categoryId,
                    subcategoryId: $createdCatalog->subcategoryId,
                    reason: "Clasificación aprobada desde la solicitud #{$request->id}: {$request->reason}",
                )
            );

            $this->categoryRequestRepository->approve(
                id: $requestId,
                adminId: $adminId,
                categoryId: $createdCatalog->categoryId,
                subcategoryId: $createdCatalog->subcategoryId,
                comment: $data->adminComment,
            );

            return [$request, $createdCatalog];
        });

        $approvedRequest = new CategoryRequestData(
            id: $request->id,
            incidentId: $request->incidentId,
            requestedBy: $request->requestedBy,
            requestedByName: $request->requestedByName,
            incidentCode: $request->incidentCode,
            suggestedCategoryName: $data->categoryName,
            suggestedCategoryDescription: $data->categoryDescription,
            suggestedSubcategoryName: $data->subcategoryName,
            suggestedIcon: $data->icon,
            reason: $request->reason,
            status: 'approved',
            resolvedBy: $adminId,
            createdCategoryId: $createdCatalog->categoryId,
            createdSubcategoryId: $createdCatalog->subcategoryId,
            adminComment: $data->adminComment,
            resolvedAt: null,
            createdAt: $request->createdAt,
        );
        $this->notifier->notifyApproved($approvedRequest);

        return $approvedRequest;
    }

    public function rejectRequest(int $requestId, int $adminId, string $comment): void
    {
        $request = $this->transactionManager->run(function () use (
            $requestId,
            $adminId,
            $comment
        ): CategoryRequestData {
            $request = $this->pendingRequestForUpdate($requestId);
            $this->categoryRequestRepository->reject($requestId, $adminId, $comment);

            return $request;
        });

        $this->notifier->notifyRejected($request, $comment);
    }

    private function pendingRequestForUpdate(int $requestId): CategoryRequestData
    {
        $request = $this->categoryRequestRepository->findForUpdate($requestId);
        if ($request === null) {
            throw CategoryRequestException::notFound();
        }

        if ($request->status !== 'pending') {
            throw CategoryRequestException::alreadyReviewed();
        }

        return $request;
    }
}
