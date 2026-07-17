<?php

namespace App\Incidents\Infrastructure\Persistence\Repositories;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Domain\Repositories\IncidentMetricsRepositoryInterface;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Operations\Infrastructure\Persistence\Models\UserTerritory;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class EloquentIncidentMetricsRepository implements IncidentMetricsRepositoryInterface
{
    /** @var array<int, User|null> */
    private array $usersById = [];

    /** @var array<int, array<int, int>> */
    private array $zoneIdsByUserId = [];

    public function getKpis(int $userId): array
    {
        $totals = $this->visibleIncidentQuery($userId)->selectRaw("
            COUNT(*) as total,
            SUM(CASE WHEN state_id IN (SELECT id FROM core.states WHERE name IN ('NUEVA', 'PENDIENTE')) THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN state_id IN (SELECT id FROM core.states WHERE name IN ('EN_REVISION', 'EN_PROGRESO', 'EN PROCESO', 'EN_ATENCION')) THEN 1 ELSE 0 END) as progress,
            SUM(CASE WHEN state_id IN (SELECT id FROM core.states WHERE name IN ('RESUELTA', 'CERRADA')) THEN 1 ELSE 0 END) as resolved
        ")->first();

        return [
            'total' => (int) ($totals->total ?? 0),
            'pending' => (int) ($totals->pending ?? 0),
            'progress' => (int) ($totals->progress ?? 0),
            'resolved' => (int) ($totals->resolved ?? 0),
        ];
    }

    public function getCountsByCategory(int $userId): array
    {
        $categories = $this->visibleIncidentQuery($userId)
            ->join('core.categories', 'core.incidents.category_id', '=', 'core.categories.id')
            ->select('core.categories.name', DB::raw('COUNT(*) as count'))
            ->groupBy('core.categories.name')
            ->orderByDesc('count')
            ->get();

        $result = [];
        foreach ($categories as $cat) {
            $result[$cat->name] = (int) $cat->count;
        }

        return $result;
    }

    public function getCountsByPriority(int $userId): array
    {
        $priorities = $this->visibleIncidentQuery($userId)
            ->join('core.priorities', 'core.incidents.priority_id', '=', 'core.priorities.id')
            ->select('core.priorities.name', DB::raw('COUNT(*) as count'))
            ->groupBy('core.priorities.name')
            ->get();

        $result = [];
        foreach ($priorities as $pri) {
            $result[$pri->name] = (int) $pri->count;
        }

        return $result;
    }

    public function getCountsByState(int $userId): array
    {
        $states = $this->visibleIncidentQuery($userId)
            ->join('core.states', 'core.incidents.state_id', '=', 'core.states.id')
            ->select('core.states.name', DB::raw('COUNT(*) as count'))
            ->groupBy('core.states.name')
            ->get();

        $result = [];
        foreach ($states as $state) {
            $name = $state->name;
            if (! isset($result[$name])) {
                $result[$name] = 0;
            }
            $result[$name] += (int) $state->count;
        }

        return $result;
    }

    public function getMonthlyTrend(int $userId, int $months = 6): array
    {
        $labels = [];
        $monthKeys = [];
        for ($i = $months - 1; $i >= 0; $i--) {
            $date = Carbon::now()->startOfMonth()->subMonths($i);
            $key = $date->format('Y-m');
            $monthKeys[] = $key;
            $labels[] = mb_convert_case($date->translatedFormat('M'), MB_CASE_TITLE, 'UTF-8');
        }

        $trend = $this->visibleIncidentQuery($userId)
            ->join('core.states', 'core.incidents.state_id', '=', 'core.states.id')
            ->select(DB::raw("TO_CHAR(core.incidents.created_at, 'YYYY-MM') as month"), 'core.states.name as state', DB::raw('COUNT(*) as count'))
            ->where('core.incidents.created_at', '>=', Carbon::now()->startOfMonth()->subMonths($months - 1))
            ->groupBy(DB::raw("TO_CHAR(core.incidents.created_at, 'YYYY-MM')"), 'core.states.name')
            ->get();

        $seriesData = [];
        $allStates = $trend->pluck('state')->unique();

        foreach ($allStates as $state) {
            $seriesData[$state] = array_fill(0, $months, 0);
        }

        foreach ($trend as $row) {
            $monthIndex = array_search($row->month, $monthKeys);
            if ($monthIndex !== false) {
                $seriesData[$row->state][$monthIndex] = (int) $row->count;
            }
        }

        $series = [];
        foreach ($seriesData as $state => $data) {
            $series[] = [
                'name' => $state,
                'data' => $data,
            ];
        }

        return [
            'months' => $labels,
            'series' => $series,
        ];
    }

    public function getTopCities(int $userId, int $limit = 6): array
    {
        $territories = $this->visibleIncidentQuery($userId)
            ->leftJoin('core.territorial_units as unit', 'core.incidents.territorial_unit_id', '=', 'unit.id')
            ->leftJoin('core.territorial_units as parent', 'unit.parent_id', '=', 'parent.id')
            ->leftJoin('core.territorial_units as grandparent', 'parent.parent_id', '=', 'grandparent.id')
            ->leftJoin('core.territorial_units as greatgrandparent', 'grandparent.parent_id', '=', 'greatgrandparent.id')
            ->join('core.states', 'core.incidents.state_id', '=', 'core.states.id')
            ->select(
                'unit.name as unit',
                'parent.name as parent',
                'grandparent.name as grandparent',
                'greatgrandparent.name as greatgrandparent',
                DB::raw('COUNT(*) as total'),
                DB::raw("SUM(CASE WHEN core.states.name IN ('NUEVA', 'PENDIENTE') THEN 1 ELSE 0 END) as pending"),
                DB::raw("SUM(CASE WHEN core.states.name IN ('EN_REVISION', 'EN_PROGRESO', 'EN PROCESO', 'EN_ATENCION') THEN 1 ELSE 0 END) as progress"),
                DB::raw("SUM(CASE WHEN core.states.name IN ('RESUELTA', 'CERRADA') THEN 1 ELSE 0 END) as resolved")
            )
            ->groupBy('unit.name', 'parent.name', 'grandparent.name', 'greatgrandparent.name')
            ->orderByDesc('total')
            ->limit($limit)
            ->get();

        $totalIncidents = $this->visibleIncidentQuery($userId)->count();
        $result = [];

        foreach ($territories as $territory) {
            $label = $this->territoryLabel($territory);
            $count = (int) $territory->total;
            $pct = $totalIncidents > 0 ? round(($count / $totalIncidents) * 100) : 0;

            $result[] = [
                'city' => $label,
                'count' => $count,
                'pct' => $pct,
                'pending' => (int) $territory->pending,
                'progress' => (int) $territory->progress,
                'resolved' => (int) $territory->resolved,
            ];
        }

        return $result;
    }

    public function getAverageResolutionDays(int $userId): float
    {
        $avg = $this->visibleIncidentQuery($userId)
            ->join('core.states', 'core.incidents.state_id', '=', 'core.states.id')
            ->whereIn('core.states.name', ['RESUELTA', 'CERRADA'])
            ->whereNotNull('resolution_date')
            ->whereNotNull('core.incidents.created_at')
            ->selectRaw('AVG(EXTRACT(EPOCH FROM (resolution_date - core.incidents.created_at)) / 86400) as avg_days')
            ->value('avg_days');

        return $avg ? (float) round($avg, 1) : 0.0;
    }

    private function visibleIncidentQuery(int $userId): Builder
    {
        $query = Incident::query();
        if (! array_key_exists($userId, $this->usersById)) {
            $this->usersById[$userId] = User::query()->with('roles')->find($userId);
        }

        $user = $this->usersById[$userId];

        if (! $user) {
            return $query->whereRaw('1 = 0');
        }

        if ($user->tieneRol('ADMIN')) {
            return $query;
        }

        if ($user->tieneRol('SUPERVISOR')) {
            $zoneIds = $this->activeZoneIdsForUser($userId);

            if ($zoneIds === []) {
                return $query->whereRaw('1 = 0');
            }

            return $query->whereHas('territorialUnit', function (Builder $territoryQuery) use ($zoneIds): void {
                $this->applyZoneFilterToTerritoryQuery($territoryQuery, $zoneIds);
            });
        }

        if ($user->tieneRol('OPERADOR')) {
            return $query->whereHas('assignments', function (Builder $assignmentQuery) use ($userId): void {
                $assignmentQuery->where('user_id', $userId)->where('active', true);
            });
        }

        return $query->where('core.incidents.reported_by_id', $userId);
    }

    private function applyZoneFilterToTerritoryQuery(Builder $query, array $zoneIds): void
    {
        $query->where(function (Builder $territoryScope) use ($zoneIds): void {
            $territoryScope->whereIn('id', $zoneIds)
                ->orWhereIn('parent_id', $zoneIds)
                ->orWhereHas('parent', fn (Builder $parentQuery) => $parentQuery->whereIn('parent_id', $zoneIds))
                ->orWhereHas('parent.parent', fn (Builder $parentQuery) => $parentQuery->whereIn('parent_id', $zoneIds))
                ->orWhereHas('parent.parent.parent', fn (Builder $parentQuery) => $parentQuery->whereIn('parent_id', $zoneIds))
                ->orWhereHas('parent.parent.parent.parent', fn (Builder $parentQuery) => $parentQuery->whereIn('parent_id', $zoneIds));
        });
    }

    /**
     * @return array<int, int>
     */
    private function activeZoneIdsForUser(int $userId): array
    {
        if (array_key_exists($userId, $this->zoneIdsByUserId)) {
            return $this->zoneIdsByUserId[$userId];
        }

        $zoneIds = UserTerritory::query()
            ->with('territory.'.TerritorialUnit::PARENT_CHAIN)
            ->active()
            ->where('user_id', $userId)
            ->get()
            ->map(fn (UserTerritory $assignment): ?TerritorialUnit => $this->resolveOperationalZone($assignment->territory))
            ->filter()
            ->map(fn (TerritorialUnit $zone): int => (int) $zone->id)
            ->unique()
            ->values()
            ->all();

        $this->zoneIdsByUserId[$userId] = $zoneIds;

        return $zoneIds;
    }

    private function resolveOperationalZone(?TerritorialUnit $territory): ?TerritorialUnit
    {
        if (! $territory) {
            return null;
        }

        if ($territory->type === TerritorialUnit::TYPE_OPERATIONAL_ZONE) {
            return $territory;
        }

        if ($territory->type === TerritorialUnit::TYPE_PROVINCE) {
            $canton = TerritorialUnit::query()
                ->where('type', TerritorialUnit::TYPE_CANTON)
                ->where('code', 'like', $territory->code.'%')
                ->first();

            if ($canton && $canton->parent_id) {
                $zone = TerritorialUnit::find($canton->parent_id);
                if ($zone && $zone->type === TerritorialUnit::TYPE_OPERATIONAL_ZONE) {
                    return $zone;
                }
            }
        }

        $current = $territory;

        while ($current) {
            if ($current->type === TerritorialUnit::TYPE_OPERATIONAL_ZONE) {
                return $current;
            }

            $current = $current->parent;
        }

        return null;
    }

    private function territoryLabel(object $territory): string
    {
        $segments = array_filter([
            $territory->unit,
            $territory->parent,
            $territory->grandparent,
            $territory->greatgrandparent,
        ]);

        return $segments ? implode(', ', $segments) : 'Sin territorio';
    }
}
