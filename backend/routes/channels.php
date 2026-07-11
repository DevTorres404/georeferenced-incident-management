<?php

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Shared\Infrastructure\Authorization\IncidentAccessChecker;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('users.{userId}.notifications', function (User $user, int $userId): bool {
    return (int) $user->id === $userId;
});

Broadcast::channel('incidents.{incidentId}.comments', function (User $user, int $incidentId): bool {
    $incident = Incident::query()->find($incidentId);

    return $incident !== null && app(IncidentAccessChecker::class)->canView($user, $incident);
});

Broadcast::channel('incidents.{incidentId}.internal-comments', function (User $user, int $incidentId): bool {
    $incident = Incident::query()->find($incidentId);

    return $incident !== null
        && $user->tienePermiso('comments.internal')
        && app(IncidentAccessChecker::class)->canView($user, $incident);
});
