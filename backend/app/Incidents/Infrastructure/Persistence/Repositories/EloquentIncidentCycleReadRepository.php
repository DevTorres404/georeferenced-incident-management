<?php

namespace App\Incidents\Infrastructure\Persistence\Repositories;

use App\Incidents\Application\DTOs\IncidentCycleData;
use App\Incidents\Application\DTOs\IncidentCycleDetailData;
use App\Incidents\Application\DTOs\IncidentCycleTimelineData;
use App\Incidents\Application\DTOs\IncidentTimelineData;
use App\Incidents\Application\Ports\IncidentCycleReadRepositoryInterface;
use App\Incidents\Infrastructure\Persistence\Mappers\IncidentCycleReadMapper;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAttachment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentComment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentCycle;
use App\Incidents\Infrastructure\Persistence\Models\IncidentState;

final class EloquentIncidentCycleReadRepository implements IncidentCycleReadRepositoryInterface
{
    public function __construct(private IncidentCycleReadMapper $mapper) {}

    public function timeline(int $incidentId, bool $canSeeInternal): IncidentTimelineData
    {
        $incident = Incident::query()->with([
            'currentCycle',
            'cycles.openedBy', 'cycles.resolvedBy', 'cycles.closedBy',
            'stateHistory' => fn ($query) => $query->with(['previousState', 'newState', 'user'])->orderBy('created_at'),
            'comments' => fn ($query) => $query->with('user')->orderBy('created_at'),
            'attachments' => fn ($query) => $query->with('user'),
            'assignments' => fn ($query) => $query->with(['user', 'assignedBy'])->orderBy('assignment_date'),
        ])->findOrFail($incidentId);

        $cycles = $incident->cycles->map(function (IncidentCycle $cycle) use ($incident, $canSeeInternal): IncidentCycleTimelineData {
            $events = collect()
                ->merge($incident->stateHistory->where('incident_cycle_id', $cycle->id)->map(fn (IncidentState $state): array => [
                    'type' => 'state_change', 'date' => $state->created_at?->toISOString(),
                    'user' => $this->user($state->user), 'title' => 'Cambio de estado',
                    'description' => $state->comment ?? ($state->previousState?->name ?? 'Inicio').' -> '.($state->newState?->name ?? 'Desconocido'),
                    'cycle_id' => $cycle->id, 'cycle_number' => $cycle->cycle_number,
                ]))
                ->merge($incident->comments->filter(fn (IncidentComment $comment): bool => $comment->incident_cycle_id === $cycle->id && ($canSeeInternal || ! $comment->is_internal))->map(fn (IncidentComment $comment): array => [
                    'type' => 'comment', 'date' => $comment->created_at?->toISOString(),
                    'user' => $this->user($comment->user), 'title' => $comment->is_internal ? 'Comentario interno' : 'Comentario',
                    'description' => $comment->comment, 'metadata' => ['is_internal' => $comment->is_internal],
                    'cycle_id' => $cycle->id, 'cycle_number' => $cycle->cycle_number,
                ]))
                ->merge($incident->assignments->where('incident_cycle_id', $cycle->id)->map(fn ($assignment): array => [
                    'type' => 'assignment', 'date' => $assignment->assignment_date?->toISOString(),
                    'user' => $this->user($assignment->assignedBy), 'title' => 'Asignación',
                    'description' => ($assignment->user?->getNombreCompletoAttribute() ?? 'Usuario').' asignado como '.($assignment->assignment_role === 'primary' ? 'principal' : 'soporte'),
                    'metadata' => ['role' => $assignment->assignment_role, 'active' => $assignment->active],
                    'cycle_id' => $cycle->id, 'cycle_number' => $cycle->cycle_number,
                ]))
                ->merge($incident->attachments->where('incident_cycle_id', $cycle->id)->map(fn (IncidentAttachment $attachment): array => [
                    'type' => 'attachment', 'date' => $attachment->created_at?->toISOString(),
                    'user' => $this->user($attachment->user), 'title' => 'Archivo adjunto', 'description' => $attachment->original_name,
                    'metadata' => ['mime_type' => $attachment->mime_type, 'size' => $attachment->file_size_bytes],
                    'cycle_id' => $cycle->id, 'cycle_number' => $cycle->cycle_number,
                ]))
                ->sortBy('date')->values()->all();

            return new IncidentCycleTimelineData($this->mapper->cycle($cycle), $events);
        })->all();

        return new IncidentTimelineData((int) $incident->id, $incident->currentCycle?->cycle_number, $cycles);
    }

    public function list(int $incidentId): array
    {
        return IncidentCycle::query()->with(['openedBy', 'resolvedBy', 'closedBy'])
            ->where('incident_id', $incidentId)->orderBy('cycle_number')->get()
            ->map(fn (IncidentCycle $cycle): IncidentCycleData => $this->mapper->cycle($cycle))->all();
    }

    public function detail(int $incidentId, int $cycleId, bool $canSeeInternal): IncidentCycleDetailData
    {
        $cycle = IncidentCycle::query()->with(['openedBy', 'resolvedBy', 'closedBy'])
            ->where('incident_id', $incidentId)->findOrFail($cycleId);

        $stateHistory = IncidentState::query()->with(['previousState', 'newState', 'user'])
            ->where('incident_id', $incidentId)->where('incident_cycle_id', $cycle->id)->orderBy('created_at')->get()
            ->map(fn (IncidentState $state): array => [
                'previous_state' => $state->previousState?->name, 'new_state' => $state->newState?->name,
                'changed_by' => $state->user?->getNombreCompletoAttribute(), 'comment' => $state->comment,
                'created_at' => $state->created_at?->toISOString(),
            ])->all();
        $comments = IncidentComment::query()->with('user')->where('incident_id', $incidentId)->where('incident_cycle_id', $cycle->id)->orderBy('created_at')->get()
            ->filter(fn (IncidentComment $comment): bool => $canSeeInternal || ! $comment->is_internal)->values()
            ->map(fn (IncidentComment $comment): array => ['id' => $comment->id, 'user' => $comment->user?->getNombreCompletoAttribute(), 'comment' => $comment->comment, 'is_internal' => $comment->is_internal, 'created_at' => $comment->created_at?->toISOString()])->all();
        $attachments = IncidentAttachment::query()->with('user')->where('incident_id', $incidentId)->where('incident_cycle_id', $cycle->id)->get()
            ->map(fn (IncidentAttachment $attachment): array => ['id' => $attachment->id, 'name' => $attachment->original_name, 'mime_type' => $attachment->mime_type, 'size' => $attachment->file_size_bytes, 'uploaded_by' => $attachment->user?->getNombreCompletoAttribute(), 'created_at' => $attachment->created_at?->toISOString()])->all();

        return new IncidentCycleDetailData($this->mapper->cycle($cycle), $this->mapper->snapshot($cycle->snapshot, $canSeeInternal), $stateHistory, $comments, $attachments);
    }

    private function user(?object $user): ?array
    {
        return $user ? ['id' => $user->id, 'name' => $user->getNombreCompletoAttribute()] : null;
    }
}
