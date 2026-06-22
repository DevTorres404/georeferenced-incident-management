<?php

namespace App\Shared\Infrastructure\Http\Controllers;

use Illuminate\Routing\Controller;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use Illuminate\Http\JsonResponse;

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
        return $this->can($user, 'incidents.view')
            && (
                $this->canManage($user)
                || $incident->reported_by_id === $user->id
                || $incident->current_assigned_id === $user->id
            );
    }
}

