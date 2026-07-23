<?php

namespace App\Incidents\Application\UseCases;

use App\Incidents\Domain\Repositories\IncidentRepositoryInterface;
use App\Incidents\Domain\States\IncidentStateBehavior;
use App\Incidents\Domain\States\IncidentStateBehaviorFactory;
use App\Incidents\Domain\States\IncidentStateType;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use Carbon\Carbon;

final class ReportUseCase
{
    public function __construct(
        private IncidentRepositoryInterface $incidentRepository
    ) {}

    public function getAnalytics(array $filters, int $userId, bool $canManage): array
    {
        $query = Incident::query();

        $this->incidentRepository->applyIncidentVisibilityScope($query, $userId);

        if (! empty($filters['start_date'])) {
            $query->where('created_at', '>=', Carbon::parse($filters['start_date'])->startOfDay());
        }

        if (! empty($filters['end_date'])) {
            $query->where('created_at', '<=', Carbon::parse($filters['end_date'])->endOfDay());
        }

        if (! empty($filters['category'])) {
            $query->whereHas('category', function ($q) use ($filters) {
                $q->where('name', $filters['category']);
            });
        }

        if (! empty($filters['state'])) {
            $query->whereHas('state', function ($q) use ($filters) {
                $q->where('name', $filters['state']);
            });
        }

        $totalUniverseQuery = Incident::query();
        $this->incidentRepository->applyIncidentVisibilityScope($totalUniverseQuery, $userId);
        $totalUniverse = $totalUniverseQuery->count();

        // Obtenemos los incidentes con las relaciones
        $incidents = $query->with(['state', 'priority', 'category', 'territorialUnit'])->get();

        $countsByPriority = [];
        $countsByCategory = [];
        $cities = [];
        $monthlyBuckets = [];
        $resolvedDurations = [];
        $categoryResolutionStats = [];
        $today = Carbon::now();

        $resolved = 0;
        $closed = 0;
        $active = 0;
        $overdue = 0;
        $critical = 0;
        $high = 0;
        $recentSevenDays = 0;

        foreach ($incidents as $incident) {
            $createdAt = $incident->created_at;
            $resolvedAt = $incident->resolution_date ? Carbon::parse($incident->resolution_date) : null;
            $dueDate = $incident->due_date ? Carbon::parse($incident->due_date) : null;

            $state = $this->stateBehavior($incident->state?->name);
            $isResolved = $state->type() === IncidentStateType::Resolved;
            $isClosed = ! $isResolved && ! $state->countsAsActiveWorkload();
            $isActive = ! $isResolved && $state->countsAsActiveWorkload();
            $priorityName = $incident->priority?->name ?? 'Sin prioridad';
            $categoryName = $incident->category?->name ?? 'Sin categoría';
            $cityName = $incident->territorialUnit?->name ?? 'Sin territorio';

            $countsByPriority[$priorityName] = ($countsByPriority[$priorityName] ?? 0) + 1;
            $countsByCategory[$categoryName] = ($countsByCategory[$categoryName] ?? 0) + 1;
            $cities[$cityName] = ($cities[$cityName] ?? 0) + 1;

            if ($createdAt) {
                $key = $createdAt->format('Y-m');
                if (! isset($monthlyBuckets[$key])) {
                    $monthlyBuckets[$key] = ['registered' => 0, 'resolved' => 0, 'pending' => 0];
                }
                $monthlyBuckets[$key]['registered'] += 1;

                if ($createdAt->diffInDays($today) <= 7) {
                    $recentSevenDays += 1;
                }
            }

            if ($isResolved) {
                $resolved += 1;
                if ($createdAt && $resolvedAt) {
                    $resolutionDays = $createdAt->diffInDays($resolvedAt);
                    $resolvedDurations[] = $resolutionDays;
                    $categoryResolutionStats[$categoryName][] = $resolutionDays;
                }

                if ($resolvedAt) {
                    $resolvedKey = $resolvedAt->format('Y-m');
                    if (! isset($monthlyBuckets[$resolvedKey])) {
                        $monthlyBuckets[$resolvedKey] = ['registered' => 0, 'resolved' => 0, 'pending' => 0];
                    }
                    $monthlyBuckets[$resolvedKey]['resolved'] += 1;
                }
            } elseif ($isClosed) {
                $closed += 1;
            } elseif ($isActive) {
                $active += 1;
                if ($createdAt) {
                    $activeKey = $createdAt->format('Y-m');
                    if (! isset($monthlyBuckets[$activeKey])) {
                        $monthlyBuckets[$activeKey] = ['registered' => 0, 'resolved' => 0, 'pending' => 0];
                    }
                    $monthlyBuckets[$activeKey]['pending'] += 1;
                }
            }

            if ($dueDate && $isActive && $dueDate->isBefore($today)) {
                $overdue += 1;
            }

            if (str_contains($this->normalizeStr($priorityName), 'critica')) {
                $critical += 1;
            }
            if (str_contains($this->normalizeStr($priorityName), 'alta')) {
                $high += 1;
            }
        }

        $total = $incidents->count();
        $finished = $resolved + $closed;
        $resolutionRate = $total > 0 ? (int) round(($finished / $total) * 100) : 0;
        $averageResolutionDays = count($resolvedDurations) > 0
            ? array_sum($resolvedDurations) / count($resolvedDurations)
            : 0;

        ksort($monthlyBuckets);
        $trendMonths = [];
        $trendRegistered = [];
        $trendResolved = [];
        $trendPending = [];

        foreach ($monthlyBuckets as $key => $bucket) {
            // Formatear el label del mes. Ejemplo: '2023-01' -> 'Ene 2023'
            $parts = explode('-', $key);
            $monthNum = (int) $parts[1];
            $months = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            $monthLabel = $months[$monthNum].' '.$parts[0];

            $trendMonths[] = $monthLabel;
            $trendRegistered[] = $bucket['registered'];
            $trendResolved[] = $bucket['resolved'];
            $trendPending[] = $bucket['pending'];
        }

        arsort($cities);
        $topCities = [];
        foreach (array_slice($cities, 0, 5) as $city => $count) {
            $topCities[] = [
                'city' => $city,
                'count' => $count,
                'pct' => $total > 0 ? (int) round(($count / $total) * 100) : 0,
            ];
        }

        $categoryAverageResolution = [];
        foreach ($categoryResolutionStats as $cat => $values) {
            $categoryAverageResolution[$cat] = count($values) > 0 ? array_sum($values) / count($values) : 0;
        }

        $summaryRows = [];
        ksort($countsByCategory);
        foreach ($countsByCategory as $catName => $count) {
            $catIncidents = $incidents->filter(fn ($i) => ($i->category?->name ?? 'Sin categoría') === $catName);
            $pendingCount = $catIncidents->filter(function ($incident): bool {
                $state = $this->stateBehavior($incident->state?->name);

                return $state->type() !== IncidentStateType::Resolved
                    && $state->countsAsActiveWorkload();
            })->count();
            $resolvedCount = $catIncidents->filter(
                fn ($incident): bool => $this->stateBehavior($incident->state?->name)->type()
                    === IncidentStateType::Resolved
            )->count();
            $rate = $count > 0 ? (int) round((($resolvedCount) / $count) * 100) : 0;

            $summaryRows[] = [
                'category' => $catName,
                'total' => $count,
                'pending' => $pendingCount,
                'resolved' => $resolvedCount,
                'resolution_rate' => $rate,
            ];
        }

        return [
            'total' => $total,
            'totalUniverse' => $totalUniverse,
            'resolutionRate' => $resolutionRate,
            'averageResolutionDays' => $averageResolutionDays,
            'recentSevenDays' => $recentSevenDays,
            'active' => $active,
            'resolved' => $resolved,
            'closed' => $closed,
            'overdue' => $overdue,
            'critical' => $critical,
            'high' => $high,
            'countsByPriority' => (object) $countsByPriority,
            'countsByCategory' => (object) $countsByCategory,
            'topCities' => $topCities,
            'categoryAverageResolution' => (object) $categoryAverageResolution,
            'monthlyTrend' => [
                'months' => $trendMonths,
                'registered' => $trendRegistered,
                'resolved' => $trendResolved,
                'pending' => $trendPending,
            ],
            'summaryRows' => $summaryRows,
        ];
    }

    private function normalizeStr(?string $str): string
    {
        if (! $str) {
            return '';
        }
        $str = mb_strtolower(trim($str));
        $str = str_replace(
            ['á', 'é', 'í', 'ó', 'ú', 'ñ'],
            ['a', 'e', 'i', 'o', 'u', 'n'],
            $str
        );

        return $str;
    }

    private function stateBehavior(?string $stateName): IncidentStateBehavior
    {
        return IncidentStateBehaviorFactory::fromName($stateName);
    }
}
