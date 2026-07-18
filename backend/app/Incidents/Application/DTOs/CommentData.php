<?php

namespace App\Incidents\Application\DTOs;

use JsonSerializable;

final class CommentData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly int $incidentId,
        public readonly int $userId,
        public readonly string $comment,
        public readonly bool $isInternal,
        public readonly ?string $createdAt,
        public readonly ?UserSummaryData $user = null
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'incident_id' => $this->incidentId,
            'user_id' => $this->userId,
            'comment' => $this->comment,
            'is_internal' => $this->isInternal,
            'created_at' => $this->createdAt,
            'user' => $this->user,
        ];
    }
}
