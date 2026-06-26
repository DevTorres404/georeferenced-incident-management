<?php

namespace App\Incidents\Infrastructure\Persistence\Repositories;

use App\Incidents\Domain\Repositories\IncidentMetricsRepositoryInterface;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class EloquentIncidentMetricsRepository implements IncidentMetricsRepositoryInterface
{
    public function getKpis(): array
    {
        $totals = Incident::selectRaw("
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

    public function getCountsByCategory(): array
    {
        $categories = Incident::join('core.categories', 'core.incidents.category_id', '=', 'core.categories.id')
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

    public function getCountsByPriority(): array
    {
        $priorities = Incident::join('core.priorities', 'core.incidents.priority_id', '=', 'core.priorities.id')
            ->select('core.priorities.name', DB::raw('COUNT(*) as count'))
            ->groupBy('core.priorities.name')
            ->get();

        $result = [];
        foreach ($priorities as $pri) {
            $result[$pri->name] = (int) $pri->count;
        }

        return $result;
    }

    public function getCountsByState(): array
    {
        $states = Incident::join('core.states', 'core.incidents.state_id', '=', 'core.states.id')
            ->select('core.states.name', DB::raw('COUNT(*) as count'))
            ->groupBy('core.states.name')
            ->get();

        $result = [];
        foreach ($states as $state) {
            $name = $state->name;
            if (in_array($name, ['NUEVA', 'PENDIENTE'])) $name = 'Pendiente';
            elseif (in_array($name, ['EN_REVISION', 'EN_PROGRESO', 'EN PROCESO', 'EN_ATENCION'])) $name = 'En proceso';
            elseif (in_array($name, ['RESUELTA', 'CERRADA'])) $name = 'Resuelta';

            if (!isset($result[$name])) {
                $result[$name] = 0;
            }
            $result[$name] += (int) $state->count;
        }

        return $result;
    }

    public function getMonthlyTrend(int $months = 6): array
    {
        $monthsData = [];
        
        for ($i = $months - 1; $i >= 0; $i--) {
            $date = Carbon::now()->startOfMonth()->subMonths($i);
            $key = $date->format('Y-m');
            $monthsData[$key] = [
                'label' => mb_convert_case($date->translatedFormat('M'), MB_CASE_TITLE, 'UTF-8'),
                'registered' => 0,
                'resolved' => 0,
            ];
        }

        $createdTrend = Incident::select(DB::raw("TO_CHAR(created_at, 'YYYY-MM') as month"), DB::raw('COUNT(*) as count'))
            ->where('created_at', '>=', Carbon::now()->startOfMonth()->subMonths($months - 1))
            ->groupBy('month')
            ->get();

        foreach ($createdTrend as $row) {
            if (isset($monthsData[$row->month])) {
                $monthsData[$row->month]['registered'] = (int) $row->count;
            }
        }

        $resolvedTrend = Incident::select(DB::raw("TO_CHAR(resolution_date, 'YYYY-MM') as month"), DB::raw('COUNT(*) as count'))
            ->join('core.states', 'core.incidents.state_id', '=', 'core.states.id')
            ->whereIn('core.states.name', ['RESUELTA', 'CERRADA'])
            ->whereNotNull('resolution_date')
            ->where('resolution_date', '>=', Carbon::now()->startOfMonth()->subMonths($months - 1))
            ->groupBy('month')
            ->get();

        foreach ($resolvedTrend as $row) {
            if (isset($monthsData[$row->month])) {
                $monthsData[$row->month]['resolved'] = (int) $row->count;
            }
        }

        $labels = [];
        $registered = [];
        $resolved = [];
        $pending = [];

        foreach ($monthsData as $key => $data) {
            $labels[] = $data['label'];
            $registered[] = $data['registered'];
            $resolved[] = $data['resolved'];
            $pending[] = max($data['registered'] - $data['resolved'], 0);
        }

        return [
            'months' => $labels,
            'registered' => $registered,
            'resolved' => $resolved,
            'pending' => $pending
        ];
    }

    public function getTopCities(int $limit = 6): array
    {
        $cities = Incident::join('core.cities', 'core.incidents.city_id', '=', 'core.cities.id')
            ->leftJoin('core.provinces', 'core.cities.province_id', '=', 'core.provinces.id')
            ->join('core.states', 'core.incidents.state_id', '=', 'core.states.id')
            ->select(
                'core.cities.name as city',
                'core.provinces.name as province',
                DB::raw('COUNT(*) as total'),
                DB::raw("SUM(CASE WHEN core.states.name IN ('NUEVA', 'PENDIENTE') THEN 1 ELSE 0 END) as pending"),
                DB::raw("SUM(CASE WHEN core.states.name IN ('EN_REVISION', 'EN_PROGRESO', 'EN PROCESO', 'EN_ATENCION') THEN 1 ELSE 0 END) as progress"),
                DB::raw("SUM(CASE WHEN core.states.name IN ('RESUELTA', 'CERRADA') THEN 1 ELSE 0 END) as resolved")
            )
            ->groupBy('core.cities.name', 'core.provinces.name')
            ->orderByDesc('total')
            ->limit($limit)
            ->get();

        $totalIncidents = Incident::count();
        $result = [];

        foreach ($cities as $city) {
            $label = $city->province ? "{$city->city}, {$city->province}" : $city->city;
            $count = (int) $city->total;
            $pct = $totalIncidents > 0 ? round(($count / $totalIncidents) * 100) : 0;

            $result[] = [
                'city' => $label,
                'count' => $count,
                'pct' => $pct,
                'pending' => (int) $city->pending,
                'progress' => (int) $city->progress,
                'resolved' => (int) $city->resolved
            ];
        }

        return $result;
    }

    public function getAverageResolutionDays(): float
    {
        $avg = Incident::join('core.states', 'core.incidents.state_id', '=', 'core.states.id')
            ->whereIn('core.states.name', ['RESUELTA', 'CERRADA'])
            ->whereNotNull('resolution_date')
            ->whereNotNull('core.incidents.created_at')
            ->selectRaw("AVG(EXTRACT(EPOCH FROM (resolution_date - core.incidents.created_at)) / 86400) as avg_days")
            ->value('avg_days');

        return $avg ? (float) round($avg, 1) : 0.0;
    }
}
