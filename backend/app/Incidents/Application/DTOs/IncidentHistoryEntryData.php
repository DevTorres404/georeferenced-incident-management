<?php

namespace App\Incidents\Application\DTOs;

use JsonSerializable;

final class IncidentHistoryEntryData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly ?int $previousStateId,
        public readonly ?string $previousStateName,
        public readonly int $newStateId,
        public readonly ?string $newStateName,
        public readonly int $userId,
        public readonly ?string $comment,
        public readonly ?string $createdAt,
        public readonly ?UserSummaryData $user = null
    ) {
    }

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'previous_state_id' => $this->previousStateId,
            'previous_state_name' => $this->previousStateName,
            'new_state_id' => $this->newStateId,
            'new_state_name' => $this->newStateName,
            'user_id' => $this->userId,
            'comment' => $this->comment,
            'created_at' => $this->createdAt,
            'user' => $this->user,
        ];
    }
}
