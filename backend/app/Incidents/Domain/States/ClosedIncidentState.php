<?php

namespace App\Incidents\Domain\States;

final class ClosedIncidentState extends AbstractIncidentStateBehavior
{
    public function type(): IncidentStateType
    {
        return IncidentStateType::Closed;
    }

    public function requiresPriority(): bool
    {
        return true;
    }

    public function countsAsActiveWorkload(): bool
    {
        return false;
    }
}
