<?php

namespace App\Incidents\Domain\States;

final class IncidentStateBehaviorFactory
{
    public static function fromName(?string $name): IncidentStateBehavior
    {
        $type = IncidentStateType::fromPersistedName($name);

        return match ($type) {
            IncidentStateType::InProgress => new InProgressIncidentState,
            IncidentStateType::Resolved => new ResolvedIncidentState,
            IncidentStateType::Closed => new ClosedIncidentState,
            IncidentStateType::Rejected => new RejectedIncidentState,
            IncidentStateType::Cancelled => new InactiveIncidentState($type),
            default => new DefaultIncidentState($type),
        };
    }
}
