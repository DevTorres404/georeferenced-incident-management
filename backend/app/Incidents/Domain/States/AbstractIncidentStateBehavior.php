<?php

namespace App\Incidents\Domain\States;

abstract class AbstractIncidentStateBehavior implements IncidentStateBehavior
{
    public function canBeAssigned(): bool
    {
        return false;
    }

    public function canRequestResolution(): bool
    {
        return false;
    }

    public function requiresPriority(): bool
    {
        return false;
    }

    public function countsAsActiveWorkload(): bool
    {
        return true;
    }

    public function movesToAssignedOnAssignment(): bool
    {
        return false;
    }
}
