<?php

namespace Database\Seeders;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Notification;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class DemoNotificationSeeder extends Seeder
{
    public function run(): void
    {
        $notifications = [
            [
                'email' => 'supervisor@incidents.local',
                'title' => 'Demo: nuevas incidencias pendientes',
                'message' => 'Hay incidencias nuevas esperando revision y asignacion.',
                'type' => 'STATUS_CHANGE',
                'is_read' => false,
            ],
            [
                'email' => 'operador1@incidents.local',
                'title' => 'Demo: incidencia asignada',
                'message' => 'Tienes una incidencia de alumbrado publico en progreso.',
                'type' => 'INCIDENT_ASSIGNED',
                'is_read' => false,
            ],
            [
                'email' => 'operador2@incidents.local',
                'title' => 'Demo: comentario interno',
                'message' => 'El supervisor agrego una nota interna para seguimiento.',
                'type' => 'NEW_COMMENT',
                'is_read' => true,
            ],
            [
                'email' => 'ciudadano1@incidents.local',
                'title' => 'Demo: reporte actualizado',
                'message' => 'Tu incidencia fue actualizada por el equipo operativo.',
                'type' => 'STATUS_CHANGE',
                'is_read' => false,
            ],
            [
                'email' => 'ciudadano2@incidents.local',
                'title' => 'Demo: incidencia cerrada',
                'message' => 'Una de tus incidencias fue cerrada satisfactoriamente.',
                'type' => 'INCIDENT_CLOSED',
                'is_read' => true,
            ],
        ];

        Notification::where('title', 'like', 'Demo:%')->delete();

        foreach ($notifications as $data) {
            $user = User::where('email', $data['email'])->firstOrFail();
            unset($data['email']);

            Notification::create([
                ...$data,
                'user_id' => $user->id,
                'read_at' => $data['is_read'] ? Carbon::now()->subMinutes(30) : null,
            ]);
        }
    }
}
