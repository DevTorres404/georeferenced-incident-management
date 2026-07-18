<?php

namespace App\Incidents\Infrastructure\Persistence\Mappers;

use App\Incidents\Domain\Entities\Incident;
use App\Incidents\Infrastructure\Persistence\Models\Incident as IncidentModel;

final class IncidentMapper
{
    public function __construct(private IncidentStateMapper $stateMapper) {}

    public function fromModel(IncidentModel $incident): Incident
    {
        return new Incident(
            id: (int) $incident->id,
            code: $incident->code,
            title: $incident->title,
            description: $incident->description,
            reporterUserId: (int) $incident->reported_by_id,
            assigneeUserId: $incident->current_assigned_id ? (int) $incident->current_assigned_id : null,
            stateId: (int) $incident->state_id,
            state: $this->stateMapper->fromModel($incident->state)
        );
    }
}
