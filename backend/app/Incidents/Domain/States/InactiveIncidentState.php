<?php

namespace App\Incidents\Domain\States;

final class InactiveIncidentState extends AbstractIncidentStateBehavior
{
    public function __construct(private readonly IncidentStateType $stateType) {}

    public function type(): IncidentStateType
    {
        return $this->stateType;
    }

    public function countsAsActiveWorkload(): bool
    {
        return false;
    }
}
