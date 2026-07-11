<?php

namespace App\Incidents\Infrastructure\Http\Controllers;

use App\Incidents\Application\UseCases\GetDashboardMetricsUseCase;
use App\Shared\Infrastructure\Http\Controllers\ApiController;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends ApiController
{
    public function metrics(Request $request, GetDashboardMetricsUseCase $useCase): JsonResponse
    {
        $metrics = $useCase->execute((int) $request->user()->id);

        return response()->json([
            'status' => 'success',
            'data' => [
                'kpis' => $metrics->kpis,
                'countsByCategory' => $metrics->countsByCategory,
                'countsByPriority' => $metrics->countsByPriority,
                'countsByState' => $metrics->countsByState,
                'monthlyTrend' => $metrics->monthlyTrend,
                'topCities' => $metrics->topCities,
                'averageResolutionDays' => $metrics->averageResolutionDays,
            ],
        ]);
    }
}
