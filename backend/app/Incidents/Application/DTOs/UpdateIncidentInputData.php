<?php

namespace App\Incidents\Application\DTOs;

final class UpdateIncidentInputData
{
    /**
     * @param  array<int, string>  $presentFields
     */
    public function __construct(
        public readonly ?string $title = null,
        public readonly ?string $description = null,
        public readonly ?int $categoryId = null,
        public readonly ?int $priorityId = null,
        public readonly ?int $subcategoryId = null,
        public readonly ?string $address = null,
        public readonly ?float $latitude = null,
        public readonly ?float $longitude = null,
        public readonly ?int $territorialUnitId = null,
        public readonly ?string $resolutionDate = null,
        public readonly array $presentFields = []
    ) {}

    public function has(string $field): bool
    {
        if ($this->presentFields === [] && property_exists($this, $field)) {
            return $this->{$field} !== null;
        }

        return in_array($field, $this->presentFields, true);
    }
}
