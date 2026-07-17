<?php

namespace App\Incidents\Infrastructure\Persistence\Repositories;

use App\Auth\Infrastructure\Persistence\Models\User;
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
use App\Incidents\Application\DTOs\IncidentMapPointData;
use App\Incidents\Application\DTOs\NotificationData;
use App\Incidents\Application\DTOs\NotificationFiltersData;
use App\Incidents\Application\DTOs\RequestStateChangeInputData;
use App\Incidents\Application\DTOs\StateChangeRequestData;
use App\Incidents\Application\DTOs\StoreIncidentInputData;
use App\Incidents\Application\DTOs\UpdateIncidentInputData;
use App\Incidents\Domain\Entities\IncidentTransition;
use App\Incidents\Domain\Exceptions\IncidentException;
use App\Incidents\Domain\Repositories\IncidentRepositoryInterface;
use App\Incidents\Infrastructure\Broadcasting\CommentCreated;
use App\Incidents\Infrastructure\Broadcasting\IncidentAssigned;
use App\Incidents\Infrastructure\Broadcasting\IncidentStateChanged;
use App\Incidents\Infrastructure\Jobs\NotifyIncidentCreatedJob;
use App\Incidents\Infrastructure\Persistence\Actions\BuildIncidentCycleSnapshotAction;
use App\Incidents\Infrastructure\Persistence\Mappers\AssignmentMapper;
use App\Incidents\Infrastructure\Persistence\Mappers\AttachmentMapper;
use App\Incidents\Infrastructure\Persistence\Mappers\CommentMapper;
use App\Incidents\Infrastructure\Persistence\Mappers\IncidentDetailMapper;
use App\Incidents\Infrastructure\Persistence\Mappers\IncidentMapper;
use App\Incidents\Infrastructure\Persistence\Mappers\IncidentSummaryMapper;
use App\Incidents\Infrastructure\Persistence\Mappers\IncidentTransitionMapper;
use App\Incidents\Infrastructure\Persistence\Mappers\NotificationMapper;
use App\Incidents\Infrastructure\Persistence\Mappers\StateChangeRequestMapper;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAssignment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAttachment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentComment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentCycle;
use App\Incidents\Infrastructure\Persistence\Models\IncidentState;
use App\Incidents\Infrastructure\Persistence\Models\Notification;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Incidents\Infrastructure\Persistence\Models\StateChangeRequest;
use App\Incidents\Infrastructure\Persistence\Models\StateTransition;
use App\Operations\Infrastructure\Persistence\Models\OperatorProfile;
use App\Operations\Infrastructure\Persistence\Models\UserTerritory;
use App\Shared\Application\DTOs\StoredFileData;
use App\Shared\Application\Results\PaginatedResult;
use App\Shared\Infrastructure\Notifications\AdminNotifier;
use App\Shared\Infrastructure\Notifications\UserNotifier;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class EloquentIncidentRepository implements IncidentRepositoryInterface // NOSONAR - Infrastructure repository implementing a domain interface; public methods match the repository contract and support methods are private
{
    private const INACTIVE_WORKLOAD_STATE_NAMES = [
        'CERRADA',
        'CANCELADA',
        'RECHAZADA',
        'CLOSED',
        'CANCELLED',
        'REJECTED',
    ];

    private const RELATIONS = [
        'category',
        'subcategory',
        'priority',
        'state',
        'territorialUnit.'.TerritorialUnit::PARENT_CHAIN,
        'reporter.roles',
        'currentAssignee.roles',
        'assignments.user',
    ];

    public function __construct(
        private IncidentMapper $incidentMapper,
        private IncidentTransitionMapper $incidentTransitionMapper,
        private IncidentSummaryMapper $incidentSummaryMapper,
        private IncidentDetailMapper $incidentDetailMapper,
        private CommentMapper $commentMapper,
        private AttachmentMapper $attachmentMapper,
        private AssignmentMapper $assignmentMapper,
        private NotificationMapper $notificationMapper,
        private StateChangeRequestMapper $stateChangeRequestMapper,
        private UserNotifier $userNotifier
    ) {}

    public function paginate(IncidentFiltersData $filters, int $userId, bool $canManage): PaginatedResult
    {
        $query = Incident::query()->with(self::RELATIONS)->withExists('pendingStateChangeRequests');
        $this->applySorting($query, $filters);
        $this->applyIncidentVisibilityScope($query, $userId);

        $this->applyFilterCriteria($query, $filters, $userId);

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

    public function dataTable(IncidentFiltersData $filters, int $userId, bool $canManage, int $start, int $length): IncidentListResultData
    {
        $query = Incident::query()->with(self::RELATIONS)->withExists('pendingStateChangeRequests');
        $this->applyIncidentVisibilityScope($query, $userId);

        $recordsTotal = (clone $query)->count();

        $this->applyFilterCriteria($query, $filters, $userId);

        $recordsFiltered = (clone $query)->count();

        $this->applySorting($query, $filters);

        $items = $query
            ->skip($start)
            ->take($length)
            ->get()
            ->map(fn (Incident $incident) => $this->incidentSummaryMapper->fromModel($incident))
            ->all();

        return new IncidentListResultData(
            items: $items,
            recordsTotal: $recordsTotal,
            recordsFiltered: $recordsFiltered,
        );
    }

    public function countByState(IncidentFiltersData $filters, int $userId, bool $canManage): array
    {
        $query = Incident::query();
        $this->applyIncidentVisibilityScope($query, $userId);
        $this->applyFilterCriteria($query, $filters, $userId);

        $results = $query
            ->join('core.states as s', 's.id', '=', 'core.incidents.state_id')
            ->selectRaw('s.id, COUNT(*) as count')
            ->groupBy('s.id')
            ->get();

        return $results->pluck('count', 'id')->all();
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

        $this->applyIncidentVisibilityScope($query, $userId);

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
            $query->whereHas('assignments', function ($assignmentQuery) use ($userId) {
                $assignmentQuery->where('user_id', $userId)
                    ->where('active', true);
            });
        }

        if (! empty($filters->search)) {
            $search = $filters->search;
            $query->where(function ($searchQuery) use ($search) {
                $searchQuery->where('code', 'ILIKE', "%{$search}%")
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

        $territorialUnitId = $data->territorialUnitId;

        if ($territorialUnitId === null && $data->latitude !== null && $data->longitude !== null) {
            $resolved = $this->resolveTerritorialUnitFromCoordinates($data->latitude, $data->longitude);
            if ($resolved) {
                $territorialUnitId = $resolved->id;
            }
        }

        return DB::transaction(function () use ($data, $initialState, $userId, $territorialUnitId) {
            $incident = Incident::create([
                'title' => $data->title,
                'description' => $data->description,
                'category_id' => $data->categoryId,
                'priority_id' => $data->priorityId,
                'territorial_unit_id' => $territorialUnitId,
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

            $cycle = IncidentCycle::create([
                'incident_id' => $incident->id,
                'cycle_number' => 1,
                'opened_at' => now(),
                'opened_by' => $userId,
            ]);

            $incident->forceFill(['current_cycle_id' => $cycle->id])->saveQuietly();

            IncidentState::create([
                'incident_id' => $incident->id,
                'incident_cycle_id' => $cycle->id,
                'previous_state_id' => null,
                'new_state_id' => $initialState->id,
                'user_id' => $userId,
                'comment' => 'Incidencia creada.',
            ]);

            NotifyIncidentCreatedJob::dispatch((int) $incident->id, $userId)->afterCommit();

            $incident->setRelation('state', $initialState);

            return $this->incidentMapper->fromModel($incident);
        });
    }

    public function notifyCreatedIncident(int $incidentId, int $reporterUserId): void
    {
        $incident = Incident::query()
            ->with([
                'category',
                'priority',
                'territorialUnit.'.TerritorialUnit::PARENT_CHAIN,
            ])
            ->findOrFail($incidentId);

        $this->createNotification(
            userId: $reporterUserId,
            title: 'Incidencia registrada',
            message: "Tu incidencia {$incident->code} fue registrada correctamente.",
            type: 'STATUS_CHANGE',
            incidentId: (int) $incident->id
        );

        $this->notifyZoneSupervisorsOrAdmins(
            incident: $incident,
            title: 'Nueva incidencia creada',
            message: "Nueva incidencia {$incident->code} reportada en ".($incident->category?->name ?? 'una categoría registrada').'.',
            type: 'STATUS_CHANGE'
        );

        if ($incident->priority_id !== null && (int) ($incident->priority?->level ?? 0) === 1) {
            $sector = $incident->territorialUnit?->full_path ?: ($incident->address_reference ?: 'el sector reportado');
            $this->notifyZoneSupervisorsForIncident(
                incident: $incident,
                title: 'Incidencia critica creada',
                message: "Se reporto una incidencia critica {$incident->code} en {$sector}.",
                type: 'STATUS_CHANGE'
            );
        }

        if ($incident->latitude === null || $incident->longitude === null) {
            app(AdminNotifier::class)->notify(
                title: 'Error de geolocalizacion',
                message: "La incidencia {$incident->code} fue creada sin coordenadas validas.",
                type: 'STATUS_CHANGE',
                incidentId: (int) $incident->id
            );
        }
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

    public function loadForUpdate(int $incidentId): \App\Incidents\Domain\Entities\Incident
    {
        $incident = Incident::query()->lockForUpdate()->findOrFail($incidentId);

        return $this->incidentMapper->fromModel($incident->load(self::RELATIONS));
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
            'cycles.openedBy',
            'cycles.resolvedBy',
            'cycles.closedBy',
        ])->findOrFail($incidentId);

        return $this->incidentDetailMapper->fromModel($incident);
    }

    public function findTransition(int $fromStateId, int $toStateId): ?IncidentTransition
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

        if ($data->has('title')) {
            $updateData['title'] = $data->title;
        }

        if ($data->has('description')) {
            $updateData['description'] = $data->description;
        }

        if ($data->has('categoryId')) {
            $updateData['category_id'] = $data->categoryId;
        }

        if ($data->has('priorityId')) {
            $updateData['priority_id'] = $data->priorityId;
        }

        if ($data->has('territorialUnitId')) {
            $updateData['territorial_unit_id'] = $data->territorialUnitId;
        }

        if ($data->has('subcategoryId')) {
            $updateData['subcategory_id'] = $data->subcategoryId;
        }

        if ($data->has('address')) {
            $updateData['address'] = $data->address;
            $updateData['address_reference'] = $data->address;
        }

        if ($data->has('latitude')) {
            $updateData['latitude'] = $data->latitude;
        }

        if ($data->has('longitude')) {
            $updateData['longitude'] = $data->longitude;
        }

        if ($data->has('resolutionDate')) {
            $updateData['resolution_date'] = $data->resolutionDate;
        }

        if ($updateData !== []) {
            $incident->update($updateData);
        }

        if ($data->has('priorityId') && $data->priorityId !== null && (int) $previousPriorityId !== $data->priorityId) {
            $priorityName = Priority::find($data->priorityId)?->name ?? 'actualizada';
            $message = "La prioridad de la incidencia {$incident->code} cambió a {$priorityName}.";

            $this->notifyAssignedOperators(
                incidentId: (int) $incident->id,
                title: 'Cambio de prioridad',
                message: $message,
                type: 'STATUS_CHANGE'
            );

            $this->notifyZoneSupervisorsForIncident(
                incident: $incident->loadMissing('territorialUnit.'.TerritorialUnit::PARENT_CHAIN),
                title: 'Cambio manual de prioridad',
                message: "Se cambió la prioridad de la incidencia {$incident->code} a {$priorityName}.",
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
            title: 'Accion critica',
            message: "Un usuario elimino o cerro forzadamente una incidencia: {$incidentCode}.",
            type: 'STATUS_CHANGE',
            incidentId: $incidentId
        );
    }

    public function addComment(int $incidentId, int $userId, AddCommentInputData $data): CommentData
    {
        return DB::transaction(function () use ($incidentId, $userId, $data): CommentData {
            $incident = Incident::query()->lockForUpdate()->findOrFail($incidentId);
            $comment = IncidentComment::create([
                'incident_id' => $incidentId,
                'incident_cycle_id' => $incident->current_cycle_id,
                'user_id' => $userId,
                'comment' => $data->comment,
                'is_internal' => $data->isInternal,
            ])->load('user');

            if (! $data->isInternal && (int) $incident->reported_by_id !== $userId) {
                $this->createNotification(
                    userId: (int) $incident->reported_by_id,
                    title: 'Comentario recibido',
                    message: "Un operador respondio en tu incidencia {$incident->code}.",
                    type: 'NEW_COMMENT',
                    incidentId: $incidentId
                );
            }

            if ((int) $incident->reported_by_id === $userId) {
                $this->notifyAssignedOperators(
                    incidentId: $incidentId,
                    title: 'Comentario recibido',
                    message: "El ciudadano respondio en la incidencia {$incident->code}.",
                    type: 'NEW_COMMENT'
                );
            }

            if ($this->isSupervisorUserId($userId)) {
                $this->notifyAssignedOperators(
                    incidentId: $incidentId,
                    title: 'Comentario del supervisor',
                    message: "El supervisor agrego un comentario en la incidencia {$incident->code}.",
                    type: 'NEW_COMMENT'
                );
            }

            $commentData = $this->commentMapper->fromModel($comment);
            event(new CommentCreated($commentData));

            return $commentData;
        });
    }

    public function attachFile(int $incidentId, int $userId, StoredFileData $storedFileData): AttachmentData
    {
        return DB::transaction(function () use ($incidentId, $userId, $storedFileData): AttachmentData {
            $incident = Incident::query()->lockForUpdate()->findOrFail($incidentId);
            $attachment = IncidentAttachment::create([
                'incident_id' => $incidentId,
                'incident_cycle_id' => $incident->current_cycle_id,
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
                    message: "Se agrego una actualizacion o evidencia a tu incidencia {$incident->code}.",
                    type: 'NEW_COMMENT',
                    incidentId: $incidentId
                );
            }

            if ((int) $incident->reported_by_id === $userId) {
                $this->notifyAssignedOperators(
                    incidentId: $incidentId,
                    title: 'Evidencia agregada',
                    message: "Se adjunto nueva evidencia a la incidencia {$incident->code}.",
                    type: 'NEW_COMMENT'
                );
            }

            return $this->attachmentMapper->fromModel($attachment);
        });
    }

    public function assign(int $incidentId, int $userId, AssignIncidentOperatorsInputData $data): IncidentAssignmentBatchData
    {
        return DB::transaction(function () use ($incidentId, $userId, $data): IncidentAssignmentBatchData {
            $incident = Incident::query()
                ->with(['state', 'priority', 'territorialUnit.'.TerritorialUnit::PARENT_CHAIN])
                ->lockForUpdate()
                ->findOrFail($incidentId);

            if (! $incident->priority_id) {
                throw IncidentException::priorityRequiredForAssignment();
            }

            if (! $incident->state_id) {
                throw IncidentException::stateRequiredForAssignment();
            }

            $currentStateName = strtoupper((string) ($incident->state?->name ?? ''));
            if (in_array($currentStateName, ['CERRADA', 'CLOSED'], true)) {
                throw IncidentException::closedIncidentAssignmentNotAllowed();
            }

            if ($currentStateName !== 'EN_PROGRESO' && $currentStateName !== 'IN_PROGRESS') {
                throw IncidentException::inProgressRequiredForAssignment();
            }

            $this->ensureUserCanAssignIncident($userId, $incident);

            $desiredAssignments = [
                $data->primaryOperatorId => IncidentAssignment::ROLE_PRIMARY,
            ];

            foreach ($data->supportOperatorIds as $supportOperatorId) {
                if ($supportOperatorId === $data->primaryOperatorId) {
                    continue;
                }

                $desiredAssignments[$supportOperatorId] = IncidentAssignment::ROLE_SUPPORT;
            }

            foreach ($desiredAssignments as $operatorUserId => $assignmentRole) {
                $this->ensureOperatorCanReceiveIncident($incident, (int) $operatorUserId);
                $this->ensureOperatorCanCoverIncidentZone((int) $operatorUserId, $incident);
            }

            $activeAssignments = IncidentAssignment::query()
                ->where('incident_id', $incidentId)
                ->where('active', true)
                ->lockForUpdate()
                ->get()
                ->keyBy(fn (IncidentAssignment $assignment) => (int) $assignment->user_id);

            $now = now();

            foreach ($activeAssignments as $operatorUserId => $activeAssignment) {
                $desiredRole = $desiredAssignments[(int) $operatorUserId] ?? null;

                if ($desiredRole === null || $desiredRole !== $activeAssignment->assignment_role) {
                    $activeAssignment->forceFill([
                        'active' => false,
                        'unassignment_date' => $now,
                    ])->save();
                }
            }

            foreach ($desiredAssignments as $operatorUserId => $assignmentRole) {
                $existingAssignment = $activeAssignments->get((int) $operatorUserId);

                if (
                    $existingAssignment instanceof IncidentAssignment
                    && $existingAssignment->active
                    && $existingAssignment->assignment_role === $assignmentRole
                ) {
                    continue;
                }

                IncidentAssignment::create([
                    'incident_id' => $incidentId,
                    'incident_cycle_id' => $incident->current_cycle_id,
                    'user_id' => (int) $operatorUserId,
                    'assigned_by_id' => $userId,
                    'assignment_role' => $assignmentRole,
                    'active' => true,
                ]);
            }

            if ($this->shouldMoveIncidentToAssignedState($incident)) {
                $assignedStateId = State::query()
                    ->whereIn('name', ['ASIGNADA', 'ASSIGNED'])
                    ->value('id');

                if ($assignedStateId) {
                    $previousStateId = (int) $incident->state_id;
                    $incident->forceFill(['state_id' => $assignedStateId])->save();

                    IncidentState::create([
                        'incident_id' => $incident->id,
                        'incident_cycle_id' => $incident->current_cycle_id,
                        'previous_state_id' => $previousStateId,
                        'new_state_id' => $assignedStateId,
                        'user_id' => $userId,
                        'comment' => 'Asignacion operativa registrada.',
                    ]);
                }
            }

            $freshAssignments = IncidentAssignment::query()
                ->with(['user', 'assignedBy'])
                ->where('incident_id', $incidentId)
                ->where('active', true)
                ->orderByRaw("CASE WHEN assignment_role = 'primary' THEN 0 ELSE 1 END")
                ->orderBy('assignment_date')
                ->get();

            // Solo notificar a usuarios cuya asignación sea nueva o haya cambiado de rol,
            // no a los que ya estaban asignados con el mismo rol (ej: operador principal
            // que sigue siendo principal en esta actualización)
            foreach ($freshAssignments as $assignment) {
                $operatorUserId = (int) $assignment->user_id;
                $wasPreviouslyAssigned = $activeAssignments->has($operatorUserId);
                $previousRole = $wasPreviouslyAssigned
                    ? $activeAssignments[$operatorUserId]->assignment_role
                    : null;

                $isNewOrChanged = ! $wasPreviouslyAssigned
                    || $previousRole !== $assignment->assignment_role;

                if (! $isNewOrChanged) {
                    continue;
                }

                $message = $assignment->assignment_role === IncidentAssignment::ROLE_PRIMARY
                    ? "Se te asigno la incidencia {$incident->code} como responsable principal."
                    : "Se te asigno la incidencia {$incident->code} como operador de apoyo.";

                $this->createNotification(
                    userId: $operatorUserId,
                    title: 'Incidencia asignada',
                    message: $message,
                    type: 'INCIDENT_ASSIGNED',
                    incidentId: $incidentId
                );
            }

            $assigner = User::query()->find($userId);

            IncidentAssigned::dispatch(
                incidentId: $incidentId,
                assignments: $freshAssignments->map(fn (IncidentAssignment $a): array => [
                    'user_id' => (int) $a->user_id,
                    'user_name' => $a->relationLoaded('user') && $a->user ? $a->user->getNombreCompletoAttribute() : "Usuario #{$a->user_id}",
                    'role' => $a->assignment_role,
                ])->all(),
                assignedByUserId: $userId,
                assignedByName: $assigner?->getNombreCompletoAttribute() ?? 'Usuario',
            );

            $incident->refresh();

            return new IncidentAssignmentBatchData(
                incidentId: $incidentId,
                currentAssigneeUserId: $incident->current_assigned_id ? (int) $incident->current_assigned_id : null,
                assignments: $freshAssignments
                    ->map(fn (IncidentAssignment $assignment): AssignmentData => $this->assignmentMapper->fromModel($assignment))
                    ->all()
            );
        });
    }

    public function changeState(int $incidentId, int $userId, ChangeStateInputData $data): \App\Incidents\Domain\Entities\Incident
    {
        $newState = State::findOrFail($data->stateId);
        $normalizedNewState = strtoupper((string) $newState->name);
        $isClosing = in_array($normalizedNewState, ['CERRADA', 'CLOSED'], true);
        $isReopening = in_array($normalizedNewState, ['REABIERTA', 'REOPENED'], true);
        $isResolved = in_array($normalizedNewState, ['RESUELTA', 'RESOLVED'], true);
        $releasesAssignments = $isClosing;
        [$assignedOperatorIds, $previousStateId] = DB::transaction(function () use (
            $incidentId,
            $data,
            $userId,
            $newState,
            $isClosing,
            $isResolved,
            $isReopening,
            $releasesAssignments
        ): array {
            $incident = Incident::query()->lockForUpdate()->findOrFail($incidentId);
            $previousStateId = $incident->state_id;

            if (! $incident->priority_id && in_array(strtoupper((string) $newState->name), ['EN_PROGRESO', 'RESUELTA', 'CERRADA'], true)) {
                throw IncidentException::priorityRequiredForState();
            }

            $updateData = ['state_id' => $data->stateId];

            if ($isReopening) {
                $updateData['reopened_at'] = now();
                $updateData['previous_resolution_date'] = $incident->resolution_date;
                $updateData['resolution_date'] = null;
                $updateData['resolved_by_supervisor_id'] = null;

                $currentCycle = IncidentCycle::query()->find($incident->current_cycle_id);
                if ($currentCycle && ! $currentCycle->isClosed()) {
                    $currentCycle->forceFill([
                        'closed_at' => now(),
                        'closed_by' => $userId,
                        'closure_reason' => 'Reabierta — nuevo ciclo iniciado.',
                    ])->save();
                }

                IncidentCycle::query()
                    ->where('incident_id', $incident->id)
                    ->lockForUpdate()
                    ->pluck('cycle_number');

                $lastCycleNumber = IncidentCycle::query()
                    ->where('incident_id', $incident->id)
                    ->max('cycle_number') ?? 0;

                $nextCycleNumber = (int) $lastCycleNumber + 1;

                $newCycle = IncidentCycle::create([
                    'incident_id' => $incident->id,
                    'cycle_number' => $nextCycleNumber,
                    'opened_at' => now(),
                    'opened_by' => $userId,
                    'reopening_reason' => $data->comment,
                ]);

                $updateData['current_cycle_id'] = $newCycle->id;

                // Clone active assignments to the new cycle
                $activeAssignments = IncidentAssignment::query()
                    ->where('incident_id', $incident->id)
                    ->where('active', true)
                    ->lockForUpdate()
                    ->get();

                if ($activeAssignments->isNotEmpty()) {
                    // Close old assignments
                    IncidentAssignment::query()
                        ->where('incident_id', $incident->id)
                        ->where('active', true)
                        ->update([
                            'active' => false,
                            'unassignment_date' => now(),
                        ]);

                    // Re-create assignments for the new cycle
                    foreach ($activeAssignments as $assignment) {
                        IncidentAssignment::create([
                            'incident_id' => $incident->id,
                            'incident_cycle_id' => $newCycle->id,
                            'user_id' => $assignment->user_id,
                            'assigned_by_id' => $userId, // Supervisor reopening it
                            'assignment_role' => $assignment->assignment_role,
                            'active' => true,
                            'assignment_date' => now(),
                        ]);
                    }
                }
            } else {
                if (in_array(strtoupper((string) $newState->name), ['RECHAZADA', 'REJECTED'], true)) {
                    $updateData['rejected_at'] = $incident->rejected_at ?? now();
                } elseif ($newState->is_final_state) {
                    $updateData['resolution_date'] = $incident->resolution_date ?? now();
                } else {
                    $updateData['resolution_date'] = null;
                }

                if ($isResolved) {
                    if (! $incident->resolution_date) {
                        $updateData['resolution_date'] = now();
                    }

                    $updateData['resolved_by_supervisor_id'] = $userId;

                    IncidentAssignment::where('incident_id', $incident->id)
                        ->where('active', true)
                        ->update(['resolved_at' => now()]);
                }
            }

            $incident->update($updateData);

            $cycleId = $incident->fresh()->current_cycle_id;

            IncidentState::create([
                'incident_id' => $incident->id,
                'incident_cycle_id' => $cycleId,
                'previous_state_id' => $previousStateId,
                'new_state_id' => $data->stateId,
                'user_id' => $userId,
                'comment' => $data->comment,
            ]);

            if ($isResolved && $cycleId) {
                $this->updateCycleOnResolve($cycleId, $userId, $data->comment);
            }

            if ($isClosing && $cycleId) {
                $this->updateCycleOnClose($cycleId, $userId, $data->comment);
            }

            $operatorIds = [];
            if ($releasesAssignments) {
                $activeAssignments = IncidentAssignment::query()
                    ->where('incident_id', $incident->id)
                    ->where('active', true)
                    ->lockForUpdate()
                    ->get(['user_id']);

                if ($isClosing) {
                    $operatorIds = $activeAssignments
                        ->pluck('user_id')
                        ->map(fn ($operatorId): int => (int) $operatorId)
                        ->all();
                }

                $unassignmentDate = now();

                IncidentAssignment::query()
                    ->where('incident_id', $incident->id)
                    ->where('active', true)
                    ->update([
                        'active' => false,
                        'unassignment_date' => $unassignmentDate,
                    ]);

                $incident->forceFill(['current_assigned_id' => null])->save();
            }

            return [$operatorIds, (int) $previousStateId];
        });

        $incident = Incident::query()->findOrFail($incidentId);
        $previousState = State::find($previousStateId);

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
            type: $type,
            incidentId: $incidentId
        );

        $changedByOperator = $this->isOperatorUserId($userId);
        if ($changedByOperator) {
            $this->notifyZoneSupervisorsForIncident(
                incident: $incident->loadMissing('territorialUnit.'.TerritorialUnit::PARENT_CHAIN),
                title: 'Actualizacion del operador',
                message: "La incidencia {$incident->code} fue actualizada por un operador.",
                type: 'STATUS_CHANGE'
            );
        }

        if (! $isReopening && (! $changedByOperator || $isClosing)) {
            $this->notifyAssignedOperatorsForStateChange(
                $incident,
                $newState,
                $isClosing ? $assignedOperatorIds : null
            );
        }

        $this->notifySupervisorsForStateChange($incident, $newState);

        $changer = User::query()->find($userId);

        IncidentStateChanged::dispatch(
            incidentId: (int) $incident->id,
            newStateId: (int) $data->stateId,
            newStateName: $newState->name,
            previousStateId: $previousStateId,
            previousStateName: $previousState?->name,
            changedByUserId: $userId,
            changedByName: $changer?->getNombreCompletoAttribute() ?? 'Usuario',
        );

        return $this->incidentMapper->fromModel($incident->fresh()->load(self::RELATIONS));
    }

    /**
     * @return array<int, AssignmentOperatorOptionData>
     */
    public function assignmentOperatorOptions(int $userId): array
    {
        $viewer = User::query()->with('roles')->findOrFail($userId);
        $viewerZoneIds = $viewer->tieneRol('ADMIN') ? [] : $this->activeZoneIdsForUser($userId);

        $operators = User::query()
            ->with(['roles', 'operatorProfile', 'territoryAssignments.territory.'.TerritorialUnit::PARENT_CHAIN])
            ->where('is_active', true)
            ->whereHas('roles', fn ($query) => $query->where('code', 'OPERADOR')->where('is_active', true))
            ->whereHas('operatorProfile', fn ($query) => $query->where('active', true))
            ->get()
            ->filter(function (User $operator) use ($viewer, $viewerZoneIds): bool {
                if ($viewer->tieneRol('ADMIN')) {
                    return true;
                }

                $operatorZoneIds = $this->activeZoneIdsForTerritoryAssignments($operator->territoryAssignments->all());

                return array_intersect($viewerZoneIds, $operatorZoneIds) !== [];
            })
            ->values();

        return $operators->map(function (User $operator): AssignmentOperatorOptionData {
            $zone = $this->firstOperationalZoneFromAssignments($operator->territoryAssignments->all());
            $profile = $operator->operatorProfile;
            $activeIncidents = $this->activeIncidentCountForOperator((int) $operator->id);
            $workloadPoints = $this->activeWorkloadPointsForOperator((int) $operator->id);
            $maxActive = (int) ($profile?->max_active_incidents ?? OperatorProfile::DEFAULT_MAX_ACTIVE_INCIDENTS);
            $maxWorkload = (int) ($profile?->max_workload_points ?? OperatorProfile::DEFAULT_MAX_WORKLOAD_POINTS);

            return new AssignmentOperatorOptionData(
                userId: (int) $operator->id,
                fullName: trim($operator->first_name.' '.$operator->last_name),
                email: $operator->email,
                zoneId: $zone ? (int) $zone->id : null,
                zoneName: $zone?->name,
                activeIncidents: $activeIncidents,
                workloadPoints: $workloadPoints,
                maxActiveIncidents: $maxActive,
                maxWorkloadPoints: $maxWorkload,
                available: $activeIncidents < $maxActive && $workloadPoints < $maxWorkload
            );
        })->all();
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

    private function createNotification(int $userId, string $title, string $message, string $type, ?int $incidentId = null): void
    {
        $this->userNotifier->notify($userId, $title, $message, $type, $incidentId);
    }

    private function createNotificationIfMissing(int $userId, string $title, string $message, string $type, ?int $incidentId = null): void
    {
        $exists = Notification::where('user_id', $userId)
            ->where('title', $title)
            ->where('message', $message)
            ->exists();

        if ($exists) {
            return;
        }

        $this->createNotification($userId, $title, $message, $type, $incidentId);
    }

    private function notifyAssignedOperators(int $incidentId, string $title, string $message, string $type): void
    {
        IncidentAssignment::query()
            ->where('incident_id', $incidentId)
            ->where('active', true)
            ->pluck('user_id')
            ->unique()
            ->each(function ($operatorUserId) use ($title, $message, $type, $incidentId): void {
                $this->createNotificationIfMissing((int) $operatorUserId, $title, $message, $type, $incidentId);
            });
    }

    private function notifyZoneSupervisorsForIncident(Incident $incident, string $title, string $message, string $type): void
    {
        foreach ($this->zoneSupervisorUserIdsForIncident($incident) as $supervisorUserId) {
            $this->createNotificationIfMissing($supervisorUserId, $title, $message, $type, (int) $incident->id);
        }
    }

    private function notifyZoneSupervisorsOrAdmins(Incident $incident, string $title, string $message, string $type): void
    {
        $supervisorUserIds = $this->zoneSupervisorUserIdsForIncident($incident);

        if ($supervisorUserIds === []) {
            app(AdminNotifier::class)->notify($title, $message, $type, [], (int) $incident->id);

            return;
        }

        foreach ($supervisorUserIds as $supervisorUserId) {
            $this->createNotificationIfMissing($supervisorUserId, $title, $message, $type, (int) $incident->id);
        }
    }

    /**
     * @return array<int, int>
     */
    private function zoneSupervisorUserIdsForIncident(Incident $incident): array
    {
        $zone = $this->resolveOperationalZoneForIncident($incident);

        if (! $zone) {
            return [];
        }

        return UserTerritory::query()
            ->active()
            ->where('territorial_unit_id', $zone->id)
            ->whereHas('user', fn ($userQuery) => $userQuery
                ->where('is_active', true)
                ->whereHas('roles', fn ($roleQuery) => $roleQuery
                    ->where('code', 'SUPERVISOR')
                    ->where('is_active', true)
                    ->whereHas('permissions', fn ($permissionQuery) => $permissionQuery
                        ->where('code', 'notifications.view'))))
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    private function resolveOperationalZoneForIncident(Incident $incident): ?TerritorialUnit
    {
        if ($incident->latitude !== null && $incident->longitude !== null) {
            try {
                $spatialZone = TerritorialUnit::query()
                    ->where('type', TerritorialUnit::TYPE_OPERATIONAL_ZONE)
                    ->where('is_active', true)
                    ->whereNotNull('coverage_area')
                    ->whereRaw(
                        'ST_Within(ST_SetSRID(ST_MakePoint(?, ?), 4326), coverage_area)',
                        [(float) $incident->longitude, (float) $incident->latitude]
                    )
                    ->first();

                if ($spatialZone) {
                    return $spatialZone;
                }
            } catch (\Throwable) {
                // Column coverage_area may not exist yet; fall through to hierarchical lookup.
            }
        }

        $territory = $incident->relationLoaded('territorialUnit')
            ? $incident->territorialUnit
            : $incident->territorialUnit()->with(TerritorialUnit::PARENT_CHAIN)->first();

        return $territory ? $this->resolveOperationalZoneModel($territory) : null;
    }

    private function resolveTerritorialUnitFromCoordinates(float $latitude, float $longitude): ?TerritorialUnit
    {
        try {
            $zone = TerritorialUnit::query()
                ->where('type', TerritorialUnit::TYPE_OPERATIONAL_ZONE)
                ->where('is_active', true)
                ->whereNotNull('coverage_area')
                ->whereRaw(
                    'ST_Within(ST_SetSRID(ST_MakePoint(?, ?), 4326), coverage_area)',
                    [(float) $longitude, (float) $latitude]
                )
                ->first();

            if ($zone) {
                return $zone;
            }
        } catch (\Throwable) {
            // Column coverage_area may not exist yet; fall through.
        }

        return null;
    }

    private function resolveOperationalZoneModel(TerritorialUnit $territory): ?TerritorialUnit
    {
        if ($territory->type === TerritorialUnit::TYPE_OPERATIONAL_ZONE) {
            return $territory;
        }

        if ($territory->type === TerritorialUnit::TYPE_PROVINCE) {
            $canton = TerritorialUnit::query()
                ->where('type', TerritorialUnit::TYPE_CANTON)
                ->where('code', 'like', $territory->code.'%')
                ->first();

            if ($canton && $canton->parent_id) {
                $zone = TerritorialUnit::find($canton->parent_id);
                if ($zone && $zone->type === TerritorialUnit::TYPE_OPERATIONAL_ZONE) {
                    return $zone;
                }
            }
        }

        $current = $territory;

        while ($current->parent) {
            $current = $current->parent;

            if ($current->type === TerritorialUnit::TYPE_OPERATIONAL_ZONE) {
                return $current;
            }
        }

        return null;
    }

    private function notifySupervisorsForStateChange(Incident $incident, State $newState): void
    {
        $normalizedState = strtoupper(str_replace(' ', '_', $newState->name));

        match ($normalizedState) {
            'RECHAZADA' => $this->notifyZoneSupervisorsForIncident(
                incident: $incident->loadMissing('territorialUnit.'.TerritorialUnit::PARENT_CHAIN),
                title: 'Incidencia rechazada',
                message: "Una incidencia fue rechazada por el operador: {$incident->code}.",
                type: 'STATUS_CHANGE'
            ),
            'CERRADA' => $this->notifyZoneSupervisorsForIncident(
                incident: $incident->loadMissing('territorialUnit.'.TerritorialUnit::PARENT_CHAIN),
                title: 'Incidencia cerrada',
                message: "Se cerro la incidencia {$incident->code}.",
                type: 'INCIDENT_CLOSED'
            ),
            default => null,
        };
    }

    private function notifyAssignedOperatorsForStateChange(
        Incident $incident,
        State $newState,
        ?array $operatorIds = null
    ): void {
        $operatorIds ??= IncidentAssignment::query()
            ->where('incident_id', $incident->id)
            ->where('active', true)
            ->pluck('user_id')
            ->map(fn ($operatorId): int => (int) $operatorId)
            ->all();

        if (empty($operatorIds)) {
            return;
        }

        $normalizedState = strtoupper(str_replace(' ', '_', $newState->name));

        if ($normalizedState === 'REABIERTA') {
            $title = 'Incidencia reabierta';
            $message = "La incidencia {$incident->code} fue reabierta por el supervisor. Por favor, revisela nuevamente.";
            $type = 'STATUS_CHANGE';
        } else {
            $title = 'Cambio de estado';
            $message = "La incidencia {$incident->code} cambio su estado a {$newState->name}.";
            $type = 'STATUS_CHANGE';
        }

        foreach ($operatorIds as $operatorId) {
            $this->createNotification(
                userId: (int) $operatorId,
                title: $title,
                message: $message,
                type: $type,
                incidentId: (int) $incident->id
            );
        }
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
                trim("Tu incidencia {$incidentCode} fue rechazada.".($comment ? " Motivo: {$comment}" : '')),
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
                "Tu incidencia {$incidentCode} cambio de {$previousLabel} a {$newLabel}.",
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

    private function ensureUserCanAssignIncident(int $userId, Incident $incident): void
    {
        $user = User::query()->with('roles')->findOrFail($userId);

        if (! $user->tieneRol('ADMIN') && ! $user->tieneRol('SUPERVISOR')) {
            throw IncidentException::assignmentForbidden();
        }

        if ($user->tieneRol('SUPERVISOR') && ! $this->incidentBelongsToUserZones($incident, $userId)) {
            throw IncidentException::supervisorZoneAccessDenied();
        }
    }

    private function ensureOperatorCanReceiveIncident(Incident $incident, int $assigneeUserId): void
    {
        $operator = User::query()
            ->whereKey($assigneeUserId)
            ->where('is_active', true)
            ->whereHas('roles', fn ($query) => $query->where('code', 'OPERADOR')->where('is_active', true))
            ->lockForUpdate()
            ->first();

        if (! $operator) {
            throw IncidentException::operatorAssignmentUnavailable();
        }

        $profile = OperatorProfile::query()
            ->where('user_id', $assigneeUserId)
            ->lockForUpdate()
            ->first();

        if (! $profile || ! $profile->active) {
            throw IncidentException::operatorAssignmentUnavailable();
        }

        $addsActiveLoad = $this->incidentAddsActiveLoad($incident, $assigneeUserId);
        $currentActiveIncidents = $this->activeIncidentCountForOperator($assigneeUserId);
        $currentWorkloadPoints = $this->activeWorkloadPointsForOperator($assigneeUserId);

        $nextActiveIncidents = $currentActiveIncidents + ($addsActiveLoad ? 1 : 0);
        $nextWorkloadPoints = $currentWorkloadPoints + ($addsActiveLoad ? (int) ($incident->priority?->weight ?? 0) : 0);

        if (
            $nextActiveIncidents > (int) $profile->max_active_incidents
            || $nextWorkloadPoints > (int) $profile->max_workload_points
        ) {
            throw IncidentException::operatorCapacityExceeded();
        }
    }

    private function ensureOperatorCanCoverIncidentZone(int $operatorUserId, Incident $incident): void
    {
        $incidentZone = $this->resolveOperationalZoneForIncident($incident);

        if (! $incidentZone) {
            return;
        }

        $operatorZoneIds = $this->activeZoneIdsForUser($operatorUserId);

        if (! in_array((int) $incidentZone->id, $operatorZoneIds, true)) {
            throw IncidentException::operatorAssignmentUnavailable();
        }
    }

    private function incidentAddsActiveLoad(Incident $incident, int $assigneeUserId): bool
    {
        $alreadyAssigned = IncidentAssignment::query()
            ->where('incident_id', $incident->id)
            ->where('user_id', $assigneeUserId)
            ->where('active', true)
            ->exists();

        if ($alreadyAssigned) {
            return false;
        }

        return $this->stateCountsAsActiveLoad($incident->state?->name);
    }

    private function activeIncidentCountForOperator(int $assigneeUserId): int
    {
        return Incident::query()
            ->whereHas('assignments', function ($assignmentQuery) use ($assigneeUserId) {
                $assignmentQuery->where('user_id', $assigneeUserId)
                    ->where('active', true);
            })
            ->whereDoesntHave('state', fn ($stateQuery) => $stateQuery->whereIn('name', self::INACTIVE_WORKLOAD_STATE_NAMES))
            ->count();
    }

    private function activeWorkloadPointsForOperator(int $assigneeUserId): int
    {
        return (int) Incident::query()
            ->join('core.incident_assignments', function ($join) use ($assigneeUserId) {
                $join->on('core.incident_assignments.incident_id', '=', 'core.incidents.id')
                    ->where('core.incident_assignments.user_id', '=', $assigneeUserId)
                    ->where('core.incident_assignments.active', '=', true);
            })
            ->leftJoin('core.priorities', 'core.priorities.id', '=', 'core.incidents.priority_id')
            ->join('core.states', 'core.states.id', '=', 'core.incidents.state_id')
            ->whereNotIn('core.states.name', self::INACTIVE_WORKLOAD_STATE_NAMES)
            ->sum(DB::raw('COALESCE(core.priorities.weight, 0)'));
    }

    private function stateCountsAsActiveLoad(?string $stateName): bool
    {
        if ($stateName === null) {
            return true;
        }

        return ! in_array($stateName, self::INACTIVE_WORKLOAD_STATE_NAMES, true);
    }

    private function applyFilterCriteria($query, IncidentFiltersData $filters, int $userId): void
    {
        if ($filters->stateFilter !== null) {
            if ($filters->stateFilter === 'pending_review') {
                $query->whereExists(function ($existsQuery) {
                    $existsQuery->selectRaw(1)
                        ->from('state_change_requests')
                        ->whereColumn('state_change_requests.incident_id', 'core.incidents.id')
                        ->where('state_change_requests.status', 'pending');
                });
            } else {
                $stateIds = match ($filters->stateFilter) {
                    'pendiente' => State::where('is_initial_state', true)->where('is_active', true)->pluck('id')->all(),
                    'en_proceso' => State::where('is_initial_state', false)->where('is_final_state', false)->where('is_active', true)->pluck('id')->all(),
                    'resuelta' => State::where('is_final_state', true)->where('is_active', true)->pluck('id')->all(),
                    default => [],
                };
                if (count($stateIds) > 0) {
                    $query->whereIn('state_id', $stateIds);
                }
            }
        } elseif ($filters->stateIds !== null && count($filters->stateIds) > 0) {
            $query->whereIn('state_id', $filters->stateIds);
        } elseif ($filters->stateId !== null) {
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
            $query->whereHas('assignments', function ($assignmentQuery) use ($userId) {
                $assignmentQuery->where('user_id', $userId)
                    ->where('active', true);
            });
        }

        if ($filters->overdue === true) {
            $query->overdue();
        }

        if (! empty($filters->search)) {
            $search = $filters->search;
            $query->where(function ($searchQuery) use ($search) {
                $searchQuery->where('code', 'ILIKE', "%{$search}%")
                    ->orWhere('title', 'ILIKE', "%{$search}%")
                    ->orWhere('description', 'ILIKE', "%{$search}%");
            });
        }

        if ($filters->pendingStateRequest === true) {
            $query->whereExists(function ($existsQuery) {
                $existsQuery->selectRaw(1)
                    ->from('state_change_requests')
                    ->whereColumn('state_change_requests.incident_id', 'core.incidents.id')
                    ->where('state_change_requests.status', 'pending');
            });
        }
    }

    private function applySorting($query, IncidentFiltersData $filters): void
    {
        if ($filters->sortBy !== null) {
            $direction = $filters->sortDirection ?? 'asc';
            $allowedColumns = ['code', 'title', 'priority_id', 'state_id', 'created_at'];

            if (in_array($filters->sortBy, $allowedColumns, true)) {
                $query->orderBy($filters->sortBy, $direction);

                return;
            }
        }

        $query->latest();
    }

    private function applyIncidentVisibilityScope($query, int $userId): void
    {
        $user = User::query()->with('roles')->find($userId);

        if (! $user) {
            $query->whereRaw('1 = 0');

            return;
        }

        if ($user->tieneRol('ADMIN')) {
            return;
        }

        if ($user->tieneRol('SUPERVISOR')) {
            $zoneIds = $this->activeZoneIdsForUser($userId);

            if ($zoneIds === []) {
                $query->whereRaw('1 = 0');

                return;
            }

            $query->whereHas('territorialUnit', function ($territoryQuery) use ($zoneIds) {
                $this->applyZoneFilterToTerritoryQuery($territoryQuery, $zoneIds);
            });

            return;
        }

        if ($user->tieneRol('OPERADOR')) {
            $query->whereHas('assignments', function ($assignmentQuery) use ($userId) {
                $assignmentQuery->where('user_id', $userId)
                    ->where('active', true);
            });

            return;
        }

        $query->where('reported_by_id', $userId);
    }

    private function applyZoneFilterToTerritoryQuery($query, array $zoneIds): void
    {
        $query->where(function ($territoryScope) use ($zoneIds) {
            $territoryScope->whereIn('id', $zoneIds)
                ->orWhereIn('parent_id', $zoneIds)
                ->orWhereHas('parent', fn ($parentQuery) => $parentQuery->whereIn('parent_id', $zoneIds))
                ->orWhereHas('parent.parent', fn ($parentQuery) => $parentQuery->whereIn('parent_id', $zoneIds))
                ->orWhereHas('parent.parent.parent', fn ($parentQuery) => $parentQuery->whereIn('parent_id', $zoneIds))
                ->orWhereHas('parent.parent.parent.parent', fn ($parentQuery) => $parentQuery->whereIn('parent_id', $zoneIds));
        });
    }

    /**
     * @return array<int, int>
     */
    private function activeZoneIdsForUser(int $userId): array
    {
        $assignments = UserTerritory::query()
            ->with('territory.'.TerritorialUnit::PARENT_CHAIN)
            ->active()
            ->where('user_id', $userId)
            ->get();

        return $this->activeZoneIdsForTerritoryAssignments($assignments->all());
    }

    /**
     * @param  array<int, UserTerritory>  $assignments
     * @return array<int, int>
     */
    private function activeZoneIdsForTerritoryAssignments(array $assignments): array
    {
        return collect($assignments)
            ->map(fn (UserTerritory $assignment) => $assignment->territory ? $this->resolveOperationalZoneModel($assignment->territory) : null)
            ->filter()
            ->map(fn (TerritorialUnit $zone) => (int) $zone->id)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @param  array<int, UserTerritory>  $assignments
     */
    private function firstOperationalZoneFromAssignments(array $assignments): ?TerritorialUnit
    {
        foreach ($assignments as $assignment) {
            if (! $assignment instanceof UserTerritory || ! $assignment->territory) {
                continue;
            }

            $zone = $this->resolveOperationalZoneModel($assignment->territory);

            if ($zone) {
                return $zone;
            }
        }

        return null;
    }

    private function incidentBelongsToUserZones(Incident $incident, int $userId): bool
    {
        $zone = $this->resolveOperationalZoneForIncident($incident);

        if (! $zone) {
            return false;
        }

        return in_array((int) $zone->id, $this->activeZoneIdsForUser($userId), true);
    }

    private function isSupervisorUserId(int $userId): bool
    {
        return User::query()
            ->whereKey($userId)
            ->whereHas('roles', fn ($query) => $query->where('code', 'SUPERVISOR')->where('is_active', true))
            ->exists();
    }

    private function isOperatorUserId(int $userId): bool
    {
        return User::query()
            ->whereKey($userId)
            ->whereHas('roles', fn ($query) => $query->where('code', 'OPERADOR')->where('is_active', true))
            ->exists();
    }

    private function shouldMoveIncidentToAssignedState(Incident $incident): bool
    {
        $stateName = strtoupper((string) ($incident->state?->name ?? ''));

        return in_array($stateName, ['NUEVA', 'PENDIENTE', 'PENDING'], true);
    }

    private function appendResolutionSnapshot(Incident $incident, int $userId): void
    {
        $operators = IncidentAssignment::query()
            ->where('incident_id', $incident->id)
            ->where('active', true)
            ->get(['user_id', 'assignment_role'])
            ->toArray();

        $snapshots = $incident->resolution_snapshots ?? [];
        $snapshots[] = [
            'resolved_at' => now()->toISOString(),
            'resolved_by_supervisor_id' => $userId,
            'operators' => $operators,
            'previous_resolution_date' => $incident->previous_resolution_date?->toISOString(),
        ];

        Incident::withoutTimestamps(fn () => $incident->forceFill(['resolution_snapshots' => $snapshots])->save());
    }

    public function findPendingStateChangeRequest(int $incidentId): ?StateChangeRequestData
    {
        $request = StateChangeRequest::query()
            ->where('incident_id', $incidentId)
            ->where('status', 'pending')
            ->with(['requestedBy', 'requestedState', 'reviewedBy'])
            ->first();

        if (! $request) {
            return null;
        }

        return $this->stateChangeRequestMapper->fromModel($request);
    }

    private function updateCycleOnResolve(int $cycleId, int $userId, ?string $resolutionDescription): void
    {
        $cycle = IncidentCycle::query()->find($cycleId);
        if (! $cycle || $cycle->resolved_at) {
            return;
        }

        $cycle->forceFill([
            'resolved_at' => now(),
            'resolved_by' => $userId,
            'resolution_description' => $resolutionDescription,
        ])->save();

        $this->persistCycleSnapshotIfMissing($cycle);

        $this->appendResolutionSnapshot($cycle->incident, $userId);
    }

    private function updateCycleOnClose(int $cycleId, int $userId, ?string $closureReason): void
    {
        $cycle = IncidentCycle::query()->find($cycleId);
        if (! $cycle || $cycle->closed_at) {
            return;
        }

        $cycle->forceFill([
            'closed_at' => now(),
            'closed_by' => $userId,
            'closure_reason' => $closureReason,
        ])->save();

        $this->persistCycleSnapshotIfMissing($cycle);
    }

    private function persistCycleSnapshotIfMissing(IncidentCycle $cycle): void
    {
        if ($cycle->snapshot !== null) {
            return;
        }

        $snapshot = app(BuildIncidentCycleSnapshotAction::class)->execute($cycle->fresh());
        $cycle->forceFill([
            'snapshot' => $snapshot,
            'snapshot_generated_at' => now(),
        ])->save();
    }

    public function stateNameById(int $stateId): ?string
    {
        return State::query()->whereKey($stateId)->value('name');
    }

    public function hasActiveAssignment(int $incidentId, int $userId): bool
    {
        return IncidentAssignment::query()
            ->where('incident_id', $incidentId)
            ->where('user_id', $userId)
            ->where('active', true)
            ->exists();
    }

    public function createStateChangeRequest(int $incidentId, int $userId, RequestStateChangeInputData $data): StateChangeRequestData
    {
        return DB::transaction(function () use ($incidentId, $userId, $data): StateChangeRequestData {
            $request = StateChangeRequest::create([
                'incident_id' => $incidentId,
                'requested_by_user_id' => $userId,
                'requested_state_id' => $data->stateId,
                'reason' => $data->reason,
                'status' => 'pending',
            ]);

            $request->load(['requestedBy', 'requestedState', 'reviewedBy']);

            return $this->stateChangeRequestMapper->fromModel($request);
        });
    }

    public function approveStateChangeRequest(
        int $incidentId,
        int $requestId,
        int $reviewerUserId,
        ?string $comment
    ): void {
        $eventData = DB::transaction(function () use ($incidentId, $requestId, $reviewerUserId, $comment): array {
            $incident = Incident::query()
                ->with('state')
                ->lockForUpdate()
                ->findOrFail($incidentId);
            $request = StateChangeRequest::query()
                ->lockForUpdate()
                ->with('requestedState')
                ->findOrFail($requestId);

            if ((int) $request->incident_id !== $incidentId) {
                throw IncidentException::stateChangeRequestNotFound();
            }

            if ($request->status !== 'pending') {
                throw IncidentException::stateChangeRequestAlreadyReviewed();
            }

            if (strtoupper((string) $incident->state?->name) !== 'EN_PROGRESO') {
                throw IncidentException::stateChangeRequestInvalidSourceState();
            }

            if (strtoupper((string) $request->requestedState?->name) !== 'RESUELTA') {
                throw IncidentException::stateChangeRequestInvalidTargetState();
            }

            $workflowIsValid = StateTransition::query()
                ->where('source_state_id', $incident->state_id)
                ->where('target_state_id', $request->requested_state_id)
                ->where('is_active', true)
                ->exists();
            if (! $workflowIsValid) {
                throw IncidentException::transitionNotAllowed();
            }

            $previousStateId = (int) $incident->state_id;
            $previousStateName = $incident->state?->name;

            $incident->update([
                'state_id' => $request->requested_state_id,
                'resolution_date' => $incident->resolution_date ?? now(),
                'resolved_by_supervisor_id' => $reviewerUserId,
            ]);

            IncidentAssignment::where('incident_id', $incident->id)
                ->where('active', true)
                ->update(['resolved_at' => now()]);

            $cycleId = $incident->current_cycle_id;

            IncidentState::create([
                'incident_id' => $incident->id,
                'incident_cycle_id' => $cycleId,
                'previous_state_id' => $previousStateId,
                'new_state_id' => $request->requested_state_id,
                'user_id' => $reviewerUserId,
                'comment' => $comment ?? 'Cambio de estado aprobado por supervisor.',
            ]);

            if ($cycleId) {
                $this->updateCycleOnResolve($cycleId, $reviewerUserId, $comment);
            }

            $request->update([
                'status' => 'approved',
                'reviewed_by_user_id' => $reviewerUserId,
                'reviewer_comment' => $comment,
                'reviewed_at' => now(),
            ]);

            return [
                'incident_id' => (int) $incident->id,
                'new_state_id' => (int) $request->requested_state_id,
                'new_state_name' => (string) $request->requestedState->name,
                'previous_state_id' => $previousStateId,
                'previous_state_name' => $previousStateName,
            ];
        });

        $reviewer = User::query()->find($reviewerUserId);

        IncidentStateChanged::dispatch(
            incidentId: $eventData['incident_id'],
            newStateId: $eventData['new_state_id'],
            newStateName: $eventData['new_state_name'],
            previousStateId: $eventData['previous_state_id'],
            previousStateName: $eventData['previous_state_name'],
            changedByUserId: $reviewerUserId,
            changedByName: $reviewer?->getNombreCompletoAttribute() ?? 'Usuario',
        );
    }

    public function rejectStateChangeRequest(int $requestId, int $reviewerUserId, ?string $comment): void
    {
        DB::transaction(function () use ($requestId, $reviewerUserId, $comment): void {
            $request = StateChangeRequest::query()
                ->lockForUpdate()
                ->findOrFail($requestId);

            if ($request->status !== 'pending') {
                throw IncidentException::stateChangeRequestAlreadyReviewed();
            }

            $request->update([
                'status' => 'rejected',
                'reviewed_by_user_id' => $reviewerUserId,
                'reviewer_comment' => $comment,
                'reviewed_at' => now(),
            ]);
        });
    }

    public function findStateChangeRequestById(int $requestId): ?StateChangeRequestData
    {
        $request = StateChangeRequest::query()
            ->with(['requestedBy', 'requestedState', 'reviewedBy'])
            ->find($requestId);

        if (! $request) {
            return null;
        }

        return $this->stateChangeRequestMapper->fromModel($request);
    }

    /**
     * @return array<int, StateChangeRequestData>
     */
    public function pendingStateChangeRequestsForUser(int $userId): array
    {
        $zoneIds = $this->activeZoneIdsForUser($userId);

        if ($zoneIds === []) {
            return [];
        }

        $requests = StateChangeRequest::query()
            ->where('status', 'pending')
            ->whereHas('incident', function ($query) use ($zoneIds): void {
                $query->where(function ($territoryQuery) use ($zoneIds): void {
                    $this->applyZoneFilterToTerritoryQuery($territoryQuery, $zoneIds);
                });
            })
            ->with(['incident', 'requestedBy', 'requestedState', 'reviewedBy'])
            ->latest('created_at')
            ->get();

        return $requests
            ->map(fn (StateChangeRequest $request): StateChangeRequestData => $this->stateChangeRequestMapper->fromModel($request))
            ->all();
    }

    private function generarCodigo(): string
    {
        $prefix = 'INC-'.now()->format('Y').'-';

        do {
            $codigo = $prefix.Str::padLeft((string) random_int(1, 99999), 5, '0');
        } while (Incident::where('code', $codigo)->exists());

        return $codigo;
    }
}
