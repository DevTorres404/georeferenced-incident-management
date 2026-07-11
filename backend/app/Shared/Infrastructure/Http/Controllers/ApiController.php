<?php

namespace App\Shared\Infrastructure\Http\Controllers;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Shared\Infrastructure\Authorization\IncidentAccessChecker;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;

abstract class ApiController extends Controller
{
    protected function forbid(string $message = 'No tienes permissions para realizar esta accion.'): JsonResponse
    {
        return response()->json(['message' => $message], 403);
    }

    protected function can(User $user, string $permission): bool
    {
        return $user->tienePermiso($permission);
    }

    protected function canManage(User $user): bool
    {
        return $user->tieneRol('ADMIN') || $user->tieneRol('SUPERVISOR');
    }

    protected function canViewIncident(User $user, Incident $incident): bool
    {
        return app(IncidentAccessChecker::class)->canView($user, $incident);
    }
}
