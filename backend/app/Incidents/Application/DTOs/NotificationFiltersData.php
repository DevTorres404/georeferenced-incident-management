<?php

namespace App\Incidents\Application\DTOs;

final class NotificationFiltersData
{
    public function __construct(
        public readonly ?bool $isRead = null,
        public readonly int $perPage = 15
    ) {}
}
