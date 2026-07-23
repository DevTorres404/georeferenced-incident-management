<?php

namespace App\Incidents\Domain\Entities;

use App\Incidents\Domain\States\IncidentStateBehavior;
use App\Incidents\Domain\States\IncidentStateBehaviorFactory;
use App\Incidents\Domain\States\IncidentStateType;
use JsonSerializable;

final class IncidentState implements JsonSerializable
{
    private readonly IncidentStateBehavior $behavior;

    public function __construct(
        public readonly int $id,
        public readonly ?string $name,
        public readonly bool $allowsEdition,
        public readonly bool $isFinal,
        ?IncidentStateBehavior $behavior = null
    ) {
        $this->behavior = $behavior ?? IncidentStateBehaviorFactory::fromName($name);
    }

    public function type(): IncidentStateType
    {
        return $this->behavior->type();
    }

    public function canBeAssigned(): bool
    {
        return $this->behavior->canBeAssigned();
    }

    public function canRequestResolution(): bool
    {
        return $this->behavior->canRequestResolution();
    }

    public function requiresPriority(): bool
    {
        return $this->behavior->requiresPriority();
    }

    public function countsAsActiveWorkload(): bool
    {
        return $this->behavior->countsAsActiveWorkload();
    }

    public function movesToAssignedOnAssignment(): bool
    {
        return $this->behavior->movesToAssignedOnAssignment();
    }

    public function is(IncidentStateType $type): bool
    {
        return $this->type() === $type;
    }

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'allows_edition' => $this->allowsEdition,
            'is_final_state' => $this->isFinal,
        ];
    }
}
