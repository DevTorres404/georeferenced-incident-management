<?php

namespace App\Catalogs\Application\DTOs;

use JsonSerializable;

/**
 * Data Transfer Object para Transición de Estados.
 *
 * Define qué cambios de estado son válidos en el flujo de incidencias.
 */
final class StateTransitionData implements JsonSerializable
{
    /**
     * @param  array<int, string>  $allowedRoles
     */
    public function __construct(
        public readonly int $id,
        public readonly int $sourceStateId,
        public readonly ?string $sourceStateName,
        public readonly int $targetStateId,
        public readonly ?string $targetStateName,
        public readonly bool $requiresComment,
        public readonly array $allowedRoles,
        public readonly bool $isActive
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'source_state_id' => $this->sourceStateId,
            'source_state_name' => $this->sourceStateName,
            'target_state_id' => $this->targetStateId,
            'target_state_name' => $this->targetStateName,
            'requires_comment' => $this->requiresComment,
            'allowed_roles' => $this->allowedRoles,
            'is_active' => $this->isActive,
        ];
    }
}
