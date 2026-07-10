<?php

namespace Database\Seeders;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Incidents\Infrastructure\Persistence\Models\Subcategory;
use App\Incidents\Infrastructure\Persistence\Models\IncidentState;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAssignment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentComment;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class DemoIncidentSeeder extends Seeder
{
    public function run(): void
    {
        $supervisor = $this->user('supervisor@incidents.local');
        $operatorOne = $this->user('operador1@incidents.local');
        $operatorTwo = $this->user('operador2@incidents.local');

        $incidents = [
            [
                'code' => 'DEMO-2026-0001',
                'title' => 'Bache profundo en avenida principal',
                'description' => 'Bache de gran tamano que afecta la circulacion vehicular y representa riesgo para motos.',
                'category' => 'Vialidad',
                'subcategory' => 'Bache',
                'priority_level' => 2,
                'state' => 'NUEVA',
                'territorial_unit' => 'Quito',
                'address' => 'Av. Naciones Unidas y Amazonas',
                'latitude' => -0.180653,
                'longitude' => -78.467834,
                'reporter' => 'ciudadano1@incidents.local',
                'created_at' => Carbon::now()->subHours(5),
                'comments' => [
                    ['author' => 'ciudadano1@incidents.local', 'comment' => 'El bache ocupa casi medio carril.', 'internal' => false],
                ],
            ],
            [
                'code' => 'DEMO-2026-0002',
                'title' => 'Fuga de agua en interseccion',
                'description' => 'Fuga constante en la vereda, el agua llega hasta la calzada y genera congestion.',
                'category' => 'Servicios Publicos',
                'subcategory' => 'Fuga de agua',
                'priority_level' => 1,
                'state' => 'EN_REVISION',
                'territorial_unit' => 'Guayaquil',
                'address' => 'Av. 9 de Octubre y Chile',
                'latitude' => -2.190317,
                'longitude' => -79.886207,
                'reporter' => 'ciudadano2@incidents.local',
                'created_at' => Carbon::now()->subHours(10),
                'comments' => [
                    ['author' => 'supervisor@incidents.local', 'comment' => 'Se valida prioridad por posible afectacion vial.', 'internal' => true],
                ],
            ],
            [
                'code' => 'DEMO-2026-0003',
                'title' => 'Luminaria apagada en parque barrial',
                'description' => 'La luminaria principal del parque no funciona desde hace varios dias.',
                'category' => 'Alumbrado Publico',
                'subcategory' => 'Luminaria apagada',
                'priority_level' => 3,
                'state' => 'EN_PROGRESO',
                'territorial_unit' => 'Cuenca',
                'address' => 'Parque Calderon, costado norte',
                'latitude' => -2.897414,
                'longitude' => -79.004481,
                'reporter' => 'ciudadano3@incidents.local',
                'assignee' => $operatorOne,
                'assigned_by' => $supervisor,
                'created_at' => Carbon::now()->subDays(1),
                'comments' => [
                    ['author' => 'operador1@incidents.local', 'comment' => 'Se revisara el circuito de alimentacion.', 'internal' => true],
                    ['author' => 'ciudadano3@incidents.local', 'comment' => 'La zona queda muy oscura despues de las 19h00.', 'internal' => false],
                ],
            ],
            [
                'code' => 'DEMO-2026-0004',
                'title' => 'Contenedor de basura desbordado',
                'description' => 'Contenedor lleno con residuos fuera del punto de recoleccion.',
                'category' => 'Recoleccion de Residuos',
                'subcategory' => 'Contenedor lleno',
                'priority_level' => 3,
                'state' => 'RESUELTA',
                'territorial_unit' => 'Manta',
                'address' => 'Calle 13 y Av. 24',
                'latitude' => -0.967653,
                'longitude' => -80.708911,
                'reporter' => 'ciudadano1@incidents.local',
                'assignee' => $operatorTwo,
                'assigned_by' => $supervisor,
                'created_at' => Carbon::now()->subDays(3),
                'resolution_date' => Carbon::now()->subHours(8),
                'comments' => [
                    ['author' => 'operador2@incidents.local', 'comment' => 'Se retiro el material acumulado y se limpio el area.', 'internal' => false],
                ],
            ],
            [
                'code' => 'DEMO-2026-0005',
                'title' => 'Cable caido retirado',
                'description' => 'Cableado caido sobre acera fue retirado y asegurado por el equipo tecnico.',
                'category' => 'Alumbrado Publico',
                'subcategory' => 'Cable caido',
                'priority_level' => 1,
                'state' => 'CERRADA',
                'territorial_unit' => 'Ambato',
                'address' => 'Av. Cevallos y Mera',
                'latitude' => -1.241667,
                'longitude' => -78.619720,
                'reporter' => 'ciudadano2@incidents.local',
                'assignee' => $operatorOne,
                'assigned_by' => $supervisor,
                'close_assignment' => true,
                'created_at' => Carbon::now()->subDays(6),
                'resolution_date' => Carbon::now()->subDays(4),
                'comments' => [
                    ['author' => 'supervisor@incidents.local', 'comment' => 'Cierre validado con evidencia del operador.', 'internal' => true],
                ],
            ],
            [
                'code' => 'DEMO-2026-0006',
                'title' => 'Reporte duplicado de senalizacion',
                'description' => 'Reporte marcado como duplicado de una incidencia registrada previamente.',
                'category' => 'Vialidad',
                'subcategory' => 'Senalizacion vial',
                'priority_level' => 4,
                'state' => 'RECHAZADA',
                'territorial_unit' => 'Machala',
                'address' => 'Av. 25 de Junio',
                'latitude' => -3.258111,
                'longitude' => -79.955392,
                'reporter' => 'ciudadano3@incidents.local',
                'created_at' => Carbon::now()->subDays(2),
                'comments' => [
                    ['author' => 'supervisor@incidents.local', 'comment' => 'Se rechaza por duplicidad con DEMO-2026-0001.', 'internal' => false],
                ],
            ],
            [
                'code' => 'DEMO-2026-0007',
                'title' => 'Alcantarilla vuelve a taponarse',
                'description' => 'La alcantarilla fue atendida, pero el problema reaparecio despues de una lluvia fuerte.',
                'category' => 'Servicios Publicos',
                'subcategory' => 'Alcantarilla tapada',
                'priority_level' => 2,
                'state' => 'REABIERTA',
                'territorial_unit' => 'Portoviejo',
                'address' => 'Av. Manabi y America',
                'latitude' => -1.054582,
                'longitude' => -80.454451,
                'reporter' => 'ciudadano1@incidents.local',
                'assignee' => $operatorOne,
                'assigned_by' => $supervisor,
                'created_at' => Carbon::now()->subDays(5),
                'comments' => [
                    ['author' => 'ciudadano1@incidents.local', 'comment' => 'El agua se volvio a acumular en la esquina.', 'internal' => false],
                ],
            ],
        ];

        DB::transaction(function () use ($incidents): void {
            foreach ($incidents as $data) {
                $this->seedIncident($data);
            }
        });
    }

    private function seedIncident(array $data): void
    {
        $category = $this->category($data['category']);
        $subcategory = $this->subcategory($category->id, $data['subcategory']);
        $state = $this->state($data['state']);
        $reporter = $this->user($data['reporter']);

        $incident = Incident::withTrashed()->updateOrCreate(
            ['code' => $data['code']],
            [
                'title' => $data['title'],
                'description' => $data['description'],
                'category_id' => $category->id,
                'subcategory_id' => $subcategory->id,
                'priority_id' => $this->priority($data['priority_level'])->id,
                'state_id' => $state->id,
                'territorial_unit_id' => $this->territorialUnit($data['territorial_unit'])->id,
                'address' => $data['address'],
                'address_reference' => $data['address'],
                'latitude' => $data['latitude'],
                'longitude' => $data['longitude'],
                'reported_by_id' => $reporter->id,
                'resolution_date' => $data['resolution_date'] ?? null,
            ]
        );

        if ($incident->trashed()) {
            $incident->restore();
        }

        $incident->forceFill([
            'created_at' => $data['created_at'],
            'updated_at' => Carbon::now(),
        ])->save();

        $this->resetDetails($incident->id);
        $this->seedStateHistory($incident, $state, $reporter, $data['created_at']);
        $this->seedAssignment($incident, $data);
        $this->seedComments($incident, $data['comments'] ?? []);
    }

    private function resetDetails(int $incidentId): void
    {
        IncidentComment::where('incident_id', $incidentId)->delete();
        IncidentState::where('incident_id', $incidentId)->delete();
        IncidentAssignment::where('incident_id', $incidentId)->delete();
    }

    private function seedStateHistory(Incident $incident, State $finalState, User $reporter, Carbon $createdAt): void
    {
        $flow = [
            'NUEVA' => ['NUEVA'],
            'EN_REVISION' => ['NUEVA', 'EN_REVISION'],
            'EN_PROGRESO' => ['NUEVA', 'EN_REVISION', 'EN_PROGRESO'],
            'RESUELTA' => ['NUEVA', 'EN_REVISION', 'EN_PROGRESO', 'RESUELTA'],
            'CERRADA' => ['NUEVA', 'EN_REVISION', 'EN_PROGRESO', 'RESUELTA', 'CERRADA'],
            'RECHAZADA' => ['NUEVA', 'EN_REVISION', 'RECHAZADA'],
            'REABIERTA' => ['NUEVA', 'EN_REVISION', 'EN_PROGRESO', 'RESUELTA', 'REABIERTA'],
        ][$finalState->name] ?? ['NUEVA'];

        $previousStateId = null;
        foreach ($flow as $index => $stateName) {
            $newState = $this->state($stateName);
            $actor = $index === 0
                ? $reporter
                : $this->user(in_array($stateName, ['EN_PROGRESO', 'RESUELTA'], true) ? 'operador1@incidents.local' : 'supervisor@incidents.local');

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

    private function seedAssignment(Incident $incident, array $data): void
    {
        if (!isset($data['assignee'], $data['assigned_by'])) {
            return;
        }

        $assignmentDate = $data['created_at']->copy()->addHours(12);

        IncidentAssignment::create([
            'incident_id' => $incident->id,
            'user_id' => $data['assignee']->id,
            'assigned_by_id' => $data['assigned_by']->id,
            'assignment_role' => IncidentAssignment::ROLE_PRIMARY,
            'active' => empty($data['close_assignment']),
            'assignment_date' => $assignmentDate,
            'unassignment_date' => !empty($data['close_assignment']) ? ($data['resolution_date'] ?? Carbon::now()) : null,
            'created_at' => $assignmentDate,
            'updated_at' => !empty($data['close_assignment']) ? Carbon::now() : $assignmentDate,
        ]);
    }

    private function seedComments(Incident $incident, array $comments): void
    {
        foreach ($comments as $index => $comment) {
            IncidentComment::create([
                'incident_id' => $incident->id,
                'user_id' => $this->user($comment['author'])->id,
                'comment' => $comment['comment'],
                'is_internal' => $comment['internal'],
                'created_at' => $incident->created_at->copy()->addHours(2 + $index),
                'updated_at' => $incident->created_at->copy()->addHours(2 + $index),
            ]);
        }
    }

    private function stateComment(string $stateName): ?string
    {
        return [
            'NUEVA' => 'Incidencia registrada por el ciudadano.',
            'EN_REVISION' => 'Incidencia enviada a revision operativa.',
            'EN_PROGRESO' => 'Incidencia asignada a operador.',
            'RESUELTA' => 'Trabajo reportado como resuelto.',
            'CERRADA' => 'Resolucion validada y cerrada.',
            'RECHAZADA' => 'Incidencia rechazada por no proceder o duplicidad.',
            'REABIERTA' => 'Ciudadano solicita nueva revision.',
        ][$stateName] ?? null;
    }

    private function user(string $email): User
    {
        return User::where('email', $email)->firstOrFail();
    }

    private function category(string $name): Category
    {
        return Category::get()->first(fn (Category $category) => $this->sameText($category->name, $name))
            ?? throw new RuntimeException("Missing category: {$name}");
    }

    private function subcategory(int $categoryId, string $name): Subcategory
    {
        return Subcategory::where('category_id', $categoryId)
            ->get()
            ->first(fn (Subcategory $subcategory) => $this->sameText($subcategory->name, $name))
            ?? throw new RuntimeException("Missing subcategory: {$name}");
    }

    private function priority(int $level): Priority
    {
        return Priority::where('level', $level)->firstOrFail();
    }

    private function state(string $name): State
    {
        return State::where('name', $name)->firstOrFail();
    }

    private function territorialUnit(string $name): TerritorialUnit
    {
        $units = TerritorialUnit::query()
            ->whereIn('type', [TerritorialUnit::TYPE_PARISH, TerritorialUnit::TYPE_CANTON])
            ->get();

        $unit = $units->first(fn (TerritorialUnit $territorialUnit) => $this->sameText($territorialUnit->name, $name));

        if ($unit && $unit->type === TerritorialUnit::TYPE_PARISH) {
            return $unit;
        }

        if ($unit && $unit->type === TerritorialUnit::TYPE_CANTON) {
            $parish = TerritorialUnit::query()
                ->where('parent_id', $unit->id)
                ->where('type', TerritorialUnit::TYPE_PARISH)
                ->orderByRaw('CASE WHEN name = ? THEN 0 ELSE 1 END', [$unit->name])
                ->orderBy('name')
                ->first();

            if ($parish) {
                return $parish;
            }
        }

        return TerritorialUnit::query()
            ->where('type', TerritorialUnit::TYPE_PARISH)
            ->firstOrFail();
    }

    private function sameText(string $left, string $right): bool
    {
        return Str::lower(Str::ascii($left)) === Str::lower(Str::ascii($right));
    }
}
