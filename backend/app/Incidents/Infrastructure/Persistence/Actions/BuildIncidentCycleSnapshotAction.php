<?php

namespace App\Incidents\Infrastructure\Persistence\Actions;

use App\Incidents\Infrastructure\Persistence\Models\IncidentAssignment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAttachment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentComment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentCycle;
use App\Incidents\Infrastructure\Persistence\Models\IncidentState;

final class BuildIncidentCycleSnapshotAction
{
    public function execute(IncidentCycle $cycle): array
    {
        $cycle->loadMissing(['incident.state', 'incident.priority', 'incident.territorialUnit', 'openedBy', 'resolvedBy', 'closedBy']);

        $incident = $cycle->incident;

        $snapshot = [
            'schema_version' => 1,
            'generated_at' => now()->toISOString(),
            'incident' => [
                'id' => $incident->id,
                'code' => $incident->code,
                'title' => $incident->title,
                'description' => $incident->description,
                'status' => $incident->state ? [
                    'id' => $incident->state->id,
                    'code' => strtoupper((string) $incident->state->name),
                    'name' => $incident->state->name,
                ] : null,
                'priority' => $incident->priority ? [
                    'id' => $incident->priority->id,
                    'code' => strtoupper((string) $incident->priority->name),
                    'name' => $incident->priority->name,
                ] : null,
                'severity' => null,
            ],
            'cycle' => [
                'id' => $cycle->id,
                'number' => $cycle->cycle_number,
                'opened_at' => $cycle->opened_at?->toISOString(),
                'opened_by' => $cycle->openedBy ? [
                    'id' => $cycle->openedBy->id,
                    'name' => $cycle->openedBy->getNombreCompletoAttribute(),
                ] : null,
                'reopening_reason' => $cycle->reopening_reason,
                'resolved_at' => $cycle->resolved_at?->toISOString(),
                'resolved_by' => $cycle->resolvedBy ? [
                    'id' => $cycle->resolvedBy->id,
                    'name' => $cycle->resolvedBy->getNombreCompletoAttribute(),
                ] : null,
                'resolution_description' => $cycle->resolution_description,
                'closed_at' => $cycle->closed_at?->toISOString(),
                'closed_by' => $cycle->closedBy ? [
                    'id' => $cycle->closedBy->id,
                    'name' => $cycle->closedBy->getNombreCompletoAttribute(),
                ] : null,
            ],
            'territorial_unit' => null,
            'location' => [
                'latitude' => $incident->latitude ? (float) $incident->latitude : null,
                'longitude' => $incident->longitude ? (float) $incident->longitude : null,
                'reference' => $incident->address_reference,
            ],
            'assignments' => IncidentAssignment::query()->with(['user', 'assignedBy'])->where('incident_id', $incident->id)->where('incident_cycle_id', $cycle->id)->get()->map(fn (IncidentAssignment $assignment) => [
                'id' => $assignment->id, 'user_id' => $assignment->user_id, 'user_name' => $assignment->user?->getNombreCompletoAttribute(), 'assigned_by_id' => $assignment->assigned_by_id, 'assigned_by_name' => $assignment->assignedBy?->getNombreCompletoAttribute(), 'assignment_role' => $assignment->assignment_role, 'assignment_date' => $assignment->assignment_date?->toISOString(), 'resolved_at' => $assignment->resolved_at?->toISOString(),
            ])->all(),
            'comments' => IncidentComment::query()->with('user')->where('incident_id', $incident->id)->where('incident_cycle_id', $cycle->id)->get()->map(fn (IncidentComment $comment) => [
                'id' => $comment->id, 'user_id' => $comment->user_id, 'user_name' => $comment->user?->getNombreCompletoAttribute(), 'comment' => $comment->comment, 'is_internal' => $comment->is_internal, 'created_at' => $comment->created_at?->toISOString(),
            ])->all(),
            'attachments' => IncidentAttachment::query()->with('user')->where('incident_id', $incident->id)->where('incident_cycle_id', $cycle->id)->get()->map(fn (IncidentAttachment $attachment) => [
                'id' => $attachment->id, 'file_name' => $attachment->original_name, 'mime_type' => $attachment->mime_type, 'file_size_bytes' => $attachment->file_size_bytes, 'uploaded_at' => $attachment->created_at?->toISOString(), 'uploaded_by' => $attachment->user_id, 'uploaded_by_name' => $attachment->user?->getNombreCompletoAttribute(),
            ])->all(),
            'status_history' => IncidentState::query()->with(['previousState', 'newState', 'user'])->where('incident_id', $incident->id)->where('incident_cycle_id', $cycle->id)->orderBy('created_at')->get()->map(fn (IncidentState $state) => [
                'id' => $state->id, 'previous_state_id' => $state->previous_state_id, 'previous_state_name' => $state->previousState?->name, 'new_state_id' => $state->new_state_id, 'new_state_name' => $state->newState?->name, 'changed_by' => $state->user_id, 'changed_by_name' => $state->user?->getNombreCompletoAttribute(), 'reason' => $state->comment, 'created_at' => $state->created_at?->toISOString(),
            ])->all(),
        ];

        if ($incident->relationLoaded('territorialUnit') && $incident->territorialUnit) {
            $territorialUnit = $incident->territorialUnit;
            $snapshot['territorial_unit'] = ['province' => $territorialUnit->province ?? null, 'canton' => $territorialUnit->canton ?? null, 'parish' => $territorialUnit->parish ?? null, 'sector' => $territorialUnit->name ?? null];
        }

        return $snapshot;
    }
}
