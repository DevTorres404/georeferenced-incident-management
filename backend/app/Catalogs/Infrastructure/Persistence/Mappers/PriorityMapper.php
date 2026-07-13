<?php

namespace App\Catalogs\Infrastructure\Persistence\Mappers;

use App\Catalogs\Application\DTOs\PriorityData;
use App\Incidents\Infrastructure\Persistence\Models\Priority;

final class PriorityMapper
{
    public function fromModel(Priority $priority): PriorityData
    {
        return new PriorityData(
            id: (int) $priority->id,
            name: $priority->name,
            level: (int) $priority->level,
            color: $priority->color ?? null,
            slaHours: (int) $priority->sla_hours,
            weight: (int) $priority->weight,
            isActive: (bool) $priority->is_active
        );
    }
}
