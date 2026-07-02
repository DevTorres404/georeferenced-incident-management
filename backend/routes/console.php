<?php

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\Notification;
use App\Shared\Infrastructure\Notifications\AdminNotifier;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('incidents:notify-operators', function () {
    $operatorUserIds = User::query()
        ->where('is_active', true)
        ->whereHas('roles', fn ($query) => $query->where('code', 'OPERADOR')->where('is_active', true))
        ->pluck('id')
        ->map(fn ($id) => (int) $id)
        ->all();

    if ($operatorUserIds === []) {
        $this->info('No hay operadores activos para notificar.');

        return 0;
    }

    $createNotificationIfMissing = function (int $userId, string $title, string $message, string $type): void {
        $exists = Notification::where('user_id', $userId)
            ->where('title', $title)
            ->where('message', $message)
            ->exists();

        if (! $exists) {
            Notification::create([
                'user_id' => $userId,
                'title' => $title,
                'message' => $message,
                'type' => $type,
            ]);

            app(AdminNotifier::class)->notify($title, $message, $type, [$userId]);
        }
    };

    $notifyOperators = function (string $title, string $message, string $type) use ($operatorUserIds, $createNotificationIfMissing): void {
        foreach ($operatorUserIds as $operatorUserId) {
            $createNotificationIfMissing($operatorUserId, $title, $message, $type);
        }
    };

    $unreviewedIncidents = Incident::query()
        ->whereNull('current_assigned_id')
        ->where('created_at', '<=', now()->subMinutes(30))
        ->whereHas('state', fn ($query) => $query->where('is_final_state', false))
        ->get();

    foreach ($unreviewedIncidents as $incident) {
        $notifyOperators(
            'Incidencia sin atender',
            "La incidencia {$incident->code} lleva 30 minutos sin revisión.",
            'INCIDENT_OVERDUE'
        );
    }

    $nearDueIncidents = Incident::query()
        ->whereNotNull('due_date')
        ->whereBetween('due_date', [now(), now()->addHour()])
        ->whereHas('state', fn ($query) => $query->where('is_final_state', false))
        ->get();

    foreach ($nearDueIncidents as $incident) {
        $message = "La incidencia {$incident->code} está cerca de superar el tiempo de atención.";

        if ($incident->current_assigned_id) {
            $createNotificationIfMissing(
                (int) $incident->current_assigned_id,
                'Incidencia próxima a vencer',
                $message,
                'INCIDENT_OVERDUE'
            );

            continue;
        }

        $notifyOperators('Incidencia próxima a vencer', $message, 'INCIDENT_OVERDUE');
    }

    $this->info('Notificaciones operativas procesadas correctamente.');

    return 0;
})->purpose('Genera notificaciones operativas para incidencias sin atender o proximas a vencer');

Artisan::command('incidents:notify-supervisors', function () {
    $supervisorUserIds = User::query()
        ->where('is_active', true)
        ->whereHas('roles', fn ($query) => $query->where('code', 'SUPERVISOR')->where('is_active', true))
        ->pluck('id')
        ->map(fn ($id) => (int) $id)
        ->all();

    if ($supervisorUserIds === []) {
        $this->info('No hay supervisores activos para notificar.');

        return 0;
    }

    $createNotificationIfMissing = function (int $userId, string $title, string $message, string $type): void {
        $exists = Notification::where('user_id', $userId)
            ->where('title', $title)
            ->where('message', $message)
            ->exists();

        if (! $exists) {
            Notification::create([
                'user_id' => $userId,
                'title' => $title,
                'message' => $message,
                'type' => $type,
            ]);

            app(AdminNotifier::class)->notify($title, $message, $type, [$userId]);
        }
    };

    $notifySupervisors = function (string $title, string $message, string $type) use ($supervisorUserIds, $createNotificationIfMissing): void {
        foreach ($supervisorUserIds as $supervisorUserId) {
            $createNotificationIfMissing($supervisorUserId, $title, $message, $type);
        }
    };

    $overdueIncidents = Incident::query()
        ->whereNotNull('due_date')
        ->where('due_date', '<', now())
        ->whereHas('state', fn ($query) => $query->where('is_final_state', false))
        ->get();

    foreach ($overdueIncidents as $incident) {
        $notifySupervisors(
            'Incidencia vencida por SLA',
            "La incidencia {$incident->code} superó el tiempo máximo de atención.",
            'INCIDENT_OVERDUE'
        );
    }

    $crowdedZones = Incident::query()
        ->select('territorial_unit_id', DB::raw('COUNT(*) as total'))
        ->where('created_at', '>=', now()->subDay())
        ->whereNotNull('territorial_unit_id')
        ->groupBy('territorial_unit_id')
        ->havingRaw('COUNT(*) >= 8')
        ->with('territorialUnit.parent.parent.parent')
        ->get();

    foreach ($crowdedZones as $zone) {
        $sector = $zone->territorialUnit?->full_path ?: "sector {$zone->territorial_unit_id}";
        $notifySupervisors(
            'Muchas incidencias en una zona',
            "Se detectaron {$zone->total} reportes similares en {$sector}.",
            'STATUS_CHANGE'
        );
    }

    $stalledAssignments = Incident::query()
        ->whereNotNull('current_assigned_id')
        ->where('updated_at', '<=', now()->subMinutes(30))
        ->whereHas('state', fn ($query) => $query->where('is_final_state', false))
        ->get();

    foreach ($stalledAssignments as $incident) {
        $notifySupervisors(
            'Operador no atiende incidencia',
            "Una incidencia asignada lleva demasiado tiempo sin avance: {$incident->code}.",
            'INCIDENT_OVERDUE'
        );
    }

    $todayStart = now()->startOfDay();
    $newToday = Incident::where('created_at', '>=', $todayStart)->count();
    $resolvedToday = Incident::where('resolution_date', '>=', $todayStart)->count();
    $overdueToday = Incident::query()
        ->whereNotNull('due_date')
        ->where('due_date', '<', now())
        ->whereHas('state', fn ($query) => $query->where('is_final_state', false))
        ->count();

    $notifySupervisors(
        'Reporte diario',
        "Resumen del día: {$newToday} incidencias nuevas, {$resolvedToday} resueltas, {$overdueToday} vencidas.",
        'STATUS_CHANGE'
    );

    $highLoads = Incident::query()
        ->select('current_assigned_id', DB::raw('COUNT(*) as total'))
        ->whereNotNull('current_assigned_id')
        ->whereHas('state', fn ($query) => $query->where('is_final_state', false))
        ->groupBy('current_assigned_id')
        ->havingRaw('COUNT(*) >= 10')
        ->with('currentAssignee')
        ->get();

    foreach ($highLoads as $load) {
        $operatorName = trim(($load->currentAssignee?->first_name ?? '') . ' ' . ($load->currentAssignee?->last_name ?? ''));
        $operatorLabel = $operatorName !== '' ? $operatorName : "Operador #{$load->current_assigned_id}";
        $notifySupervisors(
            'Carga alta de operadores',
            "{$operatorLabel} tiene demasiadas incidencias asignadas: {$load->total}.",
            'STATUS_CHANGE'
        );
    }

    $this->info('Notificaciones de supervisión procesadas correctamente.');

    return 0;
})->purpose('Genera notificaciones de control y seguimiento para supervisores');

Artisan::command('system:notify-admin-summary', function () {
    $from = now()->subWeek();
    $newIncidents = Incident::where('created_at', '>=', $from)->count();
    $closedIncidents = Incident::whereHas('state', fn ($query) => $query->whereIn('name', ['CERRADA', 'RESUELTA']))
        ->where('updated_at', '>=', $from)
        ->count();
    $overdueIncidents = Incident::query()
        ->whereNotNull('due_date')
        ->where('due_date', '<', now())
        ->whereHas('state', fn ($query) => $query->where('is_final_state', false))
        ->count();

    app(AdminNotifier::class)->notify(
        title: 'Resumen general',
        message: "Resumen semanal de actividad del sistema: {$newIncidents} nuevas, {$closedIncidents} cerradas o resueltas, {$overdueIncidents} vencidas.",
        type: 'STATUS_CHANGE'
    );

    $this->info('Resumen general enviado a administradores.');

    return 0;
})->purpose('Genera resumen semanal de actividad para administradores');
