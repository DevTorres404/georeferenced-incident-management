<?php

namespace App\Incidents\Infrastructure\Persistence\Repositories;

use App\Incidents\Application\DTOs\AddCommentInputData;
use App\Incidents\Application\DTOs\AssignmentData;
use App\Incidents\Application\DTOs\AttachmentData;
use App\Incidents\Application\DTOs\ChangeStateInputData;
use App\Incidents\Application\DTOs\CommentData;
use App\Incidents\Application\DTOs\IncidentDetailData;
use App\Incidents\Application\DTOs\IncidentFiltersData;
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
use App\Incidents\Infrastructure\Persistence\Models\StateTransition;
use App\Shared\Application\DTOs\StoredFileData;
use App\Shared\Application\Results\PaginatedResult;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class EloquentIncidentRepository implements IncidentRepositoryInterface
{
    private const RELATIONS = [
        'category',
        'subcategory',
        'priority',
        'state',
        'city.province.country',
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
        if ($filters->cityId !== null) {
            $query->where('city_id', $filters->cityId);
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
                'city_id' => $data->cityId,
                'subcategory_id' => $data->subcategoryId,
                'address' => $data->address,
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
        $updateData = [];
        if ($data->title !== null) $updateData['title'] = $data->title;
        if ($data->description !== null) $updateData['description'] = $data->description;
        if ($data->categoryId !== null) $updateData['category_id'] = $data->categoryId;
        if ($data->priorityId !== null) $updateData['priority_id'] = $data->priorityId;
        if ($data->cityId !== null) $updateData['city_id'] = $data->cityId;
        if (property_exists($data, 'subcategoryId')) $updateData['subcategory_id'] = $data->subcategoryId;
        if (property_exists($data, 'address')) $updateData['address'] = $data->address;
        if (property_exists($data, 'latitude')) $updateData['latitude'] = $data->latitude;
        if (property_exists($data, 'longitude')) $updateData['longitude'] = $data->longitude;
        if (property_exists($data, 'resolutionDate')) $updateData['resolution_date'] = $data->resolutionDate;
        
        if (!empty($updateData)) {
            $incident->update($updateData);
        }

        return $this->incidentMapper->fromModel($incident->fresh()->load(self::RELATIONS));
    }

    public function delete(int $incidentId): void
    {
        Incident::findOrFail($incidentId)->delete();
    }

    public function addComment(int $incidentId, int $userId, AddCommentInputData $data): CommentData
    {
        $comment = IncidentComment::create([
            'incident_id' => $incidentId,
            'user_id' => $userId,
            'comment' => $data->comment,
            'is_internal' => $data->isInternal,
        ])->load('user');

        return $this->commentMapper->fromModel($comment);
    }

    public function attachFile(int $incidentId, int $userId, StoredFileData $storedFileData): AttachmentData
    {
        $attachment = IncidentAttachment::create([
            'incident_id' => $incidentId,
            'user_id' => $userId,
            'original_name' => $storedFileData->originalName,
            'file_path' => $storedFileData->storagePath,
            'mime_type' => $storedFileData->mimeType,
            'file_size_bytes' => $storedFileData->sizeInBytes,
            'file_hash' => $storedFileData->hash,
        ])->load('user');

        return $this->attachmentMapper->fromModel($attachment);
    }

    public function assign(int $incidentId, int $userId, int $assigneeUserId): AssignmentData
    {
        $incident = Incident::findOrFail($incidentId);

        $asignacion = IncidentAssignment::create([
            'incident_id' => $incidentId,
            'user_id' => $assigneeUserId,
            'assigned_by_id' => $userId,
        ]);

        Notification::create([
            'user_id' => $assigneeUserId,
            'title' => 'Nueva incidencia asignada',
            'message' => "Se te asignó la incidencia {$incident->code}.",
            'type' => 'INCIDENT_ASSIGNED',
        ]);

        return $this->assignmentMapper->fromModel($asignacion->load(['user', 'assignedBy']));
    }

    public function changeState(int $incidentId, int $userId, ChangeStateInputData $data): \App\Incidents\Domain\Entities\Incident
    {
        $incident = Incident::findOrFail($incidentId);
        $anterior = $incident->state_id;

        DB::transaction(function () use ($incident, $data, $userId, $anterior) {
            $incident->update([
                'state_id' => $data->stateId,
                'resolution_date' => State::find($data->stateId)?->is_final_state ? now() : null,
            ]);

            IncidentState::create([
                'incident_id' => $incident->id,
                'previous_state_id' => $anterior,
                'new_state_id' => $data->stateId,
                'user_id' => $userId,
                'comment' => $data->comment,
            ]);
        });

        Notification::create([
            'user_id' => $incident->reported_by_id,
            'title' => 'Estado de incidencia actualizado',
            'message' => "La incidencia {$incident->code} cambió de estado.",
            'type' => 'STATUS_CHANGE',
        ]);

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

    private function generarCodigo(): string
    {
        $prefix = 'INC-' . now()->format('Y') . '-';

        do {
            $codigo = $prefix . Str::padLeft((string) random_int(1, 99999), 5, '0');
        } while (Incident::where('code', $codigo)->exists());

        return $codigo;
    }
}
