<?php

declare(strict_types=1);

namespace App\Catalogs\Domain\Repositories;

use App\Catalogs\Application\DTOs\CategoryRequestData;
use App\Catalogs\Application\DTOs\StoreCategoryRequestInputData;

interface CategoryRequestRepositoryInterface
{
    /**
     * @return array<int, CategoryRequestData>
     */
    public function getPendingRequests(): array;

    public function store(StoreCategoryRequestInputData $data, int $userId): CategoryRequestData;

    public function find(int $id): ?CategoryRequestData;

    public function findForUpdate(int $id): ?CategoryRequestData;

    public function hasPendingForIncident(int $incidentId): bool;

    public function approve(
        int $id,
        int $adminId,
        int $categoryId,
        int $subcategoryId,
        ?string $comment
    ): void;

    public function reject(int $id, int $adminId, string $comment): void;
}
