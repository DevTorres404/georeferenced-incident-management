<?php

namespace App\Incidents\Application\DTOs;

use JsonSerializable;

final class IncidentSummaryData implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly ?string $code,
        public readonly string $title,
        public readonly string $description,
        public readonly int $reporterUserId,
        public readonly ?int $assigneeUserId,
        public readonly int $stateId,
        public readonly ?StateSummaryData $state,
        public readonly ?CategorySummaryData $category = null,
        public readonly ?CategorySummaryData $subcategory = null,
        public readonly ?PrioritySummaryData $priority = null,
        public readonly ?TerritorialUnitSummaryData $territorialUnit = null,
        public readonly ?string $address = null,
        public readonly ?string $resolutionDate = null,
        public readonly ?string $createdAt = null
    ) {
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
            'category' => $this->category,
            'subcategory' => $this->subcategory,
            'priority' => $this->priority,
            'territorial_unit' => $this->territorialUnit,
            'address' => $this->address,
            'address_reference' => $this->address,
            'resolution_date' => $this->resolutionDate,
            'created_at' => $this->createdAt,
        ];
    }
}
