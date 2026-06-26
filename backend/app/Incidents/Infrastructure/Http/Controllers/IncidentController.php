<?php

namespace App\Incidents\Infrastructure\Http\Controllers;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Application\DTOs\AddCommentInputData;
use App\Incidents\Application\DTOs\ChangeStateInputData;
use App\Incidents\Application\DTOs\IncidentFiltersData;
use App\Incidents\Application\DTOs\StoreIncidentInputData;
use App\Incidents\Application\DTOs\UpdateIncidentInputData;
use App\Incidents\Application\UseCases\IncidentUseCase;
use App\Incidents\Domain\Exceptions\IncidentException;
use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\City;
use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\Subcategory;
use App\Shared\Application\DTOs\UploadedFileData;
use App\Shared\Infrastructure\Http\Controllers\ApiController;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * @group Incidencias
 *
 * APIs para la gestión del ciclo de vida de las incidencias reportadas.
 */
class IncidentController extends ApiController
{
    public function __construct(private IncidentUseCase $incidentUseCase)
    {
    }

    /**
     * Listar incidencias.
     *
     * Devuelve una lista paginada de incidencias según filtros.
     *
     * @authenticated
     * @queryParam state_id int Filtrar por ID de estado. Example: 1
     * @queryParam priority_id int Filtrar por ID de prioridad. Example: 2
     * @queryParam category_id int Filtrar por ID de categoría. Example: 3
     * @queryParam city_id int Filtrar por ID de ciudad. Example: 10
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
            'city_id' => ['nullable', 'integer', Rule::exists(City::class, 'id')],
            'mine' => ['nullable', 'boolean'],
            'assigned_to_me' => ['nullable', 'boolean'],
            'overdue' => ['nullable', 'boolean'],
            'search' => ['nullable', 'string', 'max:120'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'radio_km' => ['nullable', 'numeric', 'min:0.1', 'max:200'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $filtersDto = new IncidentFiltersData(
            stateId: $filters['state_id'] ?? null,
            priorityId: $filters['priority_id'] ?? null,
            categoryId: $filters['category_id'] ?? null,
            cityId: $filters['city_id'] ?? null,
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
     * Crear incidencia.
     *
     * Reporta una nueva incidencia en el sistema.
     *
     * @authenticated
     * @bodyParam title string required Título de la incidencia. Example: Fuga de agua en la avenida principal
     * @bodyParam description string required Descripción detallada. Example: Hay una fuga inmensa que está rompiendo el asfalto.
     * @bodyParam category_id int required ID de la categoría principal. Example: 1
     * @bodyParam subcategory_id int ID de la subcategoría. Example: 2
     * @bodyParam priority_id int required ID de prioridad. Example: 3
     * @bodyParam city_id int required ID de ciudad donde ocurre. Example: 10
     * @bodyParam address string Dirección física. Example: Av. 10 de Agosto y Patria
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

        $data = $request->validate($this->rules());

        $dto = new StoreIncidentInputData(
            title: $data['title'],
            description: $data['description'],
            categoryId: $data['category_id'],
            priorityId: $data['priority_id'],
            cityId: $data['city_id'],
            subcategoryId: $data['subcategory_id'] ?? null,
            address: $data['address'] ?? null,
            latitude: $data['latitude'] ?? null,
            longitude: $data['longitude'] ?? null,
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
     * @urlParam incident int required El ID de la incidencia. Example: 5
     */
    public function show(Request $request, Incident $incident): JsonResponse
    {
        $user = $request->user();
        if (! $this->canViewIncident($user, $incident)) {
            return $this->forbid();
        }

        $detail = $this->incidentUseCase->detail($incident->id);

        if (! $this->can($user, 'comments.internal')) {
            $filteredComments = array_values(array_filter(
                $detail->comments,
                fn ($comment) => ! $comment->isInternal
            ));

            $detail = new \App\Incidents\Application\DTOs\IncidentDetailData(
                id: $detail->id,
                code: $detail->code,
                title: $detail->title,
                description: $detail->description,
                address: $detail->address,
                latitude: $detail->latitude,
                longitude: $detail->longitude,
                resolutionDate: $detail->resolutionDate,
                createdAt: $detail->createdAt,
                reporterUserId: $detail->reporterUserId,
                assigneeUserId: $detail->assigneeUserId,
                stateId: $detail->stateId,
                state: $detail->state,
                category: $detail->category,
                subcategory: $detail->subcategory,
                priority: $detail->priority,
                city: $detail->city,
                history: $detail->history,
                comments: $filteredComments,
                attachments: $detail->attachments,
                assignments: $detail->assignments,
            );
        }

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
     * @urlParam incident int required El ID de la incidencia. Example: 5
     * @bodyParam title string Título de la incidencia. Example: Fuga de agua reparada parcialmente
     * @bodyParam description string Descripción detallada.
     * @bodyParam category_id int ID de la categoría principal.
     * @bodyParam priority_id int ID de prioridad.
     * @bodyParam city_id int ID de ciudad donde ocurre.
     */
    public function update(Request $request, Incident $incident): JsonResponse
    {
        $user = $request->user();
        if (! $this->canViewIncident($user, $incident) || ! $this->can($user, 'incidents.edit')) {
            return $this->forbid();
        }

        $data = $request->validate($this->rules(partial: true));

        $dto = new UpdateIncidentInputData(
            title: $data['title'] ?? null,
            description: $data['description'] ?? null,
            categoryId: $data['category_id'] ?? null,
            priorityId: $data['priority_id'] ?? null,
            cityId: $data['city_id'] ?? null,
            subcategoryId: $data['subcategory_id'] ?? null,
            address: $data['address'] ?? null,
            latitude: $data['latitude'] ?? null,
            longitude: $data['longitude'] ?? null,
            resolutionDate: $data['resolution_date'] ?? null
        );

        try {
            return response()->json([
                'message' => 'Incidencia actualizada correctamente.',
                'data' => $this->incidentUseCase->update($incident->id, $dto),
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
     * @urlParam incident int required El ID de la incidencia. Example: 5
     */
    public function destroy(Request $request, Incident $incident): JsonResponse
    {
        if (! $this->can($request->user(), 'incidents.delete')) {
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
     * @authenticated
     * @urlParam incident int required El ID de la incidencia. Example: 5
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
     * @authenticated
     * @urlParam incident int required El ID de la incidencia. Example: 5
     * @bodyParam file file required El archivo a subir.
     */
    public function addAttachment(Request $request, Incident $incident): JsonResponse
    {
        $user = $request->user();
        if (! $this->canViewIncident($user, $incident)) {
            return $this->forbid();
        }

        $data = $request->validate([
            'file' => ['required', 'file', 'max:10240', 'mimes:jpg,jpeg,png,pdf,doc,docx,mp4,mov,zip'],
        ]);

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
     * @authenticated
     * @urlParam incident int required El ID de la incidencia. Example: 5
     * @bodyParam user_id int required El ID del usuario a asignar. Example: 2
     */
    public function assign(Request $request, Incident $incident): JsonResponse
    {
        $user = $request->user();
        if (! $this->can($user, 'incidents.assign')) {
            return $this->forbid();
        }

        $data = $request->validate([
            'user_id' => ['required', 'integer', Rule::exists(User::class, 'id')],
        ]);

        $asignacion = $this->incidentUseCase->assign($incident->id, $user->id, $data['user_id']);

        return response()->json([
            'message' => 'Incidencia asignada correctamente.',
            'data' => $asignacion,
        ], 201);
    }

    /**
     * Cambiar estado.
     *
     * Transiciona la incidencia a un nuevo estado, verificando que la transición sea válida.
     *
     * @group Estados de incidencia
     * @authenticated
     * @urlParam incident int required El ID de la incidencia. Example: 5
     * @bodyParam state_id int required El ID del nuevo estado. Example: 2
     * @bodyParam comment string Comentario opcional explicando el cambio. Example: Se verificó la fuga y se procedió a cerrar la válvula.
     */
    public function changeState(Request $request, Incident $incident): JsonResponse
    {
        $user = $request->user();
        if (! $this->can($user, 'incidents.edit')) {
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
                'data' => $this->incidentUseCase->changeState($incident->id, $user->id, $roles, $dto),
            ]);
        } catch (IncidentException $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode());
        }
    }

    private function rules(bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';

        return [
            'title' => [$required, 'string', 'max:200'],
            'description' => [$required, 'string'],
            'category_id' => [$required, 'integer', Rule::exists(Category::class, 'id')],
            'subcategory_id' => ['nullable', 'integer', Rule::exists(Subcategory::class, 'id')],
            'priority_id' => [$required, 'integer', Rule::exists(Priority::class, 'id')],
            'city_id' => [$required, 'integer', Rule::exists(City::class, 'id')],
            'address' => ['nullable', 'string', 'max:255'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'resolution_date' => ['nullable', 'date'],
        ];
    }
}
