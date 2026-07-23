<?php

namespace App\Incidents\Domain\States;

final class DefaultIncidentState extends AbstractIncidentStateBehavior
{
    public function __construct(private readonly IncidentStateType $stateType) {}

    public function type(): IncidentStateType
    {
        return $this->stateType;
    }

    public function movesToAssignedOnAssignment(): bool
    {
        return $this->stateType === IncidentStateType::Pending;
    }
}
