<?php

namespace App\Incidents\Domain\Entities;

use JsonSerializable;

final class IncidentTransition implements JsonSerializable
{
    /**
     * @param array<int, string> $allowedRoleCodes
     */
    public function __construct(
        public readonly int $fromStateId,
        public readonly int $toStateId,
        public readonly bool $requiresComment,
        public readonly array $allowedRoleCodes = []
    ) {
    }

    /**
     * @param array<int, string> $roleCodes
     */
    public function isAllowedForRoles(array $roleCodes): bool
    {
        if ($this->allowedRoleCodes === []) {
            return true;
        }

        return array_intersect($roleCodes, $this->allowedRoleCodes) !== [];
    }

    public function jsonSerialize(): array
    {
        return [
            'estado_origen_id' => $this->fromStateId,
            'estado_destino_id' => $this->toStateId,
            'requiere_addCommentio' => $this->requiresComment,
            'roles_permitidos' => $this->allowedRoleCodes,
        ];
    }
}
