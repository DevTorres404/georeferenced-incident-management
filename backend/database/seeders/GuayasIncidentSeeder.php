<?php

namespace Database\Seeders;

use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAssignment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentComment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentState;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Incidents\Infrastructure\Persistence\Models\Subcategory;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Faker\Factory as Faker;

class GuayasIncidentSeeder extends Seeder
{
    public function run(): void
    {
        $faker = Faker::create('es_ES');

        $supervisor = User::whereHas('roles', function ($query) {
            $query->where('code', 'SUPERVISOR');
        })->first();
        
        $operators = User::whereHas('roles', function ($query) {
            $query->where('code', 'OPERADOR');
        })->get();

        $reporter = User::where('email', 'ciudadano1@incidents.local')->first() ?? User::first();

        // Get Guayaquil canton which belongs to Zone 8
        $guayas = TerritorialUnit::where('name', 'Guayaquil')->where('type', TerritorialUnit::TYPE_CANTON)->first() 
            ?? TerritorialUnit::where('type', TerritorialUnit::TYPE_CANTON)->first();
        
        $categories = Category::all();
        $priorities = Priority::all();
        $states = State::all();

        if ($categories->isEmpty() || $priorities->isEmpty() || $states->isEmpty() || !$guayas || $operators->isEmpty() || !$supervisor) {
            $this->command->info('Faltan catálogos o usuarios base. Ejecute DatabaseSeeder primero.');
            return;
        }

        $this->command->info('Generando 50 incidencias reales en Guayas (con comentarios y trazabilidad)...');

        $incidentTitles = [
            'Fuga de agua en la vía principal',
            'Luminaria apagada en parque',
            'Contenedor de basura desbordado',
            'Semáforo dañado en intersección',
            'Bache profundo en la calzada',
            'Alcantarilla sin tapa',
            'Acumulación de basura en esquina',
            'Poste a punto de caer',
            'Tubería rota inundando la calle',
            'Árbol caído bloqueando el paso',
            'Falta de señalización escolar',
            'Paradero en mal estado',
            'Cables eléctricos expuestos',
            'Inundación por lluvias',
            'Derrumbe leve en vía'
        ];

        $incidentDescriptions = [
            'El problema persiste desde hace varios días y causa malestar en la zona. Solicitamos atención urgente.',
            'Se ha reportado previamente pero no ha habido solución. Afecta el tránsito de los moradores.',
            'Genera un riesgo para los peatones y vehículos que transitan por el sector, especialmente de noche.',
            'Está empeorando con el clima. Vecinos piden que se atienda antes de que ocurra un accidente.',
            'El daño es considerable y ya ha provocado incidentes menores. Por favor enviar equipo técnico.'
        ];

        DB::transaction(function () use ($supervisor, $operators, $reporter, $guayas, $categories, $priorities, $states, $incidentTitles, $incidentDescriptions) {
            for ($i = 0; $i < 50; $i++) {
                $createdAt = Carbon::now()->subDays(rand(1, 90));
                $state = $states->random();
                $isClosed = in_array(strtolower($state->name), ['cerrada', 'resuelta', 'reparada']);
                $resolutionDate = $isClosed ? (clone $createdAt)->addDays(rand(1, 10)) : null;
                $operator = $operators->random();

                $category = $categories->random();
                // Get a subcategory
                $subcategory = Subcategory::where('category_id', $category->id)->inRandomOrder()->first();

                // Realistic Guayaquil addresses
                $addresses = [
                    'Av. 9 de Octubre y Boyacá', 'Urdesa Central, Víctor Emilio Estrada', 'Alborada 12va Etapa',
                    'Av. Francisco de Orellana', 'Sauces 8, Mz. 14', 'Vía a la Costa Km 12',
                    'Samanes 4, cerca del parque', 'Av. Domingo Comín y Portete', 'La Florida, calle principal',
                    'Mucho Lote 2, Etapa 3', 'Garzota 1ra etapa', 'Mapasingue Este, Av. 3ra'
                ];
                $addr = $addresses[array_rand($addresses)];

                $incident = Incident::create([
                    'code' => 'INC-GYE-' . rand(1000, 9999) . '-' . date('Y', $createdAt->timestamp),
                    'title' => $incidentTitles[array_rand($incidentTitles)],
                    'description' => $incidentDescriptions[array_rand($incidentDescriptions)],
                    'address' => $addr,
                    'address_reference' => 'Cerca de ' . $addr,
                    'reported_by_id' => $reporter->id,
                    'category_id' => $category->id,
                    'subcategory_id' => $subcategory ? $subcategory->id : null,
                    'priority_id' => $priorities->random()->id,
                    'state_id' => $state->id,
                    'territorial_unit_id' => $guayas->id,
                    'latitude' => -2.196160 + (rand(-100, 100) / 10000),
                    'longitude' => -79.886208 + (rand(-100, 100) / 10000),
                    'resolution_date' => $resolutionDate,
                    'created_at' => $createdAt,
                    'updated_at' => Carbon::now(),
                ]);

                // 1. Seed State History
                $this->seedStateHistory($incident, $state, $reporter, $operator, $supervisor, $createdAt);

                // 2. Seed Assignment (if not NUEVA/RECHAZADA/EN_REVISION)
                if (!in_array($state->name, ['NUEVA', 'RECHAZADA', 'EN_REVISION'])) {
                    $this->seedAssignment($incident, $operator, $supervisor, $createdAt, $isClosed, $resolutionDate);
                }

                // 3. Seed Comments
                $this->seedComments($incident, $operator, $reporter, $supervisor, $createdAt, $state);
            }
        });

        $this->command->info('Incidencias en Guayas inyectadas con datos completos (historial, asignaciones, comentarios).');
    }

    private function seedStateHistory(Incident $incident, State $finalState, User $reporter, User $operator, User $supervisor, Carbon $createdAt): void
    {
        $flow = [
            'NUEVA' => ['NUEVA'],
            'EN_REVISION' => ['NUEVA', 'EN_REVISION'],
            'EN_PROGRESO' => ['NUEVA', 'EN_REVISION', 'EN_PROGRESO'],
            'RESUELTA' => ['NUEVA', 'EN_REVISION', 'EN_PROGRESO', 'RESUELTA'],
            'CERRADA' => ['NUEVA', 'EN_REVISION', 'EN_PROGRESO', 'RESUELTA', 'CERRADA'],
            'RECHAZADA' => ['NUEVA', 'EN_REVISION', 'RECHAZADA'],
            'REABIERTA' => ['NUEVA', 'EN_REVISION', 'EN_PROGRESO', 'RESUELTA', 'CERRADA', 'REABIERTA'],
        ][$finalState->name] ?? ['NUEVA'];

        $previousStateId = null;
        foreach ($flow as $index => $stateName) {
            $newState = State::where('name', $stateName)->first();
            if (!$newState) continue;

            $actor = $index === 0
                ? $reporter
                : (in_array($stateName, ['EN_PROGRESO', 'RESUELTA'], true) ? $operator : $supervisor);

            IncidentState::create([
                'incident_id' => $incident->id,
                'previous_state_id' => $previousStateId,
                'new_state_id' => $newState->id,
                'user_id' => $actor->id,
                'comment' => $this->stateComment($stateName),
                'created_at' => $createdAt->copy()->addHours($index * 6),
            ]);

            $previousStateId = $newState->id;
        }
    }

    private function seedAssignment(Incident $incident, User $operator, User $supervisor, Carbon $createdAt, bool $isClosed, ?Carbon $resolutionDate): void
    {
        $assignmentDate = $createdAt->copy()->addHours(12);

        IncidentAssignment::create([
            'incident_id' => $incident->id,
            'user_id' => $operator->id,
            'assigned_by_id' => $supervisor->id,
            'assignment_role' => IncidentAssignment::ROLE_PRIMARY,
            'active' => !$isClosed,
            'assignment_date' => $assignmentDate,
            'unassignment_date' => $isClosed ? ($resolutionDate ?? Carbon::now()) : null,
            'created_at' => $assignmentDate,
            'updated_at' => $isClosed ? Carbon::now() : $assignmentDate,
        ]);
    }

    private function seedComments(Incident $incident, User $operator, User $reporter, User $supervisor, Carbon $createdAt, State $state): void
    {
        $realComments = [
            'Se valida prioridad por posible afectación vial.',
            'Se revisará el circuito de alimentación esta noche.',
            'La zona queda muy oscura después de las 19h00, por favor ayuda urgente.',
            'Se retiró el material acumulado y se limpió el área.',
            'Cierre validado con evidencia del operador.',
            'El agua se volvió a acumular en la esquina, favor revisar.',
            'Equipo técnico se encuentra en camino al sitio.',
            'Se requiere apoyo de tránsito para cerrar la vía.',
            'Trabajo completado según especificaciones técnicas.',
            'Ciudadano confirma que el problema fue solucionado.'
        ];

        $numComments = rand(1, 4);
        for ($c = 0; $c < $numComments; $c++) {
            $isInternal = rand(0, 1) === 1;
            $actor = rand(0, 2) === 0 ? $operator : (rand(0, 1) === 0 ? $supervisor : $reporter);
            
            if ($actor->id === $reporter->id) {
                $isInternal = false;
            }

            IncidentComment::create([
                'incident_id' => $incident->id,
                'user_id' => $actor->id,
                'comment' => $realComments[array_rand($realComments)],
                'is_internal' => $isInternal,
                'created_at' => $createdAt->copy()->addHours(2 + $c),
                'updated_at' => $createdAt->copy()->addHours(2 + $c),
            ]);
        }
    }

    private function stateComment(string $stateName): ?string
    {
        return [
            'NUEVA' => 'Incidencia registrada por el ciudadano en la zona Guayas.',
            'EN_REVISION' => 'Incidencia enviada a revisión operativa.',
            'EN_PROGRESO' => 'Incidencia asignada a operador.',
            'RESUELTA' => 'Trabajo reportado como resuelto en campo.',
            'CERRADA' => 'Resolución validada y cerrada por supervisor.',
            'RECHAZADA' => 'Incidencia rechazada por no proceder.',
            'REABIERTA' => 'Ciudadano solicita nueva revisión.',
        ][$stateName] ?? null;
    }
}
