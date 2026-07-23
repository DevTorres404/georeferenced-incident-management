<?php

namespace App\Incidents\Infrastructure\Http\Controllers;

use App\Incidents\Application\UseCases\ReportUseCase;
use App\Shared\Infrastructure\Http\Controllers\ApiController;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * @group Reportes
 *
 * APIs para extraer métricas y estadísticas de las incidencias.
 */
class ReportController extends ApiController
{
    public function __construct(
        private ReportUseCase $reportUseCase
    ) {}

    /**
     * Obtener estadísticas de incidencias.
     *
     * Devuelve las agregaciones y métricas para el dashboard de reportes.
     *
     * @authenticated
     *
     * @queryParam start_date string Filtro fecha de inicio (Y-m-d). Example: 2023-01-01
     * @queryParam end_date string Filtro fecha de fin (Y-m-d). Example: 2023-12-31
     * @queryParam category string Filtro por categoría. Example: Agua
     * @queryParam state string Filtro por estado. Example: Nueva
     */
    public function analytics(Request $request): JsonResponse
    {
        $user = $request->user();

        $filters = $this->validatedFilters($request);

        return response()->json([
            'data' => $this->reportUseCase->getAnalytics($filters, $user->id, $this->canManage($user)),
        ]);
    }

    /**
     * Exportar estadísticas consolidadas en PDF.
     */
    public function pdf(Request $request): Response
    {
        $user = $request->user();
        $filters = $this->validatedFilters($request);
        $analytics = $this->reportUseCase->getAnalytics($filters, $user->id, $this->canManage($user));

        $document = Pdf::loadView('pdf.incident-analytics-report', [
            'analytics' => $analytics,
            'filters' => $filters,
            'generatedBy' => $user->getNombreCompletoAttribute(),
        ])->setPaper('A4', 'portrait');

        return $document->download('reporte-estadistico-sgi-'.now()->format('Y-m-d').'.pdf');
    }

    /**
     * @return array<string, string|null>
     */
    private function validatedFilters(Request $request): array
    {
        return $request->validate([
            'start_date' => ['nullable', 'date', 'date_format:Y-m-d'],
            'end_date' => ['nullable', 'date', 'date_format:Y-m-d', 'after_or_equal:start_date'],
            'category' => ['nullable', 'string', 'max:120'],
            'state' => ['nullable', 'string', 'max:120'],
        ]);
    }
}
