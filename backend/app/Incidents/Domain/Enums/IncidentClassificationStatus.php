<?php

namespace App\Incidents\Domain\Enums;

enum IncidentClassificationStatus: string
{
    case Pending = 'PENDING';
    case Classified = 'CLASSIFIED';

    public function allowsAssignment(): bool
    {
        return $this === self::Classified;
    }
}
