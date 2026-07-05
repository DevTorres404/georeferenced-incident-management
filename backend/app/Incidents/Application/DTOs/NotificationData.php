<?php

namespace App\Incidents\Application\DTOs;

use JsonSerializable;

final class NotificationData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly int $userId,
        public readonly ?int $incidentId,
        public readonly string $title,
        public readonly string $message,
        public readonly string $type,
        public readonly bool $isRead,
        public readonly ?string $readAt,
        public readonly ?string $createdAt
    ) {
    }

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'user_id' => $this->userId,
            'incident_id' => $this->incidentId,
            'title' => $this->title,
            'message' => $this->message,
            'type' => $this->type,
            'is_read' => $this->isRead,
            'read_at' => $this->readAt,
            'created_at' => $this->createdAt,
        ];
    }
}
