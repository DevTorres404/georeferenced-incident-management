<?php

namespace App\Incidents\Domain\Entities;

use JsonSerializable;

final class Incident implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly ?string $code,
        public readonly ?string $title,
        public readonly ?string $description,
        public readonly int $reporterUserId,
        public readonly ?int $assigneeUserId,
        public readonly int $stateId,
        public readonly ?IncidentState $state
    ) {
    }

    public function canBeEdited(): bool
    {
        return $this->state?->allowsEdition ?? false;
    }

    public function canChangeTo(IncidentTransition $transition, array $roleCodes, ?string $comment): bool
    {
        if (! $transition->isAllowedForRoles($roleCodes)) {
            return false;
        }

        if ($transition->requiresComment && ($comment === null || trim($comment) === '')) {
            return false;
        }

        return true;
    }

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'title' => $this->title,
            'description' => $this->description,
            'reporter_user_id' => $this->reporterUserId,
            'assignee_user_id' => $this->assigneeUserId,
            'state_id' => $this->stateId,
            'state' => $this->state,
        ];
    }
}
