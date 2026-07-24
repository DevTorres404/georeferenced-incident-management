<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <title>Reporte operativo - {{ $operator['first_name'] }} {{ $operator['last_name'] }}</title>
    <style>
        @page { margin: 88px 36px 52px; }
        * { box-sizing: border-box; }
        body {
            color: #25384a;
            font-family: DejaVu Sans, sans-serif;
            font-size: 8.5px;
            line-height: 1.4;
            margin: 0;
        }
        .page-header {
            border-bottom: 2px solid #0b5fcc;
            height: 60px;
            left: 0;
            position: fixed;
            right: 0;
            top: -72px;
        }
        .brand-logo {
            float: left;
            height: 46px;
            object-fit: contain;
            width: 46px;
        }
        .institution {
            float: left;
            padding-left: 12px;
            padding-top: 4px;
        }
        .institution strong {
            color: #082f5b;
            display: block;
            font-size: 9.2px;
            letter-spacing: .3px;
            text-transform: uppercase;
        }
        .institution span { color: #4d6579; font-size: 7px; }
        .institution .department {
            color: #0b5fcc;
            font-size: 6.4px;
            font-weight: 700;
            letter-spacing: .45px;
            text-transform: uppercase;
        }
        .document-control {
            border-left: 1px solid #b9c8d6;
            color: #526b7f;
            float: right;
            font-size: 6.8px;
            line-height: 1.5;
            padding: 2px 0 2px 11px;
            text-align: right;
        }
        .document-control strong { color: #082f5b; letter-spacing: .35px; }
        .page-footer {
            border-top: 1px solid #c9d4dd;
            bottom: -34px;
            color: #718596;
            font-size: 6.8px;
            left: 0;
            padding-top: 6px;
            position: fixed;
            right: 0;
        }
        .confidentiality {
            color: #082f5b;
            font-weight: 700;
            letter-spacing: .35px;
            text-transform: uppercase;
        }
        .page-footer .right { float: right; }
        .page-number::before { content: "Página " counter(page); }
        .report-title {
            background: #f3f7fb;
            border-left: 5px solid #0b5fcc;
            border-bottom: 1px solid #c6d4e0;
            margin-bottom: 13px;
            padding: 9px 12px 10px;
        }
        .report-title .classification {
            color: #5e7385;
            font-size: 6.5px;
            font-weight: 700;
            letter-spacing: .8px;
            text-transform: uppercase;
        }
        .report-title h1 {
            color: #082f5b;
            font-size: 17px;
            font-weight: 700;
            letter-spacing: .2px;
            margin: 3px 0 2px;
            text-transform: uppercase;
        }
        .report-title p { color: #667b8e; font-size: 7.5px; margin: 0; }
        .section-title {
            background: #082f5b;
            border-left: 4px solid #10b9c8;
            color: #fff;
            font-size: 7.2px;
            font-weight: 700;
            letter-spacing: .55px;
            margin: 0;
            padding: 5px 7px;
            text-transform: uppercase;
        }
        .operator-sheet,
        .metrics-table,
        .record-metadata,
        .record-detail,
        .history-table {
            border-collapse: collapse;
            width: 100%;
        }
        .operator-sheet { margin-bottom: 13px; }
        .operator-sheet td, .operator-sheet th {
            border: 1px solid #cfd9e1;
            padding: 6px 8px;
            vertical-align: top;
            width: 50%;
            text-align: left;
            font-weight: normal;
        }
        .document-meta {
            border-collapse: collapse;
            margin: -5px 0 13px;
            width: 100%;
        }
        .document-meta td, .document-meta th {
            color: #526b7f;
            font-size: 6.4px;
            padding: 0 7px;
            text-align: right;
            font-weight: normal;
        }
        .document-meta strong { color: #27455f; text-transform: uppercase; }
        .field-label {
            color: #667b8e;
            display: block;
            font-size: 6.2px;
            font-weight: 700;
            letter-spacing: .45px;
            margin-bottom: 2px;
            text-transform: uppercase;
        }
        .field-value { color: #25384a; font-size: 9px; font-weight: 700; }
        .field-value.mono { font-family: DejaVu Sans Mono, monospace; }
        .metrics-table { margin-bottom: 15px; }
        .metrics-table th {
            background: #e8f0f7;
            border: 1px solid #c8d3dc;
            color: #445a6d;
            font-size: 6.2px;
            font-weight: 700;
            padding: 5px 3px;
            text-transform: uppercase;
            width: 20%;
        }
        .metrics-table td {
            border: 1px solid #c8d3dc;
            color: #173f5f;
            font-size: 14px;
            font-weight: 700;
            padding: 7px 3px 5px;
            text-align: center;
        }
        .metrics-table td:first-child { border-bottom: 3px solid #10b9c8; }
        .metrics-table td:nth-child(2) { border-bottom: 3px solid #0b5fcc; }
        .metrics-table td:nth-child(3) { border-bottom: 3px solid #2f8a62; }
        .metrics-table td:nth-child(4) { border-bottom: 3px solid #c68b24; }
        .metrics-table td:nth-child(5) { border-bottom: 3px solid #7c5bb5; }
        .metrics-table .unit {
            color: #667b8e;
            font-size: 6.8px;
            font-weight: 400;
        }
        .register-heading {
            border-bottom: 1px solid #173f5f;
            margin-bottom: 8px;
            padding-bottom: 5px;
        }
        .register-heading strong {
            color: #173f5f;
            font-size: 10px;
            letter-spacing: .25px;
            text-transform: uppercase;
        }
        .register-heading span { color: #667b8e; float: right; font-size: 7px; padding-top: 2px; }
        .incident-record {
            border: 1px solid #aebdca;
            margin-bottom: 9px;
            page-break-inside: avoid;
        }
        .record-metadata th {
            background: #082f5b;
            border-right: 1px solid #47667e;
            color: #fff;
            font-size: 6px;
            font-weight: 700;
            letter-spacing: .3px;
            padding: 4px 6px;
            text-align: left;
            text-transform: uppercase;
        }
        .record-metadata td {
            background: #f3f6f8;
            border-bottom: 1px solid #cfd9e1;
            border-right: 1px solid #cfd9e1;
            color: #25384a;
            font-size: 7.3px;
            font-weight: 700;
            padding: 5px 6px;
        }
        .record-metadata td:last-child,
        .record-metadata th:last-child { border-right: 0; }
        .record-ticket { color: #173f5f !important; font-family: DejaVu Sans Mono, monospace; }
        .record-detail td, .record-detail th { padding: 7px; vertical-align: top; text-align: left; font-weight: normal; }
        .record-summary { border-right: 1px solid #d6dfe6; width: 42%; }
        .record-title { color: #25384a; font-size: 8.5px; font-weight: 700; margin-bottom: 5px; }
        .record-classification { color: #667b8e; font-size: 6.8px; line-height: 1.55; }
        .record-classification strong { color: #445a6d; }
        .history-cell { padding: 0 !important; width: 58%; }
        .history-table th {
            background: #e9eef2;
            border-bottom: 1px solid #c8d3dc;
            border-right: 1px solid #d5dee5;
            color: #445a6d;
            font-size: 5.7px;
            padding: 4px;
            text-align: left;
            text-transform: uppercase;
        }
        .history-table td {
            border-bottom: 1px solid #e0e6eb;
            border-right: 1px solid #e0e6eb;
            color: #3c5265;
            font-size: 6.2px;
            padding: 4px;
            vertical-align: top;
        }
        .history-table tr:last-child td { border-bottom: 0; }
        .history-table td:last-child,
        .history-table th:last-child { border-right: 0; }
        .history-sequence { font-weight: 700; text-align: center; width: 7%; }
        .history-state { font-weight: 700; width: 22%; }
        .history-priority { width: 15%; }
        .history-date { width: 22%; }
        .history-duration { font-weight: 700; width: 13%; }
        .history-owner { width: 21%; }
        .final-row td { color: #2f5d46; font-weight: 700; }
        .no-history {
            color: #718596;
            font-style: italic;
            padding: 12px !important;
            text-align: center;
        }
        .empty-state {
            border: 1px solid #aebdca;
            color: #667b8e;
            padding: 22px;
            text-align: center;
        }
        .methodology {
            border-top: 1px solid #aebdca;
            color: #5f7486;
            font-size: 6.5px;
            margin-top: 14px;
            page-break-inside: avoid;
            padding-top: 7px;
        }
        .methodology strong { color: #354b5e; }
        .methodology-title {
            color: #173f5f;
            font-size: 7px;
            font-weight: 700;
            letter-spacing: .4px;
            margin-bottom: 4px;
            text-transform: uppercase;
        }
        .approval-strip {
            border-collapse: collapse;
            margin-top: 14px;
            page-break-inside: avoid;
            width: 100%;
        }
        .approval-strip td, .approval-strip th {
            border-top: 1px solid #aebdca;
            color: #5f7486;
            font-size: 6.2px;
            padding-top: 6px;
            width: 50%;
            text-align: left;
            font-weight: normal;
        }
        .approval-strip td:last-child, .approval-strip th:last-child { text-align: right; }
        .approval-strip strong { color: #354b5e; text-transform: uppercase; }
    </style>
</head>
<body>
    <header class="page-header">
        <img class="brand-logo" src="{{ public_path('img/SGI_LOGO.jpg') }}" alt="Logo SGI">
        <div class="institution">
            <strong>Sistema de Gestión de Incidencias Georreferenciadas</strong>
            <span class="department">Dirección de operaciones y seguimiento territorial</span><br>
            <span>Unidad de seguimiento y control operativo</span>
        </div>
        <div class="document-control">
            <strong>INFORME OPERATIVO INDIVIDUAL</strong><br>
            Código: SGI-OPS-{{ str_pad($operator['id'], 5, '0', STR_PAD_LEFT) }}<br>
            Versión documental: 1.0
        </div>
    </header>

    <footer class="page-footer">
        <span class="confidentiality">Uso interno</span> · Documento institucional · Emitido {{ now()->format('d/m/Y H:i') }}
        <span class="right"><span class="page-number"></span> · SGI</span>
    </footer>

    <section class="report-title">
        <span class="classification">Informe de gestión operativa</span>
        <h1>Reporte de desempeño del operador</h1>
        <p>Consolidado de carga, resolución e intervenciones registradas en el sistema.</p>
    </section>

    <table class="document-meta">
        <tr>
            <th scope="col"><strong>Fecha de corte:</strong> {{ now()->format('d/m/Y H:i') }}</th>
            <th scope="col"><strong>Clasificación:</strong> Uso interno</th>
        </tr>
    </table>

    <h2 class="section-title">1. Identificación y alcance</h2>
    <table class="operator-sheet">
        <tr>
            <th scope="col"><span class="field-label">Operador</span><span class="field-value">{{ $operator['first_name'] }} {{ $operator['last_name'] }}</span></th>
            <th scope="col"><span class="field-label">Identificador interno</span><span class="field-value mono">#{{ str_pad($operator['id'], 5, '0', STR_PAD_LEFT) }}</span></th>
        </tr>
        <tr>
            <th scope="col"><span class="field-label">Correo institucional</span><span class="field-value">{{ $operator['email'] }}</span></th>
            <th scope="col"><span class="field-label">Alcance del documento</span><span class="field-value">{{ $report_scope_label ?? 'Últimas 50 intervenciones' }}</span></th>
        </tr>
    </table>

    <h2 class="section-title">2. Resumen de indicadores</h2>
    <table class="metrics-table">
        <thead>
            <tr>
                <th scope="col">Carga laboral</th>
                <th scope="col">Casos asignados</th>
                <th scope="col">Casos resueltos</th>
                <th scope="col">Promedio de respuesta</th>
                <th scope="col">Tasa de reapertura</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>{{ $metrics['current_workload'] }} <span class="unit">pts</span></td>
                <td>{{ $metrics['total_assigned'] }}</td>
                <td>{{ $metrics['total_resolved'] }}</td>
                <td>{{ number_format($metrics['avg_response_hours'], 2, ',', '.') }} <span class="unit">h</span></td>
                <td>{{ number_format($metrics['reopen_rate'], 2, ',', '.') }} <span class="unit">%</span></td>
            </tr>
        </tbody>
    </table>

    <div class="register-heading">
        <strong>3. Registro de intervenciones</strong>
        <span>{{ count($recent_incidents) }} registros incluidos</span>
    </div>

    @forelse($recent_incidents as $item)
        @php
            $incident = $item['incident'];
            $filteredHistory = collect($item['history'] ?? [])->filter(function ($historyItem) {
                $state = mb_strtoupper($historyItem['state_name'] ?? '');
                return str_contains($state, 'PROGRESO') || str_contains($state, 'PROCESO');
            })->values();
        @endphp
        <section class="incident-record">
            <table class="record-metadata">
                <thead>
                    <tr><th scope="col">Ticket</th><th scope="col">Estado actual</th><th scope="col">Última asignación</th><th scope="col">Reaperturas</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="record-ticket">#{{ str_pad($incident['id'], 6, '0', STR_PAD_LEFT) }}</td>
                        <td>{{ mb_strtoupper($incident['state']['name'] ?? 'Desconocido') }}</td>
                        <td>{{ $item['latest_assignment_date'] ? \Carbon\Carbon::parse($item['latest_assignment_date'])->format('d/m/Y H:i') : 'Sin fecha' }}</td>
                        <td>{{ $item['reopen_count'] ?? 0 }}</td>
                    </tr>
                </tbody>
            </table>
            <table class="record-detail">
                <tr>
                    <th scope="col" class="record-summary">
                        <div class="record-title">{{ \Illuminate\Support\Str::limit($incident['title'], 95) }}</div>
                        <div class="record-classification">
                            <strong>Categoría:</strong> {{ $incident['category']['name'] ?? 'Sin categoría' }}<br>
                            <strong>Territorio:</strong> {{ $incident['territorial_unit']['name'] ?? 'Sin territorio' }}
                        </div>
                    </th>
                    <td class="history-cell">
                        <table class="history-table">
                            <thead>
                                <tr><th scope="col">N.º</th><th scope="col">Estado</th><th scope="col">Prioridad</th><th scope="col">Inicio</th><th scope="col">Duración</th><th scope="col">Responsable</th></tr>
                            </thead>
                            <tbody>
                                @forelse($filteredHistory as $historyItem)
                                    <tr>
                                        <td class="history-sequence">{{ $loop->iteration }}</td>
                                        <td class="history-state">{{ mb_strtoupper($historyItem['state_name']) }}</td>
                                        <td class="history-priority">{{ mb_strtoupper($historyItem['priority_name'] ?? '-') }}</td>
                                        <td class="history-date">{{ $historyItem['assignment_date'] ? \Carbon\Carbon::parse($historyItem['assignment_date'])->format('d/m/Y H:i') : '-' }}</td>
                                        <td class="history-duration">
                                            @if(isset($historyItem['duration_minutes']))
                                                {{ sprintf('%d h %02d min', intdiv((int) $historyItem['duration_minutes'], 60), (int) $historyItem['duration_minutes'] % 60) }}
                                            @else
                                                -
                                            @endif
                                        </td>
                                        <td class="history-owner">{{ $historyItem['assigned_by_name'] ?? 'Sistema' }}</td>
                                    </tr>
                                @empty
                                    <tr><td colspan="6" class="no-history">Sin ciclos de atención directa registrados.</td></tr>
                                @endforelse
                                @if(!empty($incident['state']['is_final_state']))
                                    <tr class="final-row">
                                        <td class="history-sequence">{{ $filteredHistory->count() + 1 }}</td>
                                        <td colspan="2">{{ mb_strtoupper($incident['state']['name']) }} · DEFINITIVO</td>
                                        <td>{{ !empty($incident['updated_at']) ? \Carbon\Carbon::parse($incident['updated_at'])->format('d/m/Y H:i') : '-' }}</td>
                                        <td>-</td><td>Cierre del caso</td>
                                    </tr>
                                @endif
                            </tbody>
                        </table>
                    </td>
                </tr>
            </table>
        </section>
    @empty
        <div class="empty-state">El operador no registra intervenciones para el alcance seleccionado.</div>
    @endforelse

    <section class="methodology">
        <div class="methodology-title">Nota metodológica</div>
        <strong>Carga laboral:</strong> puntos de esfuerzo de las incidencias activas.
        <strong>Promedio de respuesta:</strong> tiempo histórico entre asignación y resolución.
        <strong>Tasa de reapertura:</strong> proporción de casos resueltos que retornaron al flujo operativo.
        Las duraciones de ciclo corresponden exclusivamente a períodos de atención en progreso y se expresan en horas y minutos.
    </section>

    <table class="approval-strip">
        <tr>
            <th scope="col"><strong>Fuente:</strong> Sistema de Gestión de Incidencias Georreferenciadas</th>
            <th scope="col"><strong>Responsable:</strong> Dirección de Operaciones</th>
        </tr>
    </table>
</body>
</html>
