<?php

namespace App\Incidents\Infrastructure\Persistence\Mappers;

use App\Incidents\Application\DTOs\IncidentHistoryEntryData;
use App\Incidents\Infrastructure\Persistence\Models\IncidentState;

final class IncidentHistoryEntryMapper
{
    public function __construct(private UserSummaryMapper $userSummaryMapper) {}

    public function fromModel(IncidentState $history): IncidentHistoryEntryData
    {
        return new IncidentHistoryEntryData(
            id: (int) $history->id,
            previousStateId: $history->previous_state_id ? (int) $history->previous_state_id : null,
            previousStateName: $history->relationLoaded('previousState') ? $history->previousState?->name : null,
            newStateId: (int) $history->new_state_id,
            newStateName: $history->relationLoaded('newState') ? $history->newState?->name : null,
            newStateColor: $history->relationLoaded('newState') ? $history->newState?->color : null,
            userId: (int) $history->user_id,
            comment: $history->comment,
            createdAt: $history->created_at?->toIso8601String(),
            user: $history->relationLoaded('user') && $history->user
                ? $this->userSummaryMapper->fromModel($history->user)
                : null
        );
    }
}
