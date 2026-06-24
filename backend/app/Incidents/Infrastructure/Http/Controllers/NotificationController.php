<?php

namespace App\Incidents\Infrastructure\Http\Controllers;

use App\Incidents\Application\DTOs\NotificationFiltersData;
use App\Incidents\Application\UseCases\NotificationUseCase;
use App\Incidents\Infrastructure\Persistence\Models\Notification;
use App\Shared\Infrastructure\Http\Controllers\ApiController;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends ApiController
{
    public function __construct(private NotificationUseCase $notificationUseCase)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'leida' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        return response()->json($this->notificationUseCase->listForUser(
            $request->user()->id,
            new NotificationFiltersData(
                isRead: $filters['leida'] ?? null,
                perPage: $filters['per_page'] ?? 15
            )
        ));
    }

    public function unreadCount(Request $request): JsonResponse
    {
        return response()->json([
            'count' => $this->notificationUseCase->unreadCount($request->user()->id),
        ]);
    }

    public function markAsRead(Request $request, Notification $notificacion): JsonResponse
    {
        if ($notificacion->user_id !== $request->user()->id) {
            return $this->forbid();
        }

        $notification = $this->notificationUseCase->markAsRead($notificacion->id, $request->user()->id);

        return response()->json([
            'message' => 'Notificación marcada como leída.',
            'data' => $notification,
        ]);
    }

    public function markAllAsRead(Request $request): JsonResponse
    {
        $this->notificationUseCase->markAllAsRead($request->user()->id);

        return response()->json([
            'message' => 'Notificaciones marcadas como leídas.',
        ]);
    }
}
