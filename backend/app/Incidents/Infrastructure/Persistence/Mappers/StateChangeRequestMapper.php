<?php

namespace App\Incidents\Infrastructure\Persistence\Mappers;

use App\Incidents\Application\DTOs\StateChangeRequestData;
use App\Incidents\Infrastructure\Persistence\Models\StateChangeRequest;

final class StateChangeRequestMapper
{
    public function fromModel(StateChangeRequest $stateChangeRequest): StateChangeRequestData
    {
        return new StateChangeRequestData(
            id: (int) $stateChangeRequest->id,
            incidentId: (int) $stateChangeRequest->incident_id,
            requestedByUserId: (int) $stateChangeRequest->requested_by_user_id,
            requestedByUserName: $stateChangeRequest->relationLoaded('requestedBy') && $stateChangeRequest->requestedBy
                ? $stateChangeRequest->requestedBy->getNombreCompletoAttribute()
                : "Usuario #{$stateChangeRequest->requested_by_user_id}",
            requestedStateId: (int) $stateChangeRequest->requested_state_id,
            requestedStateName: $stateChangeRequest->relationLoaded('requestedState') && $stateChangeRequest->requestedState
                ? $stateChangeRequest->requestedState->name
                : "Estado #{$stateChangeRequest->requested_state_id}",
            reason: $stateChangeRequest->reason,
            status: $stateChangeRequest->status,
            reviewedByUserId: $stateChangeRequest->reviewed_by_user_id ? (int) $stateChangeRequest->reviewed_by_user_id : null,
            reviewedByUserName: $stateChangeRequest->reviewed_by_user_id
                ? ($stateChangeRequest->relationLoaded('reviewedBy') && $stateChangeRequest->reviewedBy
                    ? $stateChangeRequest->reviewedBy->getNombreCompletoAttribute()
                    : "Usuario #{$stateChangeRequest->reviewed_by_user_id}")
                : null,
            reviewerComment: $stateChangeRequest->reviewer_comment,
            createdAt: $stateChangeRequest->created_at?->toIso8601String() ?? now()->toIso8601String(),
            reviewedAt: $stateChangeRequest->reviewed_at?->toIso8601String(),
        );
    }
}
