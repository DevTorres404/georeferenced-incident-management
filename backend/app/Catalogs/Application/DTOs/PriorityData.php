<?php

namespace App\Catalogs\Application\DTOs;

use JsonSerializable;

/**
 * Data Transfer Object para Prioridad de Incidencia.
 *
 * Define niveles de prioridad con SLA en horas.
 */
final class PriorityData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly int $level,
        public readonly ?string $color,
        public readonly int $slaHours,
        public readonly int $weight,
        public readonly bool $isActive
    ) {
    }

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'level' => $this->level,
            'color' => $this->color,
            'sla_hours' => $this->slaHours,
            'weight' => $this->weight,
            'is_active' => $this->isActive,
        ];
    }
}
