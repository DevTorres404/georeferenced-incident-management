<?php

namespace Database\Seeders;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAssignment;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Incidents\Infrastructure\Persistence\Models\Subcategory;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Faker\Factory as Faker;

class EcuadorIncidentSeeder extends Seeder
{
    public function run(): void
    {
        $faker = Faker::create('es_ES');
        
        $categories = Category::where('is_active', true)->get();
        $subcategories = Subcategory::where('is_active', true)->get();
        $priorities = Priority::where('is_active', true)->get();
        $states = State::all();
        
        $citizens = User::whereHas('roles', function ($q) {
            $q->where('code', 'CIUDADANO');
        })->get();
        
        if ($citizens->isEmpty()) {
            $citizens = User::take(10)->get();
        }

        $supervisors = User::whereHas('roles', function ($q) {
            $q->where('code', 'SUPERVISOR');
        })->with('territoryAssignments')->get();
        $fallbackSupervisor = $supervisors->first() ?? User::first();

        $operators = User::whereHas('roles', function ($q) {
            $q->where('code', 'OPERADOR');
        })->with(['territoryAssignments', 'operatorProfile'])->get();

        $operatorActiveCounts = [];
        $operatorWorkloadPoints = [];
        foreach ($operators as $op) {
            $operatorActiveCounts[$op->id] = 0;
            $operatorWorkloadPoints[$op->id] = 0;
        }
        
        $year = now()->format('Y');
        $prefix = "INC-{$year}-";
        $latestIncident = Incident::where('code', 'like', "{$prefix}%")
            ->orderByRaw('LENGTH(code) DESC')
            ->orderBy('code', 'desc')
            ->first();

        $sequence = 0;
        if ($latestIncident) {
            $sequence = (int) str_replace($prefix, '', $latestIncident->code);
        }

        $this->command->info("Creando 1000 incidencias en Ecuador...");
        
        // Cities to distribute the incidents
        $cities = [
            // Guayaquil (Guayas)
            ['id' => 482, 'base_lat' => -2.1962, 'base_lng' => -79.8862, 'weight' => 50],
            // Cuenca (Sierra Sur)
            ['id' => 11, 'base_lat' => -2.9001, 'base_lng' => -79.0059, 'weight' => 25],
            // Machala (Costa Sur)
            ['id' => 331, 'base_lat' => -3.2581, 'base_lng' => -79.9554, 'weight' => 25],
        ];

        // Cache for operational zones
        $zoneCache = [];

        // Real Spanish incident titles and descriptions
        $spanishIncidents = [
            ['title' => 'Bache profundo en la vía', 'desc' => 'Hay un bache gigante que daña los vehículos al pasar.'],
            ['title' => 'Luminaria apagada en el parque', 'desc' => 'El parque está completamente a oscuras desde hace 3 días.'],
            ['title' => 'Fuga de agua potable', 'desc' => 'Hay una tubería rota botando agua limpia a la calle constantemente.'],
            ['title' => 'Semáforo dañado', 'desc' => 'El semáforo de la intersección no cambia a verde, generando mucho tráfico.'],
            ['title' => 'Acumulación de basura', 'desc' => 'El contenedor está desbordado y hay mal olor en la zona residencial.'],
            ['title' => 'Caída de árbol', 'desc' => 'Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.'],
            ['title' => 'Alcantarilla sin tapa', 'desc' => 'Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.'],
            ['title' => 'Corte de energía', 'desc' => 'Todo el sector está sin luz desde la madrugada, afectando negocios.'],
            ['title' => 'Vehículo abandonado', 'desc' => 'Hay un carro sospechoso abandonado hace semanas en la calle principal.'],
            ['title' => 'Ruido excesivo en local', 'desc' => 'El bar de la esquina tiene la música muy alta fuera de horario permitido.']
        ];

        for ($i = 0; $i < 1000; $i++) {
            $sequence++;
            $code = $prefix . str_pad((string)$sequence, 5, '0', STR_PAD_LEFT);
            
            $category = $categories->random();
            $categorySubcategories = $subcategories->where('category_id', $category->id);
            $subcategory = $categorySubcategories->isNotEmpty() ? $categorySubcategories->random() : null;
            $priority = $priorities->random();
            $state = $states->random();
            
            // Pick city based on weight
            $rand = random_int(1, 100);
            if ($rand <= 50) {
                $city = $cities[0]; // Guayaquil
            } elseif ($rand <= 75) {
                $city = $cities[1]; // Cuenca
            } else {
                $city = $cities[2]; // Machala
            }
            
            $unitId = $city['id'];
            
            // Generate coordinates near the city
            $lat = $city['base_lat'] + (random_int(-50, 50) / 1000);
            $lng = $city['base_lng'] + (random_int(-50, 50) / 1000);
            
            $createdAt = Carbon::now()->subDays(random_int(0, 30))->subHours(random_int(0, 24));
            $resolvedAt = in_array($state->name, ['RESUELTA', 'CERRADA']) 
                ? (clone $createdAt)->addHours(random_int(2, 72)) 
                : null;
            $rejectedAt = $state->name === 'RECHAZADA'
                ? (clone $createdAt)->addHours(random_int(1, 24))
                : null;
            
            // Find operational zone for this city
            if (!array_key_exists($unitId, $zoneCache)) {
                $unit = TerritorialUnit::find($unitId);
                while ($unit && $unit->type !== 'operational_zone') {
                    $unit = TerritorialUnit::find($unit->parent_id);
                }
                $zoneCache[$unitId] = $unit ? $unit->id : null;
            }
            
            $assignedZoneId = $zoneCache[$unitId];
            
            $zoneSupervisor = $fallbackSupervisor;
            if ($assignedZoneId) {
                $supervisor = $supervisors->first(function ($sup) use ($assignedZoneId) {
                    return $sup->territoryAssignments->contains('territorial_unit_id', $assignedZoneId);
                });
                if ($supervisor) {
                    $zoneSupervisor = $supervisor;
                }
            }

            $incidentText = $spanishIncidents[array_rand($spanishIncidents)];

            $incidentId = DB::table('core.incidents')->insertGetId([
                'code' => $code,
                'title' => $incidentText['title'],
                'description' => $incidentText['desc'],
                'category_id' => $category->id,
                'subcategory_id' => $subcategory ? $subcategory->id : null,
                'priority_id' => $priority->id,
                'state_id' => $state->id,
                'territorial_unit_id' => $unitId,
                'address' => rtrim($faker->address(), '.'),
                'latitude' => $lat,
                'longitude' => $lng,
                'reported_by_id' => $citizens->random()->id,
                'created_at' => $createdAt,
                'updated_at' => $resolvedAt ?? ($rejectedAt ?? $createdAt),
                'resolution_date' => $resolvedAt,
                'rejected_at' => $rejectedAt,
                'resolved_by_supervisor_id' => $resolvedAt ? $zoneSupervisor->id : null,
            ]);

            if ($state->name !== 'NUEVA' && $operators->isNotEmpty()) {
                // States that are NOT final consume operator capacity.
                // Final states in StateSeeder are CERRADA and RECHAZADA.
                $isActiveState = !in_array($state->name, ['CERRADA', 'RECHAZADA']);
                $points = $priority->weight ?? 2; // Use priority weight

                $candidateOperators = $operators;
                if ($assignedZoneId) {
                    $zoneOperators = $operators->filter(function ($op) use ($assignedZoneId) {
                        return $op->territoryAssignments->contains('territorial_unit_id', $assignedZoneId);
                    });
                    if ($zoneOperators->isNotEmpty()) {
                        $candidateOperators = $zoneOperators;
                    }
                }

                if ($isActiveState) {
                    $candidateOperators = $candidateOperators->filter(function ($op) use ($operatorActiveCounts, $operatorWorkloadPoints, $points) {
                        $maxActive = $op->operatorProfile->max_active_incidents ?? 10;
                        $maxPoints = $op->operatorProfile->max_workload_points ?? 20;
                        return $operatorActiveCounts[$op->id] < $maxActive && ($operatorWorkloadPoints[$op->id] + $points) <= $maxPoints;
                    });
                }

                if ($candidateOperators->isEmpty() && $isActiveState) {
                    // No available capacity, fall back to NUEVA
                    $newState = $states->where('name', 'NUEVA')->first();
                    DB::table('core.incidents')->where('id', $incidentId)->update(['state_id' => $newState->id]);
                } else {
                    $operator = $candidateOperators->random();

                    if ($isActiveState) {
                        $operatorActiveCounts[$operator->id]++;
                        $operatorWorkloadPoints[$operator->id] += $points;
                    }
                    
                    $assignedAt = (clone $createdAt)->addMinutes(random_int(10, 60));
                    
                    DB::table('core.incident_assignments')->insert([
                        'incident_id' => $incidentId,
                        'user_id' => $operator->id,
                        'assigned_by_id' => $zoneSupervisor->id,
                        'assignment_date' => $assignedAt,
                        'created_at' => $assignedAt,
                        'updated_at' => $assignedAt,
                    ]);
                }
            }
        }
        
        $this->command->info("Se crearon 1000 incidencias en Ecuador exitosamente.");
    }
}
