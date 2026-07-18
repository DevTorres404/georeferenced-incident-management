<?php

namespace App\Incidents\Application\DTOs;

use JsonSerializable;

final class IncidentAssignmentBatchData implements JsonSerializable
{
    /**
     * @param  array<int, AssignmentData>  $assignments
     */
    public function __construct(
        public readonly int $incidentId,
        public readonly ?int $currentAssigneeUserId,
        public readonly array $assignments
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'incident_id' => $this->incidentId,
            'current_assignee_user_id' => $this->currentAssigneeUserId,
            'assignments' => $this->assignments,
        ];
    }
}
