<?php

namespace App\Incidents\Domain\States;

final class RejectedIncidentState extends AbstractIncidentStateBehavior
{
    public function type(): IncidentStateType
    {
        return IncidentStateType::Rejected;
    }

    public function countsAsActiveWorkload(): bool
    {
        return false;
    }
}
