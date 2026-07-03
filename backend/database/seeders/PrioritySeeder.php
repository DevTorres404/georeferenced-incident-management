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
                'name' => 'Crítica',
                'level' => 1,
                'color' => '#DC2626',
                'sla_hours' => 8,
                'weight' => 5,
            ],
            [
                'name' => 'Alta',
                'level' => 2,
                'color' => '#F97316',
                'sla_hours' => 24,
                'weight' => 3,
            ],
            [
                'name' => 'Media',
                'level' => 3,
                'color' => '#EAB308',
                'sla_hours' => 72,
                'weight' => 2,
            ],
            [
                'name' => 'Baja',
                'level' => 4,
                'color' => '#22C55E',
                'sla_hours' => 168,
                'weight' => 1,
            ],
        ];

        foreach ($priorities as $priority) {
            Priority::updateOrCreate(
                ['level' => $priority['level']],
                $priority
            );
        }
    }
}
