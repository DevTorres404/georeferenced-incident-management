<?php

namespace App\Catalogs\Infrastructure\Persistence\Mappers;

use App\Catalogs\Application\DTOs\StateTransitionData;
use App\Incidents\Infrastructure\Persistence\Models\StateTransition;

final class StateTransitionMapper
{
    public function fromModel(StateTransition $transition): StateTransitionData
    {
        $sourceStateName = null;
        $targetStateName = null;

        if ($transition->relationLoaded('sourceState')) {
            $sourceStateName = $transition->sourceState?->name;
        }

        if ($transition->relationLoaded('targetState')) {
            $targetStateName = $transition->targetState?->name;
        }

        return new StateTransitionData(
            id: (int) $transition->id,
            sourceStateId: (int) $transition->source_state_id,
            sourceStateName: $sourceStateName,
            targetStateId: (int) $transition->target_state_id,
            targetStateName: $targetStateName,
            requiresComment: (bool) $transition->requires_comment,
            allowedRoles: (array) ($transition->allowed_roles ?? []),
            isActive: (bool) $transition->is_active
        );
    }
}
