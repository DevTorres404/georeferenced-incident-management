<?php

namespace App\Incidents\Application\DTOs;

final class IncidentListResultData
{
    /**
     * @param  array<int, IncidentSummaryData>  $items
     */
    public function __construct(
        public readonly array $items,
        public readonly int $recordsTotal,
        public readonly int $recordsFiltered
    ) {}
}
