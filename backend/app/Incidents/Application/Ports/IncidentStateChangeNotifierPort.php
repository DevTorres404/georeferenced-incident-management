<?php

namespace App\Incidents\Application\Ports;

interface IncidentStateChangeNotifierPort
{
    public function notifyStateChangeRequested(
        int $incidentId,
        int $requestedByUserId,
        string $requestedStateName,
        string $reason
    ): void;

    public function notifyStateChangeApproved(int $incidentId, int $requestedByUserId): void;

    public function notifyStateChangeRejected(int $incidentId, int $requestedByUserId, string $reason): void;
}
