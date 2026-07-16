<?php

namespace Database\Seeders;

use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Incidents\Infrastructure\Persistence\Models\StateTransition;
use Illuminate\Database\Seeder;

/**
 * Seeder de states y transitions del flujo de trabajo.
 */
class StateSeeder extends Seeder
{
    public function run(): void
    {
        // ──────────────────────────────────────────────
        // Estados del ciclo de vida
        // ──────────────────────────────────────────────
        $states = [
            [
                'name'              => 'NUEVA',
                'description'       => 'Incidencia recién reportada, pendiente de revisión',
                'color'             => '#3B82F6',
                'is_initial_state'  => true,
                'is_final_state'    => false,
                'allows_edition'    => true,
                'order'             => 1,
            ],
            [
                'name'              => 'EN_REVISION',
                'description'       => 'Siendo evaluada por un supervisor',
                'color'             => '#F59E0B',
                'is_initial_state'  => false,
                'is_final_state'    => false,
                'allows_edition'    => true,
                'order'             => 2,
            ],
            [
                'name'              => 'EN_PROGRESO',
                'description'       => 'Asignada a un operador y en proceso de resolución',
                'color'             => '#8B5CF6',
                'is_initial_state'  => false,
                'is_final_state'    => false,
                'allows_edition'    => false,
                'order'             => 3,
            ],
            [
                'name'              => 'RESUELTA',
                'description'       => 'El operador ha completado la resolución',
                'color'             => '#10B981',
                'is_initial_state'  => false,
                'is_final_state'    => false,
                'allows_edition'    => false,
                'order'             => 4,
            ],
            [
                'name'              => 'CERRADA',
                'description'       => 'Confirmada como resuelta satisfactoriamente',
                'color'             => '#6B7280',
                'is_initial_state'  => false,
                'is_final_state'    => true,
                'allows_edition'    => false,
                'order'             => 5,
            ],
            [
                'name'              => 'RECHAZADA',
                'description'       => 'No procede o duplicada',
                'color'             => '#EF4444',
                'is_initial_state'  => false,
                'is_final_state'    => true,
                'allows_edition'    => false,
                'order'             => 6,
            ],
            [
                'name'              => 'REABIERTA',
                'description'       => 'Reabierta por supervisión después del cierre',
                'color'             => '#F97316',
                'is_initial_state'  => false,
                'is_final_state'    => false,
                'allows_edition'    => true,
                'order'             => 7,
            ],
        ];

        foreach ($states as $estado) {
            State::updateOrCreate(
                ['name' => $estado['name']],
                $estado
            );
        }

        $resolvedId = State::where('name', 'RESUELTA')->value('id');
        $reopenedId = State::where('name', 'REABIERTA')->value('id');

        if ($resolvedId && $reopenedId) {
            StateTransition::where('source_state_id', $resolvedId)
                ->where('target_state_id', $reopenedId)
                ->delete();
        }

        // ──────────────────────────────────────────────
        // Transiciones válidas entre states
        // ──────────────────────────────────────────────
        $transitions = [
            // NUEVA → EN_REVISION (Supervisor revisa)
            ['origen' => 'NUEVA',       'destino' => 'EN_REVISION',  'comment' => false, 'roles' => ['ADMIN', 'SUPERVISOR']],
            // NUEVA → RECHAZADA (Supervisor descarta)
            ['origen' => 'NUEVA',       'destino' => 'RECHAZADA',    'comment' => true,  'roles' => ['ADMIN', 'SUPERVISOR']],

            // EN_REVISION → EN_PROGRESO (Se asigna operador)
            ['origen' => 'EN_REVISION', 'destino' => 'EN_PROGRESO',  'comment' => false, 'roles' => ['ADMIN', 'SUPERVISOR']],
            // EN_REVISION → RECHAZADA
            ['origen' => 'EN_REVISION', 'destino' => 'RECHAZADA',    'comment' => true,  'roles' => ['ADMIN', 'SUPERVISOR']],

            // EN_PROGRESO → RESUELTA (Operador completa)
            ['origen' => 'EN_PROGRESO', 'destino' => 'RESUELTA',     'comment' => true,  'roles' => ['ADMIN', 'SUPERVISOR', 'OPERADOR']],

            // RESUELTA → CERRADA (Supervisor confirma)
            ['origen' => 'RESUELTA',    'destino' => 'CERRADA',      'comment' => false, 'roles' => ['ADMIN', 'SUPERVISOR']],

            // CERRADA → REABIERTA (Supervisión reabre para nueva revisión)
            ['origen' => 'CERRADA',     'destino' => 'REABIERTA',    'comment' => true,  'roles' => ['ADMIN', 'SUPERVISOR']],

            // REABIERTA → EN_REVISION (Se vuelve a revisar)
            ['origen' => 'REABIERTA',   'destino' => 'EN_REVISION',  'comment' => false, 'roles' => ['ADMIN', 'SUPERVISOR']],
        ];

        foreach ($transitions as $t) {
            $origenId  = State::where('name', $t['origen'])->value('id');
            $destinoId = State::where('name', $t['destino'])->value('id');

            if ($origenId && $destinoId) {
                StateTransition::updateOrCreate(
                    [
                        'source_state_id'  => $origenId,
                        'target_state_id' => $destinoId,
                    ],
                    [
                        'requires_comment' => $t['comment'],
                        'allowed_roles'    => $t['roles'],
                        'is_active'        => true,
                    ]
                );
            }
        }
    }
}
