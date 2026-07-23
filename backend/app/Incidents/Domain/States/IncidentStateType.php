<?php

namespace App\Incidents\Domain\States;

enum IncidentStateType
{
    case Pending;
    case InProgress;
    case Assigned;
    case Resolved;
    case Closed;
    case Reopened;
    case Rejected;
    case Cancelled;
    case Other;

    public static function fromPersistedName(?string $name): self
    {
        $normalized = strtoupper(str_replace(' ', '_', trim((string) $name)));

        return match ($normalized) {
            'NUEVA', 'PENDIENTE', 'PENDING', 'NEW' => self::Pending,
            'EN_PROGRESO', 'IN_PROGRESS' => self::InProgress,
            'ASIGNADA', 'ASSIGNED' => self::Assigned,
            'RESUELTA', 'RESOLVED' => self::Resolved,
            'CERRADA', 'CLOSED' => self::Closed,
            'REABIERTA', 'REOPENED' => self::Reopened,
            'RECHAZADA', 'REJECTED' => self::Rejected,
            'CANCELADA', 'CANCELLED' => self::Cancelled,
            default => self::Other,
        };
    }

    /**
     * @return array<int, string>
     */
    public function persistedNames(): array
    {
        return match ($this) {
            self::Pending => ['NUEVA', 'PENDIENTE', 'PENDING', 'NEW'],
            self::InProgress => ['EN_PROGRESO', 'IN_PROGRESS'],
            self::Assigned => ['ASIGNADA', 'ASSIGNED'],
            self::Resolved => ['RESUELTA', 'RESOLVED'],
            self::Closed => ['CERRADA', 'CLOSED'],
            self::Reopened => ['REABIERTA', 'REOPENED'],
            self::Rejected => ['RECHAZADA', 'REJECTED'],
            self::Cancelled => ['CANCELADA', 'CANCELLED'],
            self::Other => [],
        };
    }

    /**
     * @return array<int, string>
     */
    public static function inactiveWorkloadNames(): array
    {
        return array_merge(
            self::Closed->persistedNames(),
            self::Cancelled->persistedNames(),
            self::Rejected->persistedNames(),
        );
    }
}
