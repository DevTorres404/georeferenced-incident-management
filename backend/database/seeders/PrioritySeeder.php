<?php

namespace Database\Seeders;

use App\Incidents\Infrastructure\Persistence\Models\Priority;
use Illuminate\Database\Seeder;

/**
 * Seeder de niveles de prioridad con SLA en horas.
 */
class PrioritySeeder extends Seeder
{
    public function run(): void
    {
        $priorities = [
            [
                'name'      => 'Crítica',
                'level'     => 1,
                'color'     => '#DC2626',
                'sla_hours' => 8,
            ],
            [
                'name'      => 'Alta',
                'level'     => 2,
                'color'     => '#F97316',
                'sla_hours' => 24,
            ],
            [
                'name'      => 'Media',
                'level'     => 3,
                'color'     => '#EAB308',
                'sla_hours' => 72,
            ],
            [
                'name'      => 'Baja',
                'level'     => 4,
                'color'     => '#22C55E',
                'sla_hours' => 168, // 7 días
            ],
        ];

        foreach ($priorities as $prioridad) {
            Priority::updateOrCreate(
                ['level' => $prioridad['level']],
                $prioridad
            );
        }
    }
}

