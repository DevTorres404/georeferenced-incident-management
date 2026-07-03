<?php

namespace App\Incidents\Infrastructure\Persistence\Mappers;

use App\Incidents\Application\DTOs\AssignmentData;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAssignment;

final class AssignmentMapper
{
    public function __construct(private UserSummaryMapper $userSummaryMapper)
    {
    }

    public function fromModel(IncidentAssignment $assignment): AssignmentData
    {
        return new AssignmentData(
            id: (int) $assignment->id,
            incidentId: (int) $assignment->incident_id,
            userId: (int) $assignment->user_id,
            assignedById: $assignment->assigned_by_id ? (int) $assignment->assigned_by_id : null,
            assignmentRole: (string) ($assignment->assignment_role ?? 'primary'),
            active: (bool) ($assignment->active ?? $assignment->isActive()),
            assignmentDate: $assignment->assignment_date?->toIso8601String(),
            unassignmentDate: $assignment->unassignment_date?->toIso8601String(),
            user: $assignment->relationLoaded('user') && $assignment->user
                ? $this->userSummaryMapper->fromModel($assignment->user)
                : null,
            assignedBy: $assignment->relationLoaded('assignedBy') && $assignment->assignedBy
                ? $this->userSummaryMapper->fromModel($assignment->assignedBy)
                : null
        );
    }
}
