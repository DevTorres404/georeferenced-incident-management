<?php

namespace App\Incidents\Infrastructure\Http\Controllers;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Application\DTOs\AddCommentInputData;
use App\Incidents\Application\DTOs\AssignIncidentOperatorsInputData;
use App\Incidents\Application\DTOs\ChangeStateInputData;
use App\Incidents\Application\DTOs\IncidentDetailData;
use App\Incidents\Application\DTOs\IncidentFiltersData;
use App\Incidents\Application\DTOs\IncidentMapFiltersData;
use App\Incidents\Application\DTOs\IncidentSummaryData;
use App\Incidents\Application\DTOs\RequestStateChangeInputData;
use App\Incidents\Application\DTOs\StoreIncidentInputData;
use App\Incidents\Application\DTOs\UpdateIncidentInputData;
use App\Incidents\Application\UseCases\IncidentUseCase;
use App\Incidents\Domain\Exceptions\IncidentException;
use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Incidents\Infrastructure\Persistence\Models\StateChangeRequest;
use App\Incidents\Infrastructure\Persistence\Models\Subcategory;
use App\Shared\Application\DTOs\UploadedFileData;
use App\Shared\Infrastructure\Http\Controllers\ApiController;
use App\Shared\Infrastructure\Notifications\AdminNotifier;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Throwable;

/**
 * @group Incidencias
 *
 * APIs para la gestión del ciclo de vida de las incidencias reportadas.
 */
class IncidentController extends ApiController
{
    public function __construct(
        private IncidentUseCase $incidentUseCase,
        private AdminNotifier $adminNotifier
    ) {}

    /**
     * Listar incidencias.
     *
     * Devuelve una lista paginada de incidencias según filtros.
     *
     * @authenticated
     *
     * @queryParam state_id int Filtrar por ID de estado. Example: 1
     * @queryParam priority_id int Filtrar por ID de prioridad. Example: 2
     * @queryParam category_id int Filtrar por ID de categoría. Example: 3
     * @queryParam mine boolean Mostrar solo incidencias reportadas por mí. Example: 1
     * @queryParam assigned_to_me boolean Mostrar incidencias asignadas a mí. Example: 0
     * @queryParam overdue boolean Mostrar incidencias atrasadas. Example: 0
     * @queryParam search string Búsqueda de texto libre. Example: fuga
     * @queryParam latitude float Latitud para búsqueda por radio. Example: -0.1806
     * @queryParam longitude float Longitud para búsqueda por radio. Example: -78.4678
     * @queryParam radio_km float Radio en kilómetros. Example: 5
     * @queryParam per_page int Cantidad por página. Example: 15
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        // No verificamos 'incidents.view' estricto aquí, ya que el UseCase se encarga de
        // restringir la consulta a las incidencias propias del usuario si no es administrador.

        $filters = $request->validate([
            'state_id' => ['nullable', 'integer', Rule::exists(State::class, 'id')],
            'priority_id' => ['nullable', 'integer', Rule::exists(Priority::class, 'id')],
            'category_id' => ['nullable', 'integer', Rule::exists(Category::class, 'id')],
            'mine' => ['nullable', 'boolean'],
            'assigned_to_me' => ['nullable', 'boolean'],
            'overdue' => ['nullable', 'boolean'],
            'search' => ['nullable', 'string', 'max:120'],
            'latitude' => ['nullable', 'required_with:longitude', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'required_with:latitude', 'numeric', 'between:-180,180'],
            'radio_km' => ['nullable', 'numeric', 'min:0.1', 'max:200'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:500'],
        ]);

        $filtersDto = new IncidentFiltersData(
            stateId: $filters['state_id'] ?? null,
            priorityId: $filters['priority_id'] ?? null,
            categoryId: $filters['category_id'] ?? null,
            mine: $filters['mine'] ?? null,
            assignedToMe: $filters['assigned_to_me'] ?? null,
            overdue: $filters['overdue'] ?? null,
            search: $filters['search'] ?? null,
            latitude: $filters['latitude'] ?? null,
            longitude: $filters['longitude'] ?? null,
            radiusKm: $filters['radio_km'] ?? null,
            perPage: $filters['per_page'] ?? null,
        );

        return response()->json(
            $this->incidentUseCase->paginate($filtersDto, $user->id, $this->canManage($user))
        );
    }

    /**
     * Server-side DataTables para incidencias.
     *
     * Devuelve datos paginados con formato DataTables (draw, recordsTotal, recordsFiltered, data, kpiCounts).
     *
     * @authenticated
     */
    public function dataTable(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'draw' => ['required', 'integer', 'min:0'],
            'start' => ['required', 'integer', 'min:0'],
            'length' => ['required', 'integer', 'min:1', 'max:500'],
            'search.value' => ['nullable', 'string', 'max:120'],
            'order.0.column' => ['nullable', 'integer', 'min:0', 'max:7'],
            'order.0.dir' => ['nullable', 'in:asc,desc'],
            'mine' => ['nullable', 'boolean'],
            'assigned_to_me' => ['nullable', 'boolean'],
            'state_filter' => ['nullable', 'string', 'max:50'],
            'state_id' => ['nullable', 'integer'],
            'priority_filter' => ['nullable', 'integer'],
            'pending_state_request' => ['nullable', 'boolean'],
        ]);

        $draw = (int) $validated['draw'];
        $start = (int) $validated['start'];
        $length = (int) $validated['length'];
        $searchValue = $validated['search']['value'] ?? null;
        $orderColumnIndex = $validated['order'][0]['column'] ?? null;
        $orderDirection = $validated['order'][0]['dir'] ?? 'desc';

        $sortBy = $this->mapDataTableColumnToSortField($orderColumnIndex);

        $filtersDto = new IncidentFiltersData(
            stateFilter: $validated['state_filter'] ?? null,
            stateId: $validated['state_id'] ?? null,
            priorityId: $validated['priority_filter'] ?? null,
            mine: $validated['mine'] ?? null,
            assignedToMe: $validated['assigned_to_me'] ?? null,
            search: $searchValue,
            sortBy: $sortBy,
            sortDirection: $orderDirection,
            pendingStateRequest: $validated['pending_state_request'] ?? null,
        );

        $result = $this->incidentUseCase->dataTable($filtersDto, $user->id, $this->canManage($user), $start, $length);

        $rows = array_map(
            fn ($incident) => $this->buildDataTableRow($incident),
            $result->items
        );

        return response()->json([
            'draw' => $draw,
            'recordsTotal' => $result->recordsTotal,
            'recordsFiltered' => $result->recordsFiltered,
            'data' => $rows,
        ]);
    }

    /**
     * KPIs de incidencias por estado.
     *
     * Devuelve conteos agrupados por categoría de estado (pendiente, en_proceso, resuelta).
     *
     * @authenticated
     */
    public function kpiCounts(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'mine' => ['nullable', 'boolean'],
            'assigned_to_me' => ['nullable', 'boolean'],
        ]);

        $filters = new IncidentFiltersData(
            mine: $validated['mine'] ?? null,
            assignedToMe: $validated['assigned_to_me'] ?? null,
        );

        return response()->json([
            'data' => $this->incidentUseCase->countByState($filters, $user->id, $this->canManage($user)),
        ]);
    }

    /**
     * Mapa de incidencias.
     *
     * Devuelve incidencias georreferenciadas para visualizacion en mapa.
     *
     * @authenticated
     */
    public function map(Request $request): JsonResponse
    {
        $user = $request->user();

        $filters = $request->validate([
            'state_id' => ['nullable', 'integer', Rule::exists(State::class, 'id')],
            'priority_id' => ['nullable', 'integer', Rule::exists(Priority::class, 'id')],
            'category_id' => ['nullable', 'integer', Rule::exists(Category::class, 'id')],
            'mine' => ['nullable', 'boolean'],
            'assigned_to_me' => ['nullable', 'boolean'],
            'search' => ['nullable', 'string', 'max:120'],
            'min_latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'max_latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'min_longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'max_longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:1000'],
        ]);

        $mapFilters = new IncidentMapFiltersData(
            stateId: $filters['state_id'] ?? null,
            priorityId: $filters['priority_id'] ?? null,
            categoryId: $filters['category_id'] ?? null,
            mine: $filters['mine'] ?? null,
            assignedToMe: $filters['assigned_to_me'] ?? null,
            search: $filters['search'] ?? null,
            minLatitude: $filters['min_latitude'] ?? null,
            maxLatitude: $filters['max_latitude'] ?? null,
            minLongitude: $filters['min_longitude'] ?? null,
            maxLongitude: $filters['max_longitude'] ?? null,
            limit: (int) ($filters['limit'] ?? 500)
        );

        return response()->json([
            'data' => $this->incidentUseCase->mapPoints($mapFilters, $user->id, $this->canManage($user)),
        ]);
    }

    /**
     * Crear incidencia.
     *
     * Reporta una nueva incidencia en el sistema.
     *
     * @authenticated
     *
     * @bodyParam title string required Título de la incidencia. Example: Fuga de agua en la avenida principal
     * @bodyParam description string required Descripción detallada. Example: Hay una fuga inmensa que está rompiendo el asfalto.
     * @bodyParam category_id int required ID de la categoría principal. Example: 1
     * @bodyParam subcategory_id int ID de la subcategoría. Example: 2
     * @bodyParam priority_id int ID de prioridad. Solo roles con gestion de incidencias pueden definirla. Example: 3
     * @bodyParam territorial_unit_id int required ID de la unidad territorial nacional donde ocurre. Example: 10
     * @bodyParam address_reference string Dirección o referencia física. Example: Av. 10 de Agosto y Patria
     * @bodyParam latitude float Coordenada de latitud. Example: -0.208
     * @bodyParam longitude float Coordenada de longitud. Example: -78.5
     * @bodyParam resolution_date date Fecha estimada de resolución. Example: 2026-06-30
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $this->can($user, 'incidents.create')) {
            return $this->forbid();
        }

        $canSetPriority = $this->canManage($user);
        $data = $request->validate(
            $this->rules(allowPriority: $canSetPriority),
            $this->validationMessages()
        );

        $dto = new StoreIncidentInputData(
            title: $data['title'],
            description: $data['description'],
            categoryId: $data['category_id'],
            priorityId: $data['priority_id'] ?? null,
            subcategoryId: $data['subcategory_id'] ?? null,
            address: $data['address_reference'] ?? ($data['address'] ?? null),
            latitude: $data['latitude'] ?? null,
            longitude: $data['longitude'] ?? null,
            territorialUnitId: $data['territorial_unit_id'] ?? null,
            resolutionDate: $data['resolution_date'] ?? null
        );

        return response()->json([
            'message' => 'Incidencia creada correctamente.',
            'data' => $this->incidentUseCase->store($user->id, $dto),
        ], 201);
    }

    /**
     * Ver incidencia.
     *
     * Devuelve el detalle de una incidencia, incluyendo sus comentarios, historial y asignaciones.
     *
     * @authenticated
     *
     * @urlParam incident int required El ID de la incidencia. Example: 5
     */
    public function show(Request $request, Incident $incident): JsonResponse
    {
        $user = $request->user();
        if (! $this->canViewIncident($user, $incident)) {
            return $this->forbid();
        }

        $detail = $this->visibleIncidentDetail(
            $user,
            $this->incidentUseCase->detail($incident->id)
        );

        return response()->json([
            'data' => $detail,
        ]);
    }

    /**
     * Actualizar incidencia.
     *
     * Permite modificar los datos básicos de una incidencia.
     *
     * @authenticated
     *
     * @urlParam incident int required El ID de la incidencia. Example: 5
     *
     * @bodyParam title string Título de la incidencia. Example: Fuga de agua reparada parcialmente
     * @bodyParam description string Descripción detallada.
     * @bodyParam category_id int ID de la categoría principal.
     * @bodyParam priority_id int ID de prioridad.
     * @bodyParam territorial_unit_id int ID de la unidad territorial donde ocurre.
     */
    public function update(Request $request, Incident $incident): JsonResponse
    {
        $user = $request->user();
        if (! $this->canViewIncident($user, $incident) || ! $this->can($user, 'incidents.edit')) {
            return $this->forbid();
        }

        $data = $request->validate(
            $this->rules(partial: true, allowPriority: $this->canManage($user)),
            $this->validationMessages()
        );

        $presentFields = $this->presentUpdateFields($request);

        $dto = new UpdateIncidentInputData(
            title: $data['title'] ?? null,
            description: $data['description'] ?? null,
            categoryId: $data['category_id'] ?? null,
            priorityId: $data['priority_id'] ?? null,
            subcategoryId: $data['subcategory_id'] ?? null,
            address: $data['address_reference'] ?? ($data['address'] ?? null),
            latitude: $data['latitude'] ?? null,
            longitude: $data['longitude'] ?? null,
            territorialUnitId: $data['territorial_unit_id'] ?? null,
            resolutionDate: $data['resolution_date'] ?? null,
            presentFields: $presentFields
        );

        try {
            $detail = $this->visibleIncidentDetail(
                $user,
                $this->incidentUseCase->update($incident->id, $dto)
            );

            return response()->json([
                'message' => 'Incidencia actualizada correctamente.',
                'data' => $detail,
            ]);
        } catch (IncidentException $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode());
        }
    }

    /**
     * Eliminar incidencia.
     *
     * Elimina una incidencia lógicamente (Soft Delete).
     *
     * @authenticated
     *
     * @urlParam incident int required El ID de la incidencia. Example: 5
     */
    public function destroy(Request $request, Incident $incident): JsonResponse
    {
        if (! $this->canViewIncident($request->user(), $incident) || ! $this->can($request->user(), 'incidents.delete')) {
            return $this->forbid();
        }

        $this->incidentUseCase->delete($incident->id);

        return response()->json([
            'message' => 'Incidencia eliminada correctamente.',
        ]);
    }

    /**
     * Agregar comentario.
     *
     * Añade un comentario al hilo de la incidencia. Puede ser interno.
     *
     * @group Comentarios y seguimiento
     *
     * @authenticated
     *
     * @urlParam incident int required El ID de la incidencia. Example: 5
     *
     * @bodyParam comment string required El texto del comentario. Example: El equipo está en camino.
     * @bodyParam is_internal boolean Indica si el comentario es solo visible para agentes/admins. Example: 0
     */
    public function addComment(Request $request, Incident $incident): JsonResponse
    {
        $user = $request->user();
        if (! $this->canViewIncident($user, $incident) || ! $this->can($user, 'comments.create')) {
            return $this->forbid();
        }

        $data = $request->validate([
            'comment' => ['required', 'string', 'max:2000'],
            'is_internal' => ['sometimes', 'boolean'],
        ]);

        $isInternal = (bool) ($data['is_internal'] ?? false);
        if ($isInternal && ! $this->can($user, 'comments.internal')) {
            return $this->forbid('No puedes crear comentarios internos.');
        }

        $dto = new AddCommentInputData(
            comment: $data['comment'],
            isInternal: $isInternal
        );

        $comment = $this->incidentUseCase->addComment($incident->id, $user->id, $dto);

        return response()->json([
            'message' => 'Comentario registrado correctamente.',
            'data' => $comment,
        ], 201);
    }

    /**
     * Adjuntar archivo.
     *
     * Sube un archivo adjunto relacionado con la incidencia.
     *
     * @group Comentarios y seguimiento
     *
     * @authenticated
     *
     * @urlParam incident int required El ID de la incidencia. Example: 5
     *
     * @bodyParam file file required El archivo a subir.
     */
    public function addAttachment(Request $request, Incident $incident): JsonResponse
    {
        $user = $request->user();
        if (! $this->canViewIncident($user, $incident)) {
            return $this->forbid();
        }

        $data = $request->validate([
            'file' => ['required', 'file', 'max:10240', 'mimes:jpg,jpeg,png'],
        ]);

        try {
            $uploadedFile = $data['file'];
            $adjunto = $this->incidentUseCase->attachFile(
                $incident->id,
                $user->id,
                new UploadedFileData(
                    originalName: $uploadedFile->getClientOriginalName(),
                    mimeType: $uploadedFile->getMimeType() ?? 'application/octet-stream',
                    sizeInBytes: $uploadedFile->getSize(),
                    temporaryPath: $uploadedFile->getRealPath() ?: $uploadedFile->getPathname()
                )
            );
        } catch (Throwable $exception) {
            $this->adminNotifier->notify(
                title: 'Error del sistema',
                message: 'Falló el procesamiento de una imagen o archivo adjunto.',
                type: 'STATUS_CHANGE',
                excludeUserIds: [(int) $user->id]
            );

            throw $exception;
        }

        return response()->json([
            'message' => 'Adjunto cargado correctamente.',
            'data' => $adjunto,
        ], 201);
    }

    /**
     * Asignar incidencia.
     *
     * Asigna un usuario (agente) a la incidencia para su resolución.
     *
     * @group Asignaciones
     *
     * @authenticated
     *
     * @urlParam incident int required El ID de la incidencia. Example: 5
     *
     * @bodyParam user_id int required El ID del usuario a asignar. Example: 2
     */
    public function assign(Request $request, Incident $incident): JsonResponse
    {
        $user = $request->user();
        if (! $this->canViewIncident($user, $incident) || ! $this->can($user, 'incidents.assign')) {
            return $this->forbid();
        }

        $data = $request->validate([
            'user_id' => ['nullable', 'integer', Rule::exists(User::class, 'id')],
            'primary_user_id' => ['nullable', 'integer', Rule::exists(User::class, 'id')],
            'support_user_ids' => ['nullable', 'array'],
            'support_user_ids.*' => ['integer', Rule::exists(User::class, 'id')],
        ]);

        $primaryUserId = (int) ($data['primary_user_id'] ?? $data['user_id'] ?? 0);

        $supportUserIds = array_values(array_unique(array_map(
            'intval',
            array_filter($data['support_user_ids'] ?? [], fn ($value) => (int) $value !== $primaryUserId)
        )));

        try {
            if ($primaryUserId <= 0) {
                throw new IncidentException('Debes seleccionar un operador principal.', 422);
            }

            $asignacion = $this->incidentUseCase->assign(
                $incident->id,
                $user->id,
                new AssignIncidentOperatorsInputData(
                    primaryOperatorId: $primaryUserId,
                    supportOperatorIds: $supportUserIds
                )
            );
        } catch (IncidentException $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode());
        }

        return response()->json([
            'message' => 'Incidencia asignada correctamente.',
            'data' => $asignacion,
        ], 201);
    }

    public function assignmentOperators(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $this->can($user, 'incidents.assign')) {
            return $this->forbid();
        }

        return response()->json([
            'data' => $this->incidentUseCase->assignmentOperatorOptions($user->id),
        ]);
    }

    /**
     * Cambiar estado.
     *
     * Transiciona la incidencia a un nuevo estado, verificando que la transición sea válida.
     *
     * @group Estados de incidencia
     *
     * @authenticated
     *
     * @urlParam incident int required El ID de la incidencia. Example: 5
     *
     * @bodyParam state_id int required El ID del nuevo estado. Example: 2
     * @bodyParam comment string Comentario opcional explicando el cambio. Example: Se verificó la fuga y se procedió a cerrar la válvula.
     */
    public function changeState(Request $request, Incident $incident): JsonResponse
    {
        $user = $request->user();
        if (! $this->canViewIncident($user, $incident) || ! $this->can($user, 'incidents.edit')) {
            return $this->forbid();
        }

        $data = $request->validate([
            'state_id' => ['required', 'integer', Rule::exists(State::class, 'id')],
            'comment' => ['nullable', 'string', 'max:2000'],
        ]);

        $roles = $user->roles()->pluck('code')->all();

        $dto = new ChangeStateInputData(
            stateId: $data['state_id'],
            comment: $data['comment'] ?? null
        );

        try {
            return response()->json([
                'message' => 'Estado actualizado correctamente.',
                'data' => $this->incidentUseCase->changeState(
                    $incident->id,
                    $user->id,
                    $roles,
                    $this->can($user, 'incidents.reopen'),
                    $dto
                ),
            ]);
        } catch (IncidentException $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode());
        }
    }

    /**
     * Solicitar cambio de estado.
     *
     * Un operador solicita un cambio de estado que debe ser aprobado por un supervisor.
     *
     * @group Estados de incidencia
     *
     * @authenticated
     *
     * @urlParam incident int required El ID de la incidencia. Example: 5
     *
     * @bodyParam state_id int required El ID del estado solicitado. Example: 2
     * @bodyParam reason string required Motivo de la solicitud. Example: La reparación fue completada exitosamente.
     */
    public function requestStateChange(Request $request, Incident $incident): JsonResponse
    {
        $user = $request->user();
        if (! $this->canViewIncident($user, $incident)) {
            return $this->forbid();
        }

        $data = $request->validate([
            'state_id' => ['required', 'integer', Rule::exists(State::class, 'id')],
            'reason' => ['required', 'string', 'max:2000'],
        ]);

        $roles = $user->roles()->pluck('code')->all();

        $dto = new RequestStateChangeInputData(
            stateId: $data['state_id'],
            reason: $data['reason'],
        );

        try {
            $result = $this->incidentUseCase->requestStateChange(
                $incident->id,
                $user->id,
                $roles,
                $dto,
            );

            return response()->json([
                'message' => 'Solicitud de cambio de estado registrada correctamente.',
                'data' => $result,
            ], 201);
        } catch (IncidentException $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode());
        }
    }

    /**
     * Aprobar cambio de estado.
     *
     * Un supervisor aprueba la solicitud de cambio de estado de un operador.
     *
     * @group Estados de incidencia
     *
     * @authenticated
     *
     * @urlParam incident int required El ID de la incidencia. Example: 5
     * @urlParam stateRequest int required El ID de la solicitud. Example: 1
     *
     * @bodyParam comment string Comentario opcional. Example: Cambio aprobado, proceda.
     */
    public function approveStateChange(Request $request, Incident $incident, int $stateRequest): JsonResponse
    {
        $user = $request->user();
        if (! $this->canViewIncident($user, $incident) || ! $this->can($user, 'incidents.edit')) {
            return $this->forbid();
        }

        $data = $request->validate([
            'comment' => ['required', 'string', 'max:2000'],
        ]);

        $roles = $user->roles()->pluck('code')->all();

        try {
            $this->incidentUseCase->approveStateChange(
                $incident->id,
                $stateRequest,
                $user->id,
                $roles,
                $data['comment'] ?? null,
            );

            return response()->json([
                'message' => 'Solicitud de cambio de estado aprobada correctamente.',
            ]);
        } catch (IncidentException $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode());
        }
    }

    /**
     * Rechazar cambio de estado.
     *
     * Un supervisor rechaza la solicitud de cambio de estado de un operador.
     *
     * @group Estados de incidencia
     *
     * @authenticated
     *
     * @urlParam incident int required El ID de la incidencia. Example: 5
     * @urlParam stateRequest int required El ID de la solicitud. Example: 1
     *
     * @bodyParam comment string Motivo del rechazo. Example: Se requiere inspección adicional.
     */
    public function rejectStateChange(Request $request, Incident $incident, int $stateRequest): JsonResponse
    {
        $user = $request->user();
        if (! $this->canViewIncident($user, $incident) || ! $this->can($user, 'incidents.edit')) {
            return $this->forbid();
        }

        $data = $request->validate([
            'comment' => ['nullable', 'string', 'max:2000'],
        ]);

        $roles = $user->roles()->pluck('code')->all();

        try {
            $this->incidentUseCase->rejectStateChange(
                $incident->id,
                $stateRequest,
                $user->id,
                $roles,
                $data['comment'] ?? null,
            );

            return response()->json([
                'message' => 'Solicitud de cambio de estado rechazada.',
            ]);
        } catch (IncidentException $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode());
        }
    }

    /**
     * Solicitudes pendientes.
     *
     * Devuelve las solicitudes de cambio de estado pendientes para las zonas del supervisor.
     *
     * @group Estados de incidencia
     *
     * @authenticated
     */
    public function pendingStateChangeRequests(Request $request): JsonResponse
    {
        $user = $request->user();
        $roles = $user->roles()->pluck('code')->all();

        return response()->json([
            'data' => $this->incidentUseCase->getPendingStateChangeRequests($user->id, $roles),
        ]);
    }

    /**
     * Solicitudes de una incidencia.
     *
     * Devuelve todas las solicitudes de cambio de estado de una incidencia.
     *
     * @group Estados de incidencia
     *
     * @authenticated
     *
     * @urlParam incident int required El ID de la incidencia. Example: 5
     */
    public function getStateChangeRequests(Request $request, Incident $incident): JsonResponse
    {
        $user = $request->user();
        if (! $this->canViewIncident($user, $incident)) {
            return $this->forbid();
        }

        $requests = StateChangeRequest::query()
            ->where('incident_id', $incident->id)
            ->with(['requestedBy', 'requestedState', 'reviewedBy'])
            ->latest('created_at')
            ->get()
            ->map(fn (StateChangeRequest $request) => [
                'id' => (int) $request->id,
                'incident_id' => (int) $request->incident_id,
                'requested_by_user_id' => (int) $request->requested_by_user_id,
                'requested_by_user_name' => $request->requestedBy?->getNombreCompletoAttribute() ?? "Usuario #{$request->requested_by_user_id}",
                'requested_state_id' => (int) $request->requested_state_id,
                'requested_state_name' => $request->requestedState?->name ?? "Estado #{$request->requested_state_id}",
                'reason' => $request->reason,
                'status' => $request->status,
                'reviewed_by_user_id' => $request->reviewed_by_user_id ? (int) $request->reviewed_by_user_id : null,
                'reviewed_by_user_name' => $request->reviewed_by_user_id
                    ? ($request->reviewedBy?->getNombreCompletoAttribute() ?? "Usuario #{$request->reviewed_by_user_id}")
                    : null,
                'reviewer_comment' => $request->reviewer_comment,
                'created_at' => $request->created_at?->toIso8601String(),
                'reviewed_at' => $request->reviewed_at?->toIso8601String(),
            ])
            ->all();

        return response()->json([
            'data' => $requests,
        ]);
    }

    private function mapDataTableColumnToSortField(?int $columnIndex): ?string
    {
        return match ($columnIndex) {
            0 => 'code',
            1 => 'title',
            3 => 'priority_id',
            4 => 'state_id',
            6 => 'created_at',
            default => null,
        };
    }

    private function buildDataTableRow(IncidentSummaryData $incident): array
    {
        return [
            'id' => (int) $incident->id,
            'code' => $incident->code ?? "#{$incident->id}",
            'title' => $incident->title ?? 'Sin titulo',
            'category' => $incident->category?->name ?? '-',
            'priority' => $incident->priority?->name ?? '-',
            'state' => $incident->state?->name ?? '-',
            'territory' => $this->territoryLabel($incident),
            'created_at' => $incident->createdAt,
        ];
    }

    private function territoryLabel(IncidentSummaryData $incident): string
    {
        $tu = $incident->territorialUnit;

        if ($tu !== null && ! empty($tu->fullPath)) {
            return $tu->fullPath;
        }

        if ($tu !== null && ! empty($tu->name)) {
            return $tu->name;
        }

        if (! empty($incident->address)) {
            return $incident->address;
        }

        return '-';
    }

    private function rules(bool $partial = false, bool $allowPriority = true): array
    {
        $required = $partial ? 'sometimes' : 'required';
        $nullable = $partial ? ['sometimes', 'nullable'] : ['nullable'];
        $priorityRules = $allowPriority
            ? [$partial ? 'sometimes' : 'nullable', 'nullable', 'integer', Rule::exists(Priority::class, 'id')]
            : ['prohibited'];

        return [
            'title' => [$required, 'string', 'max:200'],
            'description' => [$required, 'string'],
            'category_id' => [$required, 'integer', Rule::exists(Category::class, 'id')],
            'subcategory_id' => [...$nullable, 'integer', Rule::exists(Subcategory::class, 'id')],
            'priority_id' => $priorityRules,
            'state_id' => ['prohibited'],
            'territorial_unit_id' => [...$nullable, 'integer', Rule::exists(TerritorialUnit::class, 'id')->where('is_active', true)],
            'address' => [...$nullable, 'string', 'max:500'],
            'address_reference' => [...$nullable, 'string', 'max:500'],
            'latitude' => [...$nullable, 'numeric', 'between:-90,90'],
            'longitude' => [...$nullable, 'numeric', 'between:-180,180'],
            'resolution_date' => [...$nullable, 'date'],
        ];
    }

    /**
     * @return array<int, string>
     */
    private function presentUpdateFields(Request $request): array
    {
        $fieldMap = [
            'title' => 'title',
            'description' => 'description',
            'category_id' => 'categoryId',
            'priority_id' => 'priorityId',
            'subcategory_id' => 'subcategoryId',
            'address' => 'address',
            'address_reference' => 'address',
            'latitude' => 'latitude',
            'longitude' => 'longitude',
            'territorial_unit_id' => 'territorialUnitId',
            'resolution_date' => 'resolutionDate',
        ];

        $presentFields = [];

        foreach ($fieldMap as $requestField => $dtoField) {
            if ($request->exists($requestField) && ! in_array($dtoField, $presentFields, true)) {
                $presentFields[] = $dtoField;
            }
        }

        return $presentFields;
    }

    private function visibleIncidentDetail(User $user, IncidentDetailData $detail): IncidentDetailData
    {
        if ($this->can($user, 'comments.internal')) {
            return $detail;
        }

        return new IncidentDetailData(
            id: $detail->id,
            code: $detail->code,
            title: $detail->title,
            description: $detail->description,
            address: $detail->address,
            latitude: $detail->latitude,
            longitude: $detail->longitude,
            dueDate: $detail->dueDate,
            resolutionDate: $detail->resolutionDate,
            reopenedAt: $detail->reopenedAt,
            previousResolutionDate: $detail->previousResolutionDate,
            rejectedAt: $detail->rejectedAt,
            createdAt: $detail->createdAt,
            reporterUserId: $detail->reporterUserId,
            assigneeUserId: $detail->assigneeUserId,
            stateId: $detail->stateId,
            state: $detail->state,
            category: $detail->category,
            subcategory: $detail->subcategory,
            priority: $detail->priority,
            territorialUnit: $detail->territorialUnit,
            reporter: $detail->reporter,
            assignedOperator: $detail->assignedOperator,
            sla: $detail->sla,
            history: $detail->history,
            comments: array_values(array_filter(
                $detail->comments,
                fn ($comment) => ! $comment->isInternal
            )),
            attachments: $detail->attachments,
            assignments: $detail->assignments,
        );
    }

    private function validationMessages(): array
    {
        return [
            'priority_id.prohibited' => 'No puedes asignar la prioridad de una incidencia.',
            'state_id.prohibited' => 'No puedes asignar el estado desde este formulario.',
        ];
    }
}
