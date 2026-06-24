<?php

namespace App\Incidents\Infrastructure\Persistence\Mappers;

use App\Incidents\Application\DTOs\CategorySummaryData;
use App\Incidents\Application\DTOs\IncidentDetailData;
use App\Incidents\Application\DTOs\PrioritySummaryData;
use App\Incidents\Infrastructure\Persistence\Models\Incident;

final class IncidentDetailMapper
{
    public function __construct(
        private StateSummaryMapper $stateSummaryMapper,
        private IncidentSummaryMapper $incidentSummaryMapper,
        private IncidentHistoryEntryMapper $historyEntryMapper,
        private CommentMapper $commentMapper,
        private AttachmentMapper $attachmentMapper,
        private AssignmentMapper $assignmentMapper
    ) {
    }

    public function fromModel(Incident $incident): IncidentDetailData
    {
        return new IncidentDetailData(
            id: (int) $incident->id,
            code: $incident->code,
            title: $incident->title,
            description: $incident->description,
            address: $incident->address,
            latitude: $incident->latitude !== null ? (string) $incident->latitude : null,
            longitude: $incident->longitude !== null ? (string) $incident->longitude : null,
            resolutionDate: $incident->resolution_date?->toIso8601String(),
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
            city: $this->incidentSummaryMapper->mapCity($incident),
            history: $incident->relationLoaded('stateHistory')
                ? $incident->stateHistory->map(fn ($item) => $this->historyEntryMapper->fromModel($item))->all()
                : [],
            comments: $incident->relationLoaded('comments')
                ? $incident->comments->map(fn ($item) => $this->commentMapper->fromModel($item))->all()
                : [],
            attachments: $incident->relationLoaded('attachments')
                ? $incident->attachments->map(fn ($item) => $this->attachmentMapper->fromModel($item))->all()
                : [],
            assignments: $incident->relationLoaded('assignments')
                ? $incident->assignments->map(fn ($item) => $this->assignmentMapper->fromModel($item))->all()
                : []
        );
    }
}
