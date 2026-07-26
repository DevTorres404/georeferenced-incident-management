<?php

declare(strict_types=1);

namespace App\Catalogs\Infrastructure\Notifications;

use App\Catalogs\Application\DTOs\CategoryRequestData;
use App\Catalogs\Application\Ports\CategoryRequestNotificationPort;
use App\Shared\Infrastructure\Notifications\AdminNotifier;
use App\Shared\Infrastructure\Notifications\UserNotifier;
use Closure;
use Throwable;

final class OperationalCategoryRequestNotifier implements CategoryRequestNotificationPort
{
    public function __construct(
        private AdminNotifier $adminNotifier,
        private UserNotifier $userNotifier,
    ) {}

    public function notifyRequested(CategoryRequestData $request): void
    {
        $this->safely(fn () => $this->adminNotifier->notify(
            title: 'Nueva solicitud de categoría y subtipo',
            message: "{$request->requestedByName} solicitó {$request->suggestedCategoryName} / {$request->suggestedSubcategoryName} para {$request->incidentCode}.",
            type: 'CATEGORY_REQUEST',
            incidentId: $request->incidentId,
        ));
    }

    public function notifyApproved(CategoryRequestData $request): void
    {
        $this->safely(fn () => $this->userNotifier->notify(
            userId: $request->requestedBy,
            title: 'Solicitud de clasificación aprobada',
            message: "Se creó {$request->suggestedCategoryName} / {$request->suggestedSubcategoryName} y se clasificó la incidencia {$request->incidentCode}.",
            type: 'STATUS_CHANGE',
            incidentId: $request->incidentId,
        ));
    }

    public function notifyRejected(CategoryRequestData $request, string $comment): void
    {
        $this->safely(fn () => $this->userNotifier->notify(
            userId: $request->requestedBy,
            title: 'Solicitud de clasificación rechazada',
            message: "La solicitud para {$request->incidentCode} fue rechazada: {$comment}",
            type: 'STATUS_CHANGE',
            incidentId: $request->incidentId,
        ));
    }

    private function safely(Closure $notification): void
    {
        try {
            $notification();
        } catch (Throwable $exception) {
            report($exception);
        }
    }
}
