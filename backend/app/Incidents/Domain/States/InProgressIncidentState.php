<?php

namespace App\Incidents\Domain\States;

final class InProgressIncidentState extends AbstractIncidentStateBehavior
{
    public function type(): IncidentStateType
    {
        return IncidentStateType::InProgress;
    }

    public function canBeAssigned(): bool
    {
        return true;
    }

    public function canRequestResolution(): bool
    {
        return true;
    }

    public function requiresPriority(): bool
    {
        return true;
    }
}
