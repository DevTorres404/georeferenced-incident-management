<?php

namespace App\Incidents\Application\DTOs;

use JsonSerializable;

final class AssignmentData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly int $incidentId,
        public readonly ?int $incidentCycleId,
        public readonly int $userId,
        public readonly ?int $assignedById,
        public readonly string $assignmentRole,
        public readonly bool $active,
        public readonly ?string $assignmentDate,
        public readonly ?string $unassignmentDate,
        public readonly ?string $resolvedAt = null,
        public readonly ?UserSummaryData $user = null,
        public readonly ?UserSummaryData $assignedBy = null
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'incident_id' => $this->incidentId,
            'incident_cycle_id' => $this->incidentCycleId,
            'user_id' => $this->userId,
            'assigned_by_id' => $this->assignedById,
            'assignment_role' => $this->assignmentRole,
            'active' => $this->active,
            'assignment_date' => $this->assignmentDate,
            'unassignment_date' => $this->unassignmentDate,
            'resolved_at' => $this->resolvedAt,
            'user' => $this->user,
            'assigned_by' => $this->assignedBy,
        ];
    }
}
