<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <title>Reporte de Trabajo Operativo - {{ $operator['first_name'] }} {{ $operator['last_name'] }}</title>
    <style>
        @page {
            margin: 90px 35px 60px 35px;
        }
        body { 
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
            color: #333; 
            font-size: 10px;
            line-height: 1.5;
        }
        .header { 
            position: fixed; 
            top: -70px; 
            left: 0; 
            right: 0; 
            height: 50px; 
            border-bottom: 3px solid #1a5276; 
        }
        .header-logo {
            float: left;
            font-size: 26px;
            font-weight: 900;
            color: #1a5276;
            letter-spacing: -1px;
            line-height: 40px;
        }
        .header-text {
            float: right;
            text-align: right;
        }
        .header-title {
            font-size: 15px;
            font-weight: bold;
            color: #2c3e50;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 2px;
        }
        .header-subtitle {
            font-size: 9px;
            color: #7f8c8d;
        }
        .footer { 
            position: fixed; 
            bottom: -40px; 
            left: 0; 
            right: 0; 
            height: 25px; 
            border-top: 1px solid #e9ecef; 
            font-size: 9px; 
            color: #95a5a6; 
            text-align: center; 
            padding-top: 8px;
        }
        .page-number:before {
            content: "Página " counter(page);
        }
        
        /* Operator Info Card */
        .operator-info {
            background-color: #f8f9fa;
            border: 1px solid #e9ecef;
            padding: 12px 18px;
            border-radius: 6px;
            margin-bottom: 20px;
            border-left: 4px solid #1a5276;
        }
        .operator-info table {
            width: 100%;
            border-collapse: collapse;
        }
        .operator-info td {
            padding: 4px 0;
        }
        .operator-info td.label {
            color: #7f8c8d;
            font-weight: bold;
            text-transform: uppercase;
            font-size: 8px;
            width: 15%;
            letter-spacing: 0.5px;
        }
        .operator-info td.value {
            color: #2c3e50;
            font-weight: bold;
            font-size: 12px;
            width: 35%;
        }

        /* Metrics */
        .metrics-container {
            width: 100%;
            margin-bottom: 25px;
            text-align: justify;
        }
        .metric-box { 
            width: 18.5%; 
            display: inline-block; 
            border: 1px solid #e9ecef; 
            padding: 12px 0; 
            border-radius: 6px; 
            text-align: center;
            background-color: #ffffff;
            vertical-align: top;
        }
        .metric-title { 
            font-size: 8px; 
            color: #7f8c8d; 
            text-transform: uppercase; 
            font-weight: bold;
            margin-bottom: 4px;
            letter-spacing: 0.5px;
        }
        .metric-value { 
            font-size: 22px; 
            font-weight: 800; 
            color: #1a5276; 
            line-height: 1;
        }
        .metric-unit {
            font-size: 10px;
            color: #95a5a6;
            font-weight: normal;
        }

        /* Data Table */
        .section-title {
            font-size: 12px;
            color: #1a5276;
            border-bottom: 2px solid #ecf0f1;
            padding-bottom: 6px;
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: bold;
        }
        table.data-table { 
            width: 100%; 
            border-collapse: collapse; 
            font-size: 9px;
        }
        .data-table th, .data-table td { 
            border-bottom: 1px solid #ecf0f1; 
            padding: 8px 6px; 
            text-align: left; 
            vertical-align: top;
        }
        .data-table th { 
            background-color: #f8f9fa; 
            color: #2c3e50; 
            font-size: 8.5px;
            text-transform: uppercase;
            font-weight: bold;
            letter-spacing: 0.5px;
            border-top: 1px solid #ecf0f1;
            border-bottom: 2px solid #e9ecef;
        }
        
        .cycle-table {
            width: 100%;
            border-collapse: collapse;
        }
        .cycle-table td {
            border: none;
            padding: 3px 0;
            vertical-align: top;
        }
        .cycle-number {
            width: 15px;
        }
        .cycle-badge {
            background-color: #1a5276;
            color: #ffffff;
            text-align: center;
            font-size: 7.5px;
            font-weight: bold;
            border-radius: 3px;
            padding: 2px 0;
            width: 100%;
            display: inline-block;
        }
        .cycle-content {
            padding-left: 6px;
            border-left: 1px dashed #bdc3c7;
        }

        .empty-state {
            text-align: center;
            padding: 30px;
            background-color: #f8f9fa;
            color: #7f8c8d;
            border: 1px dashed #bdc3c7;
            border-radius: 6px;
            font-size: 11px;
        }
        .ticket-id {
            font-family: 'Courier New', Courier, monospace;
            font-weight: bold;
            font-size: 10px;
            color: #2980b9;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-logo">SGI</div>
        <div class="header-text">
            <div class="header-title">Reporte de Desempeño Operativo</div>
            <div class="header-subtitle">Documento de uso institucional y confidencial</div>
        </div>
    </div>

    <div class="footer">
        Sistema de Gestión de Incidencias (SGI) &nbsp;&bull;&nbsp; Generado: {{ now()->format('d/m/Y H:i') }} &nbsp;&bull;&nbsp; <span class="page-number"></span>
    </div>

    <div class="operator-info">
        <table>
            <tr>
                <td class="label">Operador:</td>
                <td class="value">{{ $operator['first_name'] }} {{ $operator['last_name'] }}</td>
                <td class="label">ID Sistema:</td>
                <td class="value">#{{ str_pad($operator['id'], 5, '0', STR_PAD_LEFT) }}</td>
            </tr>
            <tr>
                <td class="label">Correo:</td>
                <td class="value">{{ $operator['email'] }}</td>
                <td class="label">Período:</td>
                <td class="value">Histórico Completo</td>
            </tr>
        </table>
    </div>

    <div class="metrics-container">
        <div class="metric-box" style="margin-right: 1%;">
            <div class="metric-title">Carga Laboral</div>
            <div class="metric-value">{{ $metrics['current_workload'] }}<span class="metric-unit">pts</span></div>
        </div>
        <div class="metric-box" style="margin-right: 1%;">
            <div class="metric-title">Carga Histórica</div>
            <div class="metric-value">{{ $metrics['total_assigned'] }}</div>
        </div>
        <div class="metric-box" style="margin-right: 1%;">
            <div class="metric-title">Casos Resueltos</div>
            <div class="metric-value">{{ $metrics['total_resolved'] }}</div>
        </div>
        <div class="metric-box" style="margin-right: 1%;">
            <div class="metric-title">Prom. Respuesta</div>
            <div class="metric-value">{{ $metrics['avg_response_hours'] }}<span class="metric-unit">h</span></div>
        </div>
        <div class="metric-box">
            <div class="metric-title">Tasa Reapertura</div>
            <div class="metric-value">{{ $metrics['reopen_rate'] }}<span class="metric-unit">%</span></div>
        </div>
    </div>

    <h3 class="section-title">Registro de Intervenciones Operativas ({{ count($recent_incidents) }})</h3>
    
    @if(count($recent_incidents) === 0)
        <div class="empty-state">
            El operador no registra incidencias asignadas en el período actual.
        </div>
    @else
        <table class="data-table">
            <thead>
                <tr>
                    <th width="8%">Ticket</th>
                    <th width="24%">Detalle del Caso</th>
                    <th width="15%">Estado Actual</th>
                    <th width="15%">Última Asignación</th>
                    <th width="38%">Historial de Ciclos (Operador)</th>
                </tr>
            </thead>
            <tbody>
                @foreach($recent_incidents as $item)
                    <tr>
                        <td><span class="ticket-id">#{{ str_pad($item['incident']['id'], 6, '0', STR_PAD_LEFT) }}</span></td>
                        <td>
                            <strong style="color: #2c3e50; display: block; margin-bottom: 3px; font-size: 10px;">{{ \Illuminate\Support\Str::limit($item['incident']['title'], 45) }}</strong>
                            <span style="color: #7f8c8d; font-size: 8px; display: block;">Cat: {{ $item['incident']['category']['name'] ?? '-' }}</span>
                            <span style="color: #7f8c8d; font-size: 8px; display: block;">Territorio: {{ $item['incident']['territorial_unit']['name'] ?? 'No especificada' }}</span>
                        </td>
                        <td>
                            @php 
                                $stateColor = $item['incident']['state']['color'] ?? '#95a5a6';
                                $stateName = $item['incident']['state']['name'] ?? 'Desconocido';
                            @endphp
                            <span style="color: {{ $stateColor }}; font-weight: bold; font-size: 9px; padding: 2px 4px; border: 1px solid {{ $stateColor }}; border-radius: 3px; display: inline-block;">
                                {{ mb_strtoupper($stateName) }}
                            </span>
                        </td>
                        <td style="color: #555; font-size: 9px;">
                            {{ \Carbon\Carbon::parse($item['latest_assignment_date'])->format('d/m/Y') }}<br>
                            <span style="color: #95a5a6; font-size: 8px;">{{ \Carbon\Carbon::parse($item['latest_assignment_date'])->format('H:i') }} hrs</span>
                        </td>
                        <td>
                            @php
                                $filteredHistory = collect($item['history'] ?? [])->filter(function($h) {
                                    $state = mb_strtoupper($h['state_name']);
                                    return str_contains($state, 'PROGRESO') || str_contains($state, 'PROCESO');
                                })->values()->all();
                            @endphp
                            
                            @if(count($filteredHistory) > 0)
                                <table class="cycle-table">
                                @foreach($filteredHistory as $idx => $h)
                                    <tr>
                                        <td class="cycle-number">
                                            <div class="cycle-badge">{{ $idx + 1 }}</div>
                                        </td>
                                        <td class="cycle-content">
                                            <strong style="font-size: 8.5px; color: #2c3e50;">{{ mb_strtoupper($h['state_name']) }}</strong>
                                            <span style="font-size: 7px; color: #7f8c8d;"> - PRIORIDAD: {{ mb_strtoupper($h['priority_name']) }}</span>
                                            
                                            <div style="font-size: 7.5px; color: #555; margin-top: 3px;">
                                                <span style="color: #7f8c8d;">Inició trabajo (Ingreso):</span> 
                                                {{ $h['assignment_date'] ? \Carbon\Carbon::parse($h['assignment_date'])->format('d/m/Y H:i') : '-' }}
                                            </div>
                                            
                                            @if(isset($h['duration_minutes'])) 
                                            <div style="font-size: 7.5px; color: #555; margin-top: 1.5px;">
                                                <span style="color: #7f8c8d;">Finalizó / Pasó a resuelta:</span> 
                                                <strong>{{ $h['assignment_date'] ? \Carbon\Carbon::parse($h['assignment_date'])->addMinutes($h['duration_minutes'])->format('d/m/Y H:i') : '-' }}</strong>
                                            </div>
                                            <div style="font-size: 7.5px; color: #d35400; margin-top: 1.5px;">
                                                <span>Tiempo de trabajo operativo:</span> 
                                                <strong>{{ $h['duration_minutes'] }} min</strong>
                                            </div>
                                            @endif
                                            
                                            <div style="font-size: 7.5px; color: #7f8c8d; margin-top: 1.5px;">
                                                <span>Cambiado a este estado por:</span> 
                                                <strong>{{ $h['assigned_by_name'] ?? 'Sistema Automático' }}</strong>
                                            </div>
                                        </td>
                                    </tr>
                                @endforeach
                                
                                @if(isset($item['incident']['state']) && !empty($item['incident']['state']['is_final_state']))
                                    <tr>
                                        <td class="cycle-number">
                                            <div class="cycle-badge" style="background-color: #27ae60;">{{ count($filteredHistory) + 1 }}</div>
                                        </td>
                                        <td class="cycle-content">
                                            <strong style="font-size: 8.5px; color: #27ae60;">{{ mb_strtoupper($item['incident']['state']['name']) }} (ESTADO DEFINITIVO)</strong>
                                            
                                            <div style="font-size: 7.5px; color: #555; margin-top: 3px;">
                                                <span style="color: #7f8c8d;">Fecha de cierre:</span> 
                                                {{ $item['incident']['updated_at'] ? \Carbon\Carbon::parse($item['incident']['updated_at'])->format('d/m/Y H:i') : '-' }}
                                            </div>
                                            <div style="font-size: 7.5px; color: #e74c3c; margin-top: 1.5px;">
                                                <span>* La incidencia ya no admite más actualizaciones de estado.</span>
                                            </div>
                                        </td>
                                    </tr>
                                @endif
                                
                                </table>
                            @else
                                <span style="color: #95a5a6; font-style: italic;">Sin intervenciones directas registradas</span>
                            @endif
                        </td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif

    <div style="margin-top: 30px; padding: 15px; background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; page-break-inside: avoid;">
        <h4 style="font-size: 11px; color: #1a5276; margin-top: 0; margin-bottom: 10px; text-transform: uppercase; border-bottom: 1px solid #e9ecef; padding-bottom: 5px;">Glosario de Términos del Reporte</h4>
        <table style="width: 100%; border: none; font-size: 8.5px; color: #555; line-height: 1.4;">
            <tr>
                <td style="width: 50%; vertical-align: top; padding-right: 15px;">
                    <strong style="color: #2c3e50;">Carga Laboral:</strong> Puntos de esfuerzo actuales del operador basados en la complejidad de sus incidencias activas.<br><br>
                    <strong style="color: #2c3e50;">Tiempo de trabajo operativo (Ciclos):</strong> Cantidad total de minutos que la incidencia permaneció exclusivamente en estado <b>En Progreso / En Proceso</b>. Representa el tiempo real de atención por parte del operador antes de resolverse.<br><br>
                    <strong style="color: #2c3e50;">Cambiado a este estado por:</strong> Identifica al usuario que ejecutó la acción de mover la incidencia hacia ese estado particular.
                </td>
                <td style="width: 50%; vertical-align: top;">
                    <strong style="color: #2c3e50;">Carga Histórica / Casos Resueltos:</strong> Total de tickets que pasaron por el operador y total de tickets que el operador cerró exitosamente.<br><br>
                    <strong style="color: #2c3e50;">Prom. Respuesta:</strong> Tiempo promedio histórico que tarda el operador en resolver una incidencia desde el momento en que se le asigna.<br><br>
                    <strong style="color: #2c3e50;">Tasa Reapertura:</strong> Porcentaje de incidencias que fueron dadas por resueltas pero tuvieron que ser reabiertas posteriormente (ej: por rechazo del supervisor).
                </td>
            </tr>
        </table>
    </div>
</body>
</html>
