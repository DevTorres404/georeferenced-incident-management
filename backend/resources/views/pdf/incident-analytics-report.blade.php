<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <title>Reporte estadístico de incidencias - SGI</title>
    <style>
        @page { margin: 86px 34px 48px; }
        * { box-sizing: border-box; }
        body { margin: 0; color: #263c50; font-family: DejaVu Sans, sans-serif; font-size: 8px; line-height: 1.4; }
        .page-header { position: fixed; top: -70px; left: 0; right: 0; height: 58px; border-bottom: 2px solid #0b5fcc; }
        .brand-logo { float: left; width: 44px; height: 44px; object-fit: contain; }
        .institution { float: left; padding: 4px 0 0 11px; }
        .institution strong { display: block; color: #082f5b; font-size: 9px; letter-spacing: .3px; text-transform: uppercase; }
        .institution span { color: #0b5fcc; font-size: 6.3px; font-weight: 700; letter-spacing: .45px; text-transform: uppercase; }
        .document-control { float: right; padding: 2px 0 2px 10px; border-left: 1px solid #b9c8d6; color: #526b7f; font-size: 6.5px; line-height: 1.55; text-align: right; }
        .document-control strong { color: #082f5b; letter-spacing: .3px; }
        .page-footer { position: fixed; bottom: -32px; left: 0; right: 0; padding-top: 6px; border-top: 1px solid #c9d4dd; color: #718596; font-size: 6.5px; }
        .page-footer .right { float: right; }
        .page-number::before { content: "Página " counter(page); }
        .confidentiality { color: #082f5b; font-weight: 700; letter-spacing: .35px; text-transform: uppercase; }
        .report-title { margin-bottom: 10px; padding: 10px 12px; border-left: 5px solid #0b5fcc; border-bottom: 1px solid #c6d4e0; background: #f3f7fb; }
        .report-title span { color: #62798c; font-size: 6.2px; font-weight: 700; letter-spacing: .7px; text-transform: uppercase; }
        .report-title h1 { margin: 3px 0 2px; color: #082f5b; font-size: 16px; letter-spacing: .2px; text-transform: uppercase; }
        .report-title p { margin: 0; color: #667b8e; font-size: 7px; }
        .section-title { margin: 0; padding: 5px 7px; border-left: 4px solid #10b9c8; background: #082f5b; color: #fff; font-size: 7px; letter-spacing: .5px; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; }
        .filters { margin-bottom: 11px; }
        .filters td, .filters th { width: 25%; padding: 5px 7px; border: 1px solid #ced9e2; vertical-align: top; text-align: left; font-weight: normal; }
        .label { display: block; margin-bottom: 2px; color: #687f91; font-size: 5.8px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; }
        .value { color: #263c50; font-size: 7.5px; font-weight: 700; }
        .kpis { margin-bottom: 12px; table-layout: fixed; }
        .kpis th { padding: 5px 2px; border: 1px solid #c7d4df; background: #e8f0f7; color: #50677a; font-size: 5.6px; text-transform: uppercase; }
        .kpis td { padding: 7px 2px 6px; border: 1px solid #c7d4df; color: #123d64; font-size: 13px; font-weight: 700; text-align: center; }
        .kpis .unit { color: #687f91; font-size: 6px; font-weight: 400; }
        .executive-note { margin-bottom: 12px; padding: 7px 9px; border: 1px solid #bed6e8; background: #f2f8fc; color: #405b70; }
        .executive-note strong { color: #0b5fcc; }
        .two-column { margin-bottom: 12px; table-layout: fixed; }
        .two-column > tbody > tr > td, .two-column > tbody > tr > th, .two-column > tr > th { width: 50%; padding: 0; vertical-align: top; text-align: left; font-weight: normal; }
        .two-column > tbody > tr > td:first-child, .two-column > tbody > tr > th:first-child, .two-column > tr > th:first-child { padding-right: 5px; }
        .two-column > tbody > tr > td:last-child, .two-column > tbody > tr > th:last-child, .two-column > tr > th:last-child { padding-left: 5px; }
        .data-table th { padding: 4px 5px; border: 1px solid #c9d5df; background: #e8f0f7; color: #465f73; font-size: 5.7px; text-align: left; text-transform: uppercase; }
        .data-table td { padding: 4px 5px; border: 1px solid #d5dfe6; color: #344e62; font-size: 6.5px; vertical-align: middle; }
        .data-table .number { font-weight: 700; text-align: right; }
        .bar-track { width: 100%; height: 5px; overflow: hidden; border-radius: 5px; background: #e2e9ef; }
        .bar-fill { height: 5px; background: #0b5fcc; }
        .bar-fill.secondary { background: #10b9c8; }
        .summary-table { margin-bottom: 11px; }
        .summary-table th { padding: 5px 6px; border: 1px solid #47667e; background: #082f5b; color: #fff; font-size: 5.8px; text-transform: uppercase; }
        .summary-table td { padding: 5px 6px; border: 1px solid #d2dce4; font-size: 6.6px; }
        .summary-table td:not(:first-child) { text-align: right; }
        .summary-table tfoot td { background: #e8f0f7; color: #123d64; font-weight: 700; }
        .empty { padding: 14px !important; color: #708699; font-style: italic; text-align: center !important; }
        .methodology { margin-top: 10px; padding-top: 7px; border-top: 1px solid #aebdca; color: #617789; font-size: 6.2px; page-break-inside: avoid; }
        .methodology strong { color: #354b5e; }
    </style>
</head>
<body>
    @php
        $total = (int) ($analytics['total'] ?? 0);
        $active = (int) ($analytics['active'] ?? 0);
        $resolved = (int) ($analytics['resolved'] ?? 0);
        $priorityCounts = (array) ($analytics['countsByPriority'] ?? []);
        $categoryCounts = (array) ($analytics['countsByCategory'] ?? []);
        $maxPriority = max(array_merge([1], array_map('intval', array_values($priorityCounts))));
        $maxCategory = max(array_merge([1], array_map('intval', array_values($categoryCounts))));
        $months = $analytics['monthlyTrend']['months'] ?? [];
    @endphp

    <header class="page-header">
        <img class="brand-logo" src="{{ public_path('img/SGI_LOGO.jpg') }}" alt="Logo SGI">
        <div class="institution">
            <strong>Sistema de Gestión de Incidencias Georreferenciadas</strong>
            <span>Dirección de operaciones y análisis territorial</span>
        </div>
        <div class="document-control">
            <strong>REPORTE ESTADÍSTICO INSTITUCIONAL</strong><br>
            Código: SGI-EST-{{ now()->format('Ymd') }}<br>
            Versión: 1.0
        </div>
    </header>

    <footer class="page-footer">
        <span class="confidentiality">Uso interno</span> · Generado por {{ $generatedBy }} · {{ now()->format('d/m/Y H:i') }}
        <span class="right"><span class="page-number"></span> · SGI</span>
    </footer>

    <section class="report-title">
        <span>Informe de gestión y desempeño</span>
        <h1>Reportes y estadísticas de incidencias</h1>
        <p>Consolidado institucional del comportamiento, carga y resolución de incidencias.</p>
    </section>

    <h2 class="section-title">1. Alcance del análisis</h2>
    <table class="filters">
        <tr>
            <th scope="col"><span class="label">Fecha inicial</span><span class="value">{{ !empty($filters['start_date']) ? \Carbon\Carbon::parse($filters['start_date'])->format('d/m/Y') : 'Sin restricción' }}</span></th>
            <th scope="col"><span class="label">Fecha final</span><span class="value">{{ !empty($filters['end_date']) ? \Carbon\Carbon::parse($filters['end_date'])->format('d/m/Y') : 'Fecha de emisión' }}</span></th>
            <th scope="col"><span class="label">Categoría</span><span class="value">{{ $filters['category'] ?? 'Todas' }}</span></th>
            <th scope="col"><span class="label">Estado</span><span class="value">{{ $filters['state'] ?? 'Todos' }}</span></th>
        </tr>
    </table>

    <h2 class="section-title">2. Indicadores ejecutivos</h2>
    <table class="kpis">
        <thead><tr><th scope="col">Total analizado</th><th scope="col">Activas</th><th scope="col">Resueltas</th><th scope="col">Tasa de resolución</th><th scope="col">Tiempo promedio</th><th scope="col">Vencidas</th></tr></thead>
        <tbody><tr>
            <td>{{ $total }}</td>
            <td>{{ $active }}</td>
            <td>{{ $resolved }}</td>
            <td>{{ (int) ($analytics['resolutionRate'] ?? 0) }} <span class="unit">%</span></td>
            <td>{{ number_format((float) ($analytics['averageResolutionDays'] ?? 0), 1, ',', '.') }} <span class="unit">días</span></td>
            <td>{{ (int) ($analytics['overdue'] ?? 0) }}</td>
        </tr></tbody>
    </table>

    <div class="executive-note">
        <strong>Lectura ejecutiva:</strong>
        @if($total === 0)
            No existen incidencias que coincidan con los filtros seleccionados.
        @elseif($active > $resolved)
            La carga activa supera el volumen resuelto dentro del alcance seleccionado; se recomienda priorizar los casos vencidos y críticos.
        @else
            El volumen de casos resueltos es igual o superior a la carga activa del periodo analizado.
        @endif
        Universo visible: {{ (int) ($analytics['totalUniverse'] ?? $total) }} incidencias.
    </div>

    <h2 class="section-title">3. Distribución operativa</h2>
    <table class="two-column">
        <tr>
            <th scope="col">
                <table class="data-table">
                    <thead><tr><th scope="col" colspan="3">Por prioridad</th></tr></thead>
                    <tbody>
                    @forelse($priorityCounts as $label => $count)
                        <tr><td>{{ $label }}</td><td class="number">{{ $count }}</td><td><div class="bar-track"><div class="bar-fill" style="width: {{ round(((int) $count / $maxPriority) * 100) }}%"></div></div></td></tr>
                    @empty
                        <tr><td colspan="3" class="empty">Sin datos de prioridad.</td></tr>
                    @endforelse
                    </tbody>
                </table>
            </th>
            <th scope="col">
                <table class="data-table">
                    <thead><tr><th scope="col" colspan="3">Principales territorios</th></tr></thead>
                    <tbody>
                    @forelse(($analytics['topCities'] ?? []) as $territory)
                        <tr><td>{{ $territory['city'] }}</td><td class="number">{{ $territory['count'] }}</td><td class="number">{{ $territory['pct'] }}%</td></tr>
                    @empty
                        <tr><td colspan="3" class="empty">Sin datos territoriales.</td></tr>
                    @endforelse
                    </tbody>
                </table>
            </th>
        </tr>
    </table>

    <h2 class="section-title">4. Tendencia mensual</h2>
    <table class="data-table" style="margin-bottom: 12px;">
        <thead><tr><th scope="col">Mes</th><th scope="col">Registradas</th><th scope="col">Resueltas</th><th scope="col">Activas</th></tr></thead>
        <tbody>
        @forelse($months as $index => $month)
            <tr><td>{{ $month }}</td><td class="number">{{ $analytics['monthlyTrend']['registered'][$index] ?? 0 }}</td><td class="number">{{ $analytics['monthlyTrend']['resolved'][$index] ?? 0 }}</td><td class="number">{{ $analytics['monthlyTrend']['pending'][$index] ?? 0 }}</td></tr>
        @empty
            <tr><td colspan="4" class="empty">Sin tendencia disponible para el periodo.</td></tr>
        @endforelse
        </tbody>
    </table>

    <h2 class="section-title">5. Resumen por categoría</h2>
    <table class="summary-table">
        <thead><tr><th scope="col">Categoría</th><th scope="col">Total</th><th scope="col">Activas</th><th scope="col">Resueltas</th><th scope="col">Tasa</th></tr></thead>
        <tbody>
        @forelse(($analytics['summaryRows'] ?? []) as $row)
            <tr><td>{{ $row['category'] }}</td><td>{{ $row['total'] }}</td><td>{{ $row['pending'] }}</td><td>{{ $row['resolved'] }}</td><td>{{ $row['resolution_rate'] }}%</td></tr>
        @empty
            <tr><td colspan="5" class="empty">Sin categorías dentro del alcance seleccionado.</td></tr>
        @endforelse
        </tbody>
        <tfoot><tr><td>TOTAL</td><td>{{ $total }}</td><td>{{ $active }}</td><td>{{ $resolved }}</td><td>{{ (int) ($analytics['resolutionRate'] ?? 0) }}%</td></tr></tfoot>
    </table>

    <section class="methodology">
        <strong>Nota metodológica:</strong> los indicadores se calculan exclusivamente sobre las incidencias visibles para el usuario y los filtros aplicados. La tasa de resolución considera estados resueltos y cerrados. El tiempo promedio corresponde al intervalo entre creación y resolución de los casos finalizados.
    </section>
</body>
</html>
