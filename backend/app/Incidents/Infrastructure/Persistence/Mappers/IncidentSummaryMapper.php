<?php

namespace App\Incidents\Infrastructure\Persistence\Mappers;

use App\Incidents\Application\DTOs\CategorySummaryData;
use App\Incidents\Application\DTOs\IncidentSummaryData;
use App\Incidents\Application\DTOs\PrioritySummaryData;
use App\Incidents\Application\DTOs\TerritorialUnitSummaryData;
use App\Incidents\Infrastructure\Persistence\Models\Incident;

final class IncidentSummaryMapper
{
    public function __construct(private StateSummaryMapper $stateSummaryMapper)
    {
    }

    public function fromModel(Incident $incident): IncidentSummaryData
    {
        return new IncidentSummaryData(
            id: (int) $incident->id,
            code: $incident->code,
            title: $incident->title,
            description: $incident->description,
            reporterUserId: (int) $incident->reported_by_id,
            assigneeUserId: $incident->current_assigned_id ? (int) $incident->current_assigned_id : null,
            stateId: (int) $incident->state_id,
            state: $incident->relationLoaded('state') && $incident->state
                ? $this->stateSummaryMapper->fromModel($incident->state)
                : null,
            category: $incident->relationLoaded('category') && $incident->category
                ? new CategorySummaryData((int) $incident->category->id, $incident->category->name)
                : null,
            subcategory: $incident->relationLoaded('subcategory') && $incident->subcategory
                ? new CategorySummaryData((int) $incident->subcategory->id, $incident->subcategory->name)
                : null,
            priority: $incident->relationLoaded('priority') && $incident->priority
                ? new PrioritySummaryData((int) $incident->priority->id, $incident->priority->name, (int) $incident->priority->level)
                : null,
            territorialUnit: $incident->relationLoaded('territorialUnit') && $incident->territorialUnit
                ? new TerritorialUnitSummaryData(
                    (int) $incident->territorialUnit->id,
                    $incident->territorialUnit->name,
                    $incident->territorialUnit->type,
                    $incident->territorialUnit->full_path
                )
                : null,
            address: $incident->address_reference ?: $incident->address,
            resolutionDate: $incident->resolution_date?->toIso8601String(),
            createdAt: $incident->created_at?->toIso8601String()
        );
    }
}
