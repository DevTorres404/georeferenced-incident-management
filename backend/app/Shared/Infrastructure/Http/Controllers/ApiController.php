<?php

namespace App\Shared\Infrastructure\Http\Controllers;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Operations\Infrastructure\Persistence\Models\UserTerritory;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
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
        if ($user->tieneRol('ADMIN')) {
            return true;
        }

        if ($user->tieneRol('SUPERVISOR')) {
            $zone = $this->resolveOperationalZoneForIncident($incident);

            if (! $zone) {
                return false;
            }

            return UserTerritory::query()
                ->active()
                ->where('user_id', $user->id)
                ->where('territorial_unit_id', $zone->id)
                ->exists();
        }

        if ($user->tieneRol('OPERADOR')) {
            return $incident->assignments()
                ->where('user_id', $user->id)
                ->where('active', true)
                ->exists();
        }

        if ($incident->reported_by_id === $user->id) {
            return true;
        }

        return $this->can($user, 'incidents.view');
    }

    private function resolveOperationalZoneForIncident(Incident $incident): ?TerritorialUnit
    {
        if ($incident->latitude !== null && $incident->longitude !== null) {
            try {
                $spatialZone = TerritorialUnit::query()
                    ->where('type', TerritorialUnit::TYPE_OPERATIONAL_ZONE)
                    ->where('is_active', true)
                    ->whereNotNull('coverage_area')
                    ->whereRaw(
                        'ST_Within(ST_SetSRID(ST_MakePoint(?, ?), 4326), coverage_area)',
                        [(float) $incident->longitude, (float) $incident->latitude]
                    )
                    ->first();

                if ($spatialZone) {
                    return $spatialZone;
                }
            } catch (\Throwable) {
                // Column coverage_area may not exist yet; fall through to hierarchical lookup.
            }
        }

        $territory = $incident->territorialUnit()->with(TerritorialUnit::PARENT_CHAIN)->first();

        return $territory ? $this->resolveOperationalZone($territory) : null;
    }

    private function resolveOperationalZone(TerritorialUnit $territory): ?TerritorialUnit
    {
        if ($territory->type === TerritorialUnit::TYPE_OPERATIONAL_ZONE) {
            return $territory;
        }

        $current = $territory;

        while ($current->parent) {
            $current = $current->parent;

            if ($current->type === TerritorialUnit::TYPE_OPERATIONAL_ZONE) {
                return $current;
            }
        }

        return null;
    }
}
