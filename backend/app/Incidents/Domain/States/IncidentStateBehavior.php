<?php

namespace App\Incidents\Domain\States;

interface IncidentStateBehavior
{
    public function type(): IncidentStateType;

    public function canBeAssigned(): bool;

    public function canRequestResolution(): bool;

    public function requiresPriority(): bool;

    public function countsAsActiveWorkload(): bool;

    public function movesToAssignedOnAssignment(): bool;
}
