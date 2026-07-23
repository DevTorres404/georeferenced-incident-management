<?php

namespace App\Incidents\Domain\States;

final class ResolvedIncidentState extends AbstractIncidentStateBehavior
{
    public function type(): IncidentStateType
    {
        return IncidentStateType::Resolved;
    }

    public function requiresPriority(): bool
    {
        return true;
    }
}
