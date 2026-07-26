<?php

declare(strict_types=1);

namespace App\Catalogs\Infrastructure\Persistence\Repositories;

use App\Catalogs\Application\DTOs\CategoryRequestData;
use App\Catalogs\Application\DTOs\StoreCategoryRequestInputData;
use App\Catalogs\Domain\Repositories\CategoryRequestRepositoryInterface;
use App\Catalogs\Infrastructure\Persistence\Models\CategoryRequest;

class EloquentCategoryRequestRepository implements CategoryRequestRepositoryInterface
{
    public function getPendingRequests(): array
    {
        $models = CategoryRequest::with(['requestedBy', 'incident'])
            ->where('status', 'pending')
            ->orderBy('created_at', 'desc')
            ->get();

        return $models->map(fn (CategoryRequest $model) => $this->mapToData($model))->all();
    }

    public function store(StoreCategoryRequestInputData $data, int $userId): CategoryRequestData
    {
        $model = CategoryRequest::create([
            'incident_id' => $data->incidentId,
            'requested_by' => $userId,
            'suggested_name' => $data->suggestedCategoryName,
            'suggested_category_description' => $data->suggestedCategoryDescription,
            'suggested_subcategory_name' => $data->suggestedSubcategoryName,
            'suggested_icon' => $data->suggestedIcon,
            'reason' => $data->reason,
            'status' => 'pending',
        ]);

        $model->load(['requestedBy', 'incident']);

        return $this->mapToData($model);
    }

    public function find(int $id): ?CategoryRequestData
    {
        $model = CategoryRequest::with(['requestedBy', 'incident'])->find($id);

        if (! $model) {
            return null;
        }

        return $this->mapToData($model);
    }

    public function findForUpdate(int $id): ?CategoryRequestData
    {
        $model = CategoryRequest::query()
            ->with(['requestedBy', 'incident'])
            ->lockForUpdate()
            ->find($id);

        return $model ? $this->mapToData($model) : null;
    }

    public function hasPendingForIncident(int $incidentId): bool
    {
        return CategoryRequest::query()
            ->where('incident_id', $incidentId)
            ->where('status', 'pending')
            ->exists();
    }

    public function approve(
        int $id,
        int $adminId,
        int $categoryId,
        int $subcategoryId,
        ?string $comment
    ): void {
        CategoryRequest::where('id', $id)->update([
            'status' => 'approved',
            'resolved_by' => $adminId,
            'created_category_id' => $categoryId,
            'created_subcategory_id' => $subcategoryId,
            'admin_comment' => $comment,
            'resolved_at' => now(),
        ]);
    }

    public function reject(int $id, int $adminId, string $comment): void
    {
        CategoryRequest::where('id', $id)->update([
            'status' => 'rejected',
            'resolved_by' => $adminId,
            'admin_comment' => $comment,
            'resolved_at' => now(),
        ]);
    }

    private function mapToData(CategoryRequest $model): CategoryRequestData
    {
        return new CategoryRequestData(
            id: (int) $model->id,
            incidentId: (int) $model->incident_id,
            requestedBy: (int) $model->requested_by,
            requestedByName: $model->requestedBy?->nombre_completo ?? 'Usuario Desconocido',
            incidentCode: $model->incident?->code ?? "INC-{$model->incident_id}",
            suggestedCategoryName: $model->suggested_name,
            suggestedCategoryDescription: $model->suggested_category_description,
            suggestedSubcategoryName: $model->suggested_subcategory_name ?? 'Sin subtipo especificado',
            suggestedIcon: $model->suggested_icon,
            reason: $model->reason,
            status: $model->status,
            resolvedBy: $model->resolved_by !== null ? (int) $model->resolved_by : null,
            createdCategoryId: $model->created_category_id !== null ? (int) $model->created_category_id : null,
            createdSubcategoryId: $model->created_subcategory_id !== null ? (int) $model->created_subcategory_id : null,
            adminComment: $model->admin_comment,
            resolvedAt: $model->resolved_at?->toIso8601String(),
            createdAt: $model->created_at->toIso8601String()
        );
    }
}
