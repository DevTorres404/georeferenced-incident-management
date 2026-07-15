<?php

namespace App\Catalogs\Infrastructure\Persistence\Mappers;

use App\Catalogs\Application\DTOs\StateData;
use App\Incidents\Infrastructure\Persistence\Models\State;

final class StateMapper
{
    public function fromModel(State $state): StateData
    {
        return new StateData(
            id: (int) $state->id,
            code: str($state->name)->upper()->replace(' ', '_')->toString(),
            name: $state->name,
            color: $state->color,
            order: (int) $state->order,
            isInitialState: (bool) $state->is_initial_state,
            isFinalState: (bool) $state->is_final_state
        );
    }
}
