<?php

namespace App\Incidents\Infrastructure\Persistence\Mappers;

use App\Incidents\Domain\Entities\IncidentState;
use App\Incidents\Infrastructure\Persistence\Models\State;

final class IncidentStateMapper
{
    public function fromModel(?State $state): ?IncidentState
    {
        if (! $state) {
            return null;
        }

        return new IncidentState(
            id: (int) $state->id,
            name: $state->name,
            allowsEdition: (bool) $state->allows_edition,
            isFinal: (bool) $state->is_final_state
        );
    }
}
