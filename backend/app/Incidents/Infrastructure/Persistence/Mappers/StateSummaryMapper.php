<?php

namespace App\Incidents\Infrastructure\Persistence\Mappers;

use App\Incidents\Application\DTOs\StateSummaryData;
use App\Incidents\Infrastructure\Persistence\Models\State;

final class StateSummaryMapper
{
    public function fromModel(State $state): StateSummaryData
    {
        return new StateSummaryData(
            id: (int) $state->id,
            name: $state->name,
            allowsEdition: (bool) $state->allows_edition,
            isFinalState: (bool) $state->is_final_state
        );
    }
}
