<?php

use App\Incidents\Infrastructure\Notifications\OperationalIncidentNotifier;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Shared\Infrastructure\Notifications\AdminNotifier;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('incidents:notify-operators', function (OperationalIncidentNotifier $notifier) {
    $created = $notifier->notifyOperators();
    $this->info("Notificaciones operativas procesadas correctamente: {$created} creadas.");

    return 0;
})->purpose('Genera alertas para incidencias sin atender o proximas a vencer segun zona y asignacion');

Artisan::command('incidents:notify-supervisors', function (OperationalIncidentNotifier $notifier) {
    $created = $notifier->notifySupervisors();
    $this->info("Notificaciones de supervision procesadas correctamente: {$created} creadas.");

    return 0;
})->purpose('Genera alertas de control segmentadas por la zona de cada supervisor');

Artisan::command('system:notify-admin-summary', function (AdminNotifier $adminNotifier) {
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

    $adminNotifier->notify(
        title: 'Resumen general',
        message: "Resumen semanal de actividad del sistema: {$newIncidents} nuevas, {$closedIncidents} cerradas o resueltas, {$overdueIncidents} vencidas.",
        type: 'STATUS_CHANGE'
    );

    $this->info('Resumen general enviado a administradores.');

    return 0;
})->purpose('Genera resumen semanal de actividad para administradores');
