<?php

namespace App\Incidents\Infrastructure\Persistence\Mappers;

use App\Incidents\Application\DTOs\CategorySummaryData;
use App\Incidents\Application\DTOs\IncidentDetailData;
use App\Incidents\Application\DTOs\PrioritySummaryData;
use App\Incidents\Application\DTOs\TerritorialUnitSummaryData;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Operations\Infrastructure\Persistence\Models\OperatorProfile;
use App\Operations\Infrastructure\Persistence\Models\SupervisorOperatorAssignment;
use Carbon\Carbon;

final class IncidentDetailMapper
{
    public function __construct(
        private StateSummaryMapper $stateSummaryMapper,
        private IncidentSummaryMapper $incidentSummaryMapper,
        private IncidentHistoryEntryMapper $historyEntryMapper,
        private CommentMapper $commentMapper,
        private AttachmentMapper $attachmentMapper,
        private AssignmentMapper $assignmentMapper
    ) {}

    public function fromModel(Incident $incident): IncidentDetailData
    {
        $reporter = null;
        if ($incident->relationLoaded('reporter') && $incident->reporter) {
            $reporter = [
                'name' => $incident->reporter->first_name.' '.$incident->reporter->last_name,
                'email' => $incident->reporter->email,
                'phone' => $incident->reporter->phone ?? 'Sin registro',
                'type' => $incident->reporter->tieneRol('OPERADOR') ? 'Operador' : 'Ciudadano',
            ];
        }

        $assignedOperator = null;
        if ($incident->relationLoaded('currentAssignee') && $incident->currentAssignee) {
            $op = $incident->currentAssignee;
            $profile = OperatorProfile::where('user_id', $op->id)->first();
            $assignment = SupervisorOperatorAssignment::where('operator_user_id', $op->id)->active()->first();
            $supervisor = $assignment ? $assignment->supervisor : null;

            $assignedOperator = [
                'name' => $op->first_name.' '.$op->last_name,
                'supervisor_name' => $supervisor ? ($supervisor->first_name.' '.$supervisor->last_name) : 'Sin supervisor',
                'active_incidents_count' => Incident::where('current_assigned_id', $op->id)
                    ->whereNotIn('state_id', [4, 5, 6, 7]) // Assuming typical closed states
                    ->count(),
                'workload_points' => 0, // Simplified for this view, or calculate if needed
                'max_workload_points' => $profile ? $profile->max_workload_points : 20,
            ];
        }

        $sla = null;
        if ($incident->priority && $incident->created_at) {
            $now = Carbon::now();
            $maxTimeHours = $incident->priority->sla_hours ?? 24;
            $dueDate = $incident->due_date ?? clone $incident->created_at->addHours($maxTimeHours);

            $elapsedMinutes = $incident->created_at->diffInMinutes($now);
            $elapsedStr = floor($elapsedMinutes / 60).'h '.($elapsedMinutes % 60).'min';

            $status = $now->greaterThan($dueDate) ? 'Fuera de tiempo' : 'Dentro del tiempo';
            if ($incident->resolution_date) {
                $status = 'Completado';
            }

            $lastStateChange = $incident->updated_at;
            if ($incident->relationLoaded('stateHistory') && $incident->stateHistory->isNotEmpty()) {
                $lastStateChange = $incident->stateHistory->first()->created_at;
            }
            $timeInStateMinutes = $lastStateChange->diffInMinutes($now);
            $timeInStateStr = floor($timeInStateMinutes / 60).'h '.($timeInStateMinutes % 60).'min';

            $sla = [
                'max_time' => $maxTimeHours.'h',
                'elapsed_time' => $elapsedStr,
                'status' => $status,
                'time_in_state' => $timeInStateStr,
            ];
        }

        return new IncidentDetailData(
            id: (int) $incident->id,
            code: $incident->code,
            title: $incident->title,
            description: $incident->description,
            address: $incident->address_reference ?: $incident->address,
            latitude: $incident->latitude !== null ? (string) $incident->latitude : null,
            longitude: $incident->longitude !== null ? (string) $incident->longitude : null,
            dueDate: $incident->due_date?->toIso8601String(),
            resolutionDate: $incident->resolution_date?->toIso8601String(),
            reopenedAt: $incident->reopened_at?->toIso8601String(),
            previousResolutionDate: $incident->previous_resolution_date?->toIso8601String(),
            rejectedAt: $incident->rejected_at?->toIso8601String(),
            createdAt: $incident->created_at?->toIso8601String(),
            reporterUserId: (int) $incident->reported_by_id,
            assigneeUserId: $incident->current_assigned_id ? (int) $incident->current_assigned_id : null,
            stateId: (int) $incident->state_id,
            state: $incident->relationLoaded('state') && $incident->state
                ? $this->stateSummaryMapper->fromModel($incident->state)
                : null,
            category: $incident->relationLoaded('category') && $incident->category
                ? new CategorySummaryData((int) $incident->category->id, $incident->category->name)
                : null,
            subcategory: $incident->relationLoaded('subcategory') && $incident->subcategory
                ? new CategorySummaryData((int) $incident->subcategory->id, $incident->subcategory->name)
                : null,
            priority: $incident->relationLoaded('priority') && $incident->priority
                ? new PrioritySummaryData((int) $incident->priority->id, $incident->priority->name, (int) $incident->priority->level)
                : null,
            territorialUnit: $incident->relationLoaded('territorialUnit') && $incident->territorialUnit
                ? new TerritorialUnitSummaryData(
                    (int) $incident->territorialUnit->id,
                    $incident->territorialUnit->name,
                    $incident->territorialUnit->type,
                    $incident->territorialUnit->full_path
                )
                : null,
            reporter: $reporter,
            assignedOperator: $assignedOperator,
            sla: $sla,
            history: $incident->relationLoaded('stateHistory')
                ? $incident->stateHistory->map(fn ($item) => $this->historyEntryMapper->fromModel($item))->all()
                : [],
            comments: $incident->relationLoaded('comments')
                ? $incident->comments->map(fn ($item) => $this->commentMapper->fromModel($item))->all()
                : [],
            attachments: $incident->relationLoaded('attachments')
                ? $incident->attachments->map(fn ($item) => $this->attachmentMapper->fromModel($item))->all()
                : [],
            assignments: $incident->relationLoaded('assignments') && $incident->assignments
                ? $incident->assignments->map(fn ($assignment) => $this->assignmentMapper->fromModel($assignment))->toArray()
                : [],
            cycles: $incident->relationLoaded('cycles') && $incident->cycles
                ? $incident->cycles->map(fn ($cycle) => [
                    'id' => $cycle->id,
                    'cycle_number' => $cycle->cycle_number,
                    'opened_at' => $cycle->opened_at?->toIso8601String(),
                    'opened_by' => $cycle->openedBy ? $cycle->openedBy->getNombreCompletoAttribute() : null,
                    'reopening_reason' => $cycle->reopening_reason,
                    'resolved_at' => $cycle->resolved_at?->toIso8601String(),
                    'resolved_by' => $cycle->resolvedBy ? $cycle->resolvedBy->getNombreCompletoAttribute() : null,
                    'resolution_description' => $cycle->resolution_description,
                    'closed_at' => $cycle->closed_at?->toIso8601String(),
                    'closed_by' => $cycle->closedBy ? $cycle->closedBy->getNombreCompletoAttribute() : null,
                    'closure_reason' => $cycle->closure_reason,
                ])->toArray()
                : []
        );
    }
}
