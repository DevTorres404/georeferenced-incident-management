<?php

declare(strict_types=1);

namespace App\Catalogs\Infrastructure\Http\Controllers;

use App\Catalogs\Application\DTOs\ApproveCategoryRequestInputData;
use App\Catalogs\Application\DTOs\StoreCategoryRequestInputData;
use App\Catalogs\Application\UseCases\CategoryRequestUseCase;
use App\Catalogs\Domain\Exceptions\CategoryRequestException;
use App\Catalogs\Infrastructure\Http\Requests\ApproveCategoryRequestRequest;
use App\Catalogs\Infrastructure\Http\Requests\ListCategoryRequestsRequest;
use App\Catalogs\Infrastructure\Http\Requests\RejectCategoryRequestRequest;
use App\Catalogs\Infrastructure\Http\Requests\StoreCategoryRequestRequest;
use App\Incidents\Domain\Exceptions\IncidentException;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;

final class CategoryRequestController extends Controller
{
    public function __construct(
        private CategoryRequestUseCase $useCase
    ) {}

    public function index(ListCategoryRequestsRequest $request): JsonResponse
    {
        return response()->json(['data' => $this->useCase->getPendingRequests()]);
    }

    public function store(
        StoreCategoryRequestRequest $request,
        Incident $incident
    ): JsonResponse {
        $validated = $request->validated();

        try {
            $result = $this->useCase->requestCategoryCreation(
                (int) $request->user()->id,
                new StoreCategoryRequestInputData(
                    incidentId: (int) $incident->id,
                    suggestedCategoryName: $validated['suggested_category_name'],
                    suggestedCategoryDescription: $validated['suggested_category_description'],
                    suggestedSubcategoryName: $validated['suggested_subcategory_name'],
                    reason: $validated['reason'],
                    suggestedIcon: $validated['suggested_icon'] ?? null,
                )
            );
        } catch (CategoryRequestException $exception) {
            return $this->domainError($exception);
        }

        return response()->json([
            'message' => 'Solicitud enviada al administrador.',
            'data' => $result,
        ], 201);
    }

    public function approve(
        ApproveCategoryRequestRequest $request,
        int $id
    ): JsonResponse {
        $validated = $request->validated();

        try {
            $result = $this->useCase->approveRequest(
                $id,
                (int) $request->user()->id,
                new ApproveCategoryRequestInputData(
                    categoryName: $validated['category_name'],
                    subcategoryName: $validated['subcategory_name'],
                    categoryDescription: $validated['category_description'] ?? null,
                    subcategoryDescription: $validated['subcategory_description'] ?? null,
                    icon: $validated['icon'],
                    color: $validated['color'],
                    adminComment: $validated['admin_comment'] ?? null,
                )
            );
        } catch (CategoryRequestException|IncidentException $exception) {
            return $this->domainError($exception);
        }

        return response()->json([
            'message' => 'Categoría y subtipo creados; la incidencia fue clasificada.',
            'data' => $result,
        ]);
    }

    public function reject(
        RejectCategoryRequestRequest $request,
        int $id
    ): JsonResponse {
        try {
            $this->useCase->rejectRequest(
                $id,
                (int) $request->user()->id,
                $request->validated('comment'),
            );
        } catch (CategoryRequestException $exception) {
            return $this->domainError($exception);
        }

        return response()->json([
            'message' => 'Solicitud rechazada correctamente.',
        ]);
    }

    private function domainError(\Exception $exception): JsonResponse
    {
        return response()->json(
            ['message' => $exception->getMessage()],
            $exception->getCode(),
        );
    }
}
