<?php

namespace App\Incidents\Infrastructure\Persistence\Repositories;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Application\DTOs\AddCommentInputData;
use App\Incidents\Application\DTOs\AssignmentData;
use App\Incidents\Application\DTOs\AttachmentData;
use App\Incidents\Application\DTOs\ChangeStateInputData;
use App\Incidents\Application\DTOs\CommentData;
use App\Incidents\Application\DTOs\IncidentDetailData;
use App\Incidents\Application\DTOs\IncidentFiltersData;
use App\Incidents\Application\DTOs\IncidentMapFiltersData;
use App\Incidents\Application\DTOs\IncidentMapPointData;
use App\Incidents\Application\DTOs\NotificationData;
use App\Incidents\Application\DTOs\NotificationFiltersData;
use App\Incidents\Application\DTOs\StoreIncidentInputData;
use App\Incidents\Application\DTOs\UpdateIncidentInputData;
use App\Incidents\Domain\Exceptions\IncidentException;
use App\Incidents\Domain\Repositories\IncidentRepositoryInterface;
use App\Incidents\Infrastructure\Persistence\Mappers\AssignmentMapper;
use App\Incidents\Infrastructure\Persistence\Mappers\AttachmentMapper;
use App\Incidents\Infrastructure\Persistence\Mappers\CommentMapper;
use App\Incidents\Infrastructure\Persistence\Mappers\IncidentDetailMapper;
use App\Incidents\Infrastructure\Persistence\Mappers\IncidentMapper;
use App\Incidents\Infrastructure\Persistence\Mappers\IncidentSummaryMapper;
use App\Incidents\Infrastructure\Persistence\Mappers\IncidentTransitionMapper;
use App\Incidents\Infrastructure\Persistence\Mappers\NotificationMapper;
use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAttachment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAssignment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentComment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentState;
use App\Incidents\Infrastructure\Persistence\Models\Notification;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\StateTransition;
use App\Shared\Application\DTOs\StoredFileData;
use App\Shared\Application\Results\PaginatedResult;
use App\Shared\Infrastructure\Notifications\AdminNotifier;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class EloquentIncidentRepository implements IncidentRepositoryInterface
{
    private const RELATIONS = [
        'category',
        'subcategory',
        'priority',
        'state',
        'territorialUnit.'.TerritorialUnit::PARENT_CHAIN,
        'reporter.roles',
        'currentAssignee.roles',
    ];

    public function __construct(
        private IncidentMapper $incidentMapper,
        private IncidentTransitionMapper $incidentTransitionMapper,
        private IncidentSummaryMapper $incidentSummaryMapper,
        private IncidentDetailMapper $incidentDetailMapper,
        private CommentMapper $commentMapper,
        private AttachmentMapper $attachmentMapper,
        private AssignmentMapper $assignmentMapper,
        private NotificationMapper $notificationMapper
    ) {
    }

    public function paginate(IncidentFiltersData $filters, int $userId, bool $canManage): PaginatedResult
    {
        $query = Incident::query()->with(self::RELATIONS)->latest();

        if (! $canManage) {
            $query->where(function ($q) use ($userId) {
                $q->where('reported_by_id', $userId)
                    ->orWhere('current_assigned_id', $userId);
            });
        }

        if ($filters->stateId !== null) {
            $query->where('state_id', $filters->stateId);
        }
        if ($filters->priorityId !== null) {
            $query->where('priority_id', $filters->priorityId);
        }
        if ($filters->categoryId !== null) {
            $query->where('category_id', $filters->categoryId);
        }
        if ($filters->mine === true) {
            $query->where('reported_by_id', $userId);
        }

        if ($filters->assignedToMe === true) {
            $query->where('current_assigned_id', $userId);
        }

        if ($filters->overdue === true) {
            $query->overdue();
        }

        if (! empty($filters->search)) {
            $search = $filters->search;
            $query->where(function ($q) use ($search) {
                $q->where('code', 'ILIKE', "%{$search}%")
                    ->orWhere('title', 'ILIKE', "%{$search}%")
                    ->orWhere('description', 'ILIKE', "%{$search}%");
            });
        }

        if ($filters->latitude !== null && $filters->longitude !== null && $filters->radiusKm !== null) {
            $query->withinRadius($filters->latitude, $filters->longitude, $filters->radiusKm);
        }

        $result = $query->paginate($filters->perPage ?? 15);

        return new PaginatedResult(
            items: array_map(
                fn (Incident $incident) => $this->incidentSummaryMapper->fromModel($incident),
                $result->items()
            ),
            currentPage: $result->currentPage(),
            perPage: $result->perPage(),
            total: $result->total(),
            lastPage: $result->lastPage()
        );
    }

    public function mapPoints(IncidentMapFiltersData $filters, int $userId, bool $canManage): array
    {
        $query = Incident::query()
            ->with([
                'category',
                'priority',
                'state',
                'territorialUnit.'.TerritorialUnit::PARENT_CHAIN,
            ])
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->latest();

        if (! $canManage) {
            $query->where(function ($q) use ($userId) {
                $q->where('reported_by_id', $userId)
                    ->orWhere('current_assigned_id', $userId);
            });
        }

        if ($filters->stateId !== null) {
            $query->where('state_id', $filters->stateId);
        }

        if ($filters->priorityId !== null) {
            $query->where('priority_id', $filters->priorityId);
        }

        if ($filters->categoryId !== null) {
            $query->where('category_id', $filters->categoryId);
        }

        if ($filters->mine === true) {
            $query->where('reported_by_id', $userId);
        }

        if ($filters->assignedToMe === true) {
            $query->where('current_assigned_id', $userId);
        }

        if (! empty($filters->search)) {
            $search = $filters->search;
            $query->where(function ($q) use ($search) {
                $q->where('code', 'ILIKE', "%{$search}%")
                    ->orWhere('title', 'ILIKE', "%{$search}%")
                    ->orWhere('description', 'ILIKE', "%{$search}%")
                    ->orWhere('address', 'ILIKE', "%{$search}%");
            });
        }

        if ($filters->minLatitude !== null) {
            $query->where('latitude', '>=', $filters->minLatitude);
        }

        if ($filters->maxLatitude !== null) {
            $query->where('latitude', '<=', $filters->maxLatitude);
        }

        if ($filters->minLongitude !== null) {
            $query->where('longitude', '>=', $filters->minLongitude);
        }

        if ($filters->maxLongitude !== null) {
            $query->where('longitude', '<=', $filters->maxLongitude);
        }

        return $query
            ->limit($filters->limit)
            ->get()
            ->map(function (Incident $incident): IncidentMapPointData {
                $summary = $this->incidentSummaryMapper->fromModel($incident);

                return new IncidentMapPointData(
                    id: $summary->id,
                    code: $summary->code,
                    title: $summary->title,
                    address: $summary->address,
                    latitude: (float) $incident->latitude,
                    longitude: (float) $incident->longitude,
                    state: $summary->state,
                    category: $summary->category,
                    priority: $summary->priority,
                    territorialUnit: $summary->territorialUnit,
                    createdAt: $summary->createdAt
                );
            })
            ->all();
    }

    public function store(StoreIncidentInputData $data, int $userId): \App\Incidents\Domain\Entities\Incident
    {
        $initialState = State::active()->initial()->first();

        if (! $initialState) {
            throw IncidentException::transitionNotAllowed();
        }

        return DB::transaction(function () use ($data, $initialState, $userId) {
            $incident = Incident::create([
                'title' => $data->title,
                'description' => $data->description,
                'category_id' => $data->categoryId,
                'priority_id' => $data->priorityId,
                'territorial_unit_id' => $data->territorialUnitId,
                'subcategory_id' => $data->subcategoryId,
                'address' => $data->address,
                'address_reference' => $data->address,
                'latitude' => $data->latitude,
                'longitude' => $data->longitude,
                'resolution_date' => $data->resolutionDate,
                'code' => $this->generarCodigo(),
                'state_id' => $initialState->id,
                'reported_by_id' => $userId,
            ]);

            IncidentState::create([
                'incident_id' => $incident->id,
                'previous_state_id' => null,
                'new_state_id' => $initialState->id,
                'user_id' => $userId,
                'comment' => 'Incidencia creada.',
            ]);

            $this->createNotification(
                userId: $userId,
                title: 'Incidencia registrada',
                message: "Tu incidencia {$incident->code} fue registrada correctamente.",
                type: 'STATUS_CHANGE'
            );

            $this->notifyOperators(
                title: 'Nueva incidencia creada',
                message: 'Nueva incidencia reportada en '.$incident->category()->value('name').'.',
                type: 'STATUS_CHANGE'
            );

            if ($incident->priority_id !== null && (int) $incident->priority()->value('level') === 1) {
                $sector = $incident->territorialUnit?->full_path ?: ($incident->address_reference ?: 'el sector reportado');
                $this->notifySupervisors(
                    title: 'Incidencia crítica creada',
                    message: "Se reportó una incidencia crítica en {$sector}.",
                    type: 'STATUS_CHANGE'
                );
            }

            if ($incident->latitude === null || $incident->longitude === null) {
                app(AdminNotifier::class)->notify(
                    title: 'Error de geolocalización',
                    message: "La incidencia {$incident->code} fue creada sin coordenadas válidas.",
                    type: 'STATUS_CHANGE'
                );
            }

            return $this->incidentMapper->fromModel($incident->load(self::RELATIONS));
        });
    }

    public function load(int $incidentId, bool $withHistory = true): \App\Incidents\Domain\Entities\Incident
    {
        $incident = Incident::findOrFail($incidentId);
        $relations = self::RELATIONS;

        if ($withHistory) {
            $relations = [
                ...$relations,
                'stateHistory.previousState',
                'stateHistory.newState',
                'stateHistory.user',
                'assignments.user',
                'assignments.assignedBy',
                'comments.user',
                'attachments.user',
            ];
        }

        return $this->incidentMapper->fromModel($incident->load($relations));
    }

    public function loadDetail(int $incidentId): IncidentDetailData
    {
        $incident = Incident::with([
            ...self::RELATIONS,
            'stateHistory.previousState',
            'stateHistory.newState',
            'stateHistory.user',
            'assignments.user',
            'assignments.assignedBy',
            'comments.user',
            'attachments.user',
        ])->findOrFail($incidentId);

        return $this->incidentDetailMapper->fromModel($incident);
    }

    public function findTransition(int $fromStateId, int $toStateId): ?\App\Incidents\Domain\Entities\IncidentTransition
    {
        $transition = StateTransition::where('source_state_id', $fromStateId)
            ->where('target_state_id', $toStateId)
            ->where('is_active', true)
            ->first();

        return $this->incidentTransitionMapper->fromModel($transition);
    }

    public function update(int $incidentId, UpdateIncidentInputData $data): \App\Incidents\Domain\Entities\Incident
    {
        $incident = Incident::findOrFail($incidentId);
        $previousPriorityId = $incident->priority_id;
        $updateData = [];
        if ($data->title !== null) $updateData['title'] = $data->title;
        if ($data->description !== null) $updateData['description'] = $data->description;
        if ($data->categoryId !== null) $updateData['category_id'] = $data->categoryId;
        if ($data->priorityId !== null) $updateData['priority_id'] = $data->priorityId;
        if (property_exists($data, 'territorialUnitId')) $updateData['territorial_unit_id'] = $data->territorialUnitId;
        if (property_exists($data, 'subcategoryId')) $updateData['subcategory_id'] = $data->subcategoryId;
        if (property_exists($data, 'address')) {
            $updateData['address'] = $data->address;
            $updateData['address_reference'] = $data->address;
        }
        if (property_exists($data, 'latitude')) $updateData['latitude'] = $data->latitude;
        if (property_exists($data, 'longitude')) $updateData['longitude'] = $data->longitude;
        if (property_exists($data, 'resolutionDate')) $updateData['resolution_date'] = $data->resolutionDate;
        
        if (!empty($updateData)) {
            $incident->update($updateData);
        }

        if ($data->priorityId !== null && (int) $previousPriorityId !== $data->priorityId) {
            $priorityName = Priority::find($data->priorityId)?->name ?? 'actualizada';
            $message = "La prioridad de la incidencia {$incident->code} cambiÃ³ a {$priorityName}.";

            if ($incident->current_assigned_id) {
                $this->createNotification(
                    userId: (int) $incident->current_assigned_id,
                    title: 'Cambio de prioridad',
                    message: $message,
                    type: 'STATUS_CHANGE'
                );
            } else {
                $this->notifyOperators(
                    title: 'Cambio de prioridad',
                    message: $message,
                    type: 'STATUS_CHANGE'
                );
            }

            $this->notifySupervisors(
                title: 'Cambio manual de prioridad',
                message: "Un operador cambió la prioridad de la incidencia {$incident->code} a {$priorityName}.",
                type: 'STATUS_CHANGE'
            );
        }

        return $this->incidentMapper->fromModel($incident->fresh()->load(self::RELATIONS));
    }

    public function delete(int $incidentId): void
    {
        $incident = Incident::findOrFail($incidentId);
        $incidentCode = $incident->code;

        $incident->delete();

        app(AdminNotifier::class)->notify(
            title: 'Acción crítica',
            message: "Un usuario eliminó o cerró forzadamente una incidencia: {$incidentCode}.",
            type: 'STATUS_CHANGE'
        );
    }

    public function addComment(int $incidentId, int $userId, AddCommentInputData $data): CommentData
    {
        $incident = Incident::findOrFail($incidentId);
        $comment = IncidentComment::create([
            'incident_id' => $incidentId,
            'user_id' => $userId,
            'comment' => $data->comment,
            'is_internal' => $data->isInternal,
        ])->load('user');

        if (! $data->isInternal && (int) $incident->reported_by_id !== $userId) {
            $this->createNotification(
                userId: (int) $incident->reported_by_id,
                title: 'Comentario recibido',
                message: "Un operador respondiÃ³ en tu incidencia {$incident->code}.",
                type: 'NEW_COMMENT'
            );
        }

        if ((int) $incident->reported_by_id === $userId && $incident->current_assigned_id) {
            $this->createNotification(
                userId: (int) $incident->current_assigned_id,
                title: 'Comentario recibido',
                message: "El ciudadano respondió en la incidencia {$incident->code}.",
                type: 'NEW_COMMENT'
            );
        }

        return $this->commentMapper->fromModel($comment);
    }

    public function attachFile(int $incidentId, int $userId, StoredFileData $storedFileData): AttachmentData
    {
        $incident = Incident::findOrFail($incidentId);
        $attachment = IncidentAttachment::create([
            'incident_id' => $incidentId,
            'user_id' => $userId,
            'original_name' => $storedFileData->originalName,
            'file_path' => $storedFileData->storagePath,
            'mime_type' => $storedFileData->mimeType,
            'file_size_bytes' => $storedFileData->sizeInBytes,
            'file_hash' => $storedFileData->hash,
        ])->load('user');

        if ((int) $incident->reported_by_id !== $userId) {
            $this->createNotification(
                userId: (int) $incident->reported_by_id,
                title: 'Evidencia agregada',
                message: "Se agregÃ³ una actualizaciÃ³n o evidencia a tu incidencia {$incident->code}.",
                type: 'NEW_COMMENT'
            );
        }

        if ((int) $incident->reported_by_id === $userId && $incident->current_assigned_id) {
            $this->createNotification(
                userId: (int) $incident->current_assigned_id,
                title: 'Evidencia agregada',
                message: "Se adjuntó nueva evidencia a la incidencia {$incident->code}.",
                type: 'NEW_COMMENT'
            );
        }

        return $this->attachmentMapper->fromModel($attachment);
    }

    public function assign(int $incidentId, int $userId, int $assigneeUserId): AssignmentData
    {
        $incident = Incident::findOrFail($incidentId);
        $previousAssigneeId = $incident->current_assigned_id ? (int) $incident->current_assigned_id : null;

        $asignacion = IncidentAssignment::create([
            'incident_id' => $incidentId,
            'user_id' => $assigneeUserId,
            'assigned_by_id' => $userId,
        ]);

        $this->createNotification(
            userId: $assigneeUserId,
            title: 'Incidencia asignada',
            message: "Se te asignÃ³ la incidencia {$incident->code}.",
            type: 'INCIDENT_ASSIGNED'
        );

        if ($previousAssigneeId && $previousAssigneeId !== $assigneeUserId) {
            $this->createNotification(
                userId: $previousAssigneeId,
                title: 'Incidencia reasignada',
                message: "La incidencia {$incident->code} fue reasignada a otro operador.",
                type: 'INCIDENT_ASSIGNED'
            );
        }

        return $this->assignmentMapper->fromModel($asignacion->load(['user', 'assignedBy']));
    }

    public function changeState(int $incidentId, int $userId, ChangeStateInputData $data): \App\Incidents\Domain\Entities\Incident
    {
        $incident = Incident::findOrFail($incidentId);
        $anterior = $incident->state_id;
        $previousState = State::find($anterior);
        $newState = State::findOrFail($data->stateId);

        DB::transaction(function () use ($incident, $data, $userId, $anterior, $newState) {
            $incident->update([
                'state_id' => $data->stateId,
                'resolution_date' => $newState->is_final_state ? now() : null,
            ]);

            IncidentState::create([
                'incident_id' => $incident->id,
                'previous_state_id' => $anterior,
                'new_state_id' => $data->stateId,
                'user_id' => $userId,
                'comment' => $data->comment,
            ]);
        });

        [$title, $message, $type] = $this->stateNotificationPayload(
            incidentCode: $incident->code,
            previousStateName: $previousState?->name,
            newStateName: $newState->name,
            comment: $data->comment
        );

        $this->createNotification(
            userId: (int) $incident->reported_by_id,
            title: $title,
            message: $message,
            type: $type
        );

        $this->notifySupervisorsForStateChange($incident, $newState);

        return $this->incidentMapper->fromModel($incident->fresh()->load(self::RELATIONS));
    }

    public function notifications(int $userId, NotificationFiltersData $filters): PaginatedResult
    {
        $query = Notification::where('user_id', $userId)->latest();

        if ($filters->isRead !== null) {
            $query->where('is_read', $filters->isRead);
        }

        $result = $query->paginate($filters->perPage);

        return new PaginatedResult(
            items: array_map(
                fn (Notification $notification) => $this->notificationMapper->fromModel($notification),
                $result->items()
            ),
            currentPage: $result->currentPage(),
            perPage: $result->perPage(),
            total: $result->total(),
            lastPage: $result->lastPage()
        );
    }

    public function unreadCount(int $userId): int
    {
        return Notification::where('user_id', $userId)->unread()->count();
    }

    public function markAsRead(int $notificationId, int $userId): NotificationData
    {
        $notification = Notification::findOrFail($notificationId);

        if ($notification->user_id !== $userId) {
            throw IncidentException::transitionForbidden();
        }

        $notification->markAsRead();

        return $this->notificationMapper->fromModel($notification->fresh());
    }

    public function markAllAsRead(int $userId): void
    {
        Notification::where('user_id', $userId)
            ->unread()
            ->update([
                'is_read' => true,
                'read_at' => now(),
            ]);
    }

    private function createNotification(int $userId, string $title, string $message, string $type): void
    {
        Notification::create([
            'user_id' => $userId,
            'title' => $title,
            'message' => $message,
            'type' => $type,
        ]);

        app(AdminNotifier::class)->notify($title, $message, $type, [$userId]);
    }

    private function createNotificationIfMissing(int $userId, string $title, string $message, string $type): void
    {
        $exists = Notification::where('user_id', $userId)
            ->where('title', $title)
            ->where('message', $message)
            ->exists();

        if ($exists) {
            return;
        }

        $this->createNotification($userId, $title, $message, $type);
    }

    private function notifyOperators(string $title, string $message, string $type): void
    {
        foreach ($this->operatorUserIds() as $operatorUserId) {
            $this->createNotificationIfMissing($operatorUserId, $title, $message, $type);
        }
    }

    private function notifySupervisors(string $title, string $message, string $type): void
    {
        foreach ($this->supervisorUserIds() as $supervisorUserId) {
            $this->createNotificationIfMissing($supervisorUserId, $title, $message, $type);
        }
    }

    /**
     * @return array<int, int>
     */
    private function operatorUserIds(): array
    {
        return User::query()
            ->where('is_active', true)
            ->whereHas('roles', fn ($query) => $query->where('code', 'OPERADOR')->where('is_active', true))
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /**
     * @return array<int, int>
     */
    private function supervisorUserIds(): array
    {
        return User::query()
            ->where('is_active', true)
            ->whereHas('roles', fn ($query) => $query->where('code', 'SUPERVISOR')->where('is_active', true))
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    private function notifySupervisorsForStateChange(Incident $incident, State $newState): void
    {
        $normalizedState = strtoupper(str_replace(' ', '_', $newState->name));

        match ($normalizedState) {
            'RECHAZADA' => $this->notifySupervisors(
                title: 'Incidencia rechazada',
                message: "Una incidencia fue rechazada por el operador: {$incident->code}.",
                type: 'STATUS_CHANGE'
            ),
            'CERRADA' => $this->notifySupervisors(
                title: 'Incidencia cerrada',
                message: "Se cerró la incidencia {$incident->code}.",
                type: 'INCIDENT_CLOSED'
            ),
            default => null,
        };
    }

    /**
     * @return array{0: string, 1: string, 2: string}
     */
    private function stateNotificationPayload(
        string $incidentCode,
        ?string $previousStateName,
        string $newStateName,
        ?string $comment
    ): array {
        $normalizedState = strtoupper(str_replace(' ', '_', $newStateName));
        $previousLabel = $this->formatStateLabel($previousStateName ?: 'Pendiente');
        $newLabel = $this->formatStateLabel($newStateName);

        return match ($normalizedState) {
            'RECHAZADA' => [
                'Incidencia rechazada',
                trim("Tu incidencia {$incidentCode} fue rechazada." . ($comment ? " Motivo: {$comment}" : '')),
                'STATUS_CHANGE',
            ],
            'RESUELTA' => [
                'Incidencia resuelta',
                "Tu incidencia {$incidentCode} fue marcada como resuelta.",
                'STATUS_CHANGE',
            ],
            'CERRADA' => [
                'Incidencia cerrada',
                "Tu incidencia {$incidentCode} fue cerrada correctamente.",
                'INCIDENT_CLOSED',
            ],
            default => [
                'Cambio de estado',
                "Tu incidencia {$incidentCode} cambiÃ³ de {$previousLabel} a {$newLabel}.",
                'STATUS_CHANGE',
            ],
        };
    }

    private function formatStateLabel(?string $stateName): string
    {
        if (! $stateName) {
            return 'Pendiente';
        }

        return mb_convert_case(strtolower(str_replace('_', ' ', $stateName)), MB_CASE_TITLE, 'UTF-8');
    }

    private function generarCodigo(): string
    {
        $prefix = 'INC-' . now()->format('Y') . '-';

        do {
            $codigo = $prefix . Str::padLeft((string) random_int(1, 99999), 5, '0');
        } while (Incident::where('code', $codigo)->exists());

        return $codigo;
    }
}
