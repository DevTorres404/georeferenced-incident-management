<?php

namespace App\Incidents\Infrastructure\Persistence\Mappers;

use App\Incidents\Domain\Entities\IncidentTransition;
use App\Incidents\Infrastructure\Persistence\Models\StateTransition;

final class IncidentTransitionMapper
{
    public function fromModel(?StateTransition $transition): ?IncidentTransition
    {
        if (! $transition) {
            return null;
        }

        return new IncidentTransition(
            fromStateId: (int) $transition->source_state_id,
            toStateId: (int) $transition->target_state_id,
            requiresComment: (bool) $transition->requires_comment,
            allowedRoleCodes: array_values($transition->allowed_roles ?? [])
        );
    }
}
