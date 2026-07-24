<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Database\Seeders\EcuadorIncidentSeeder;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use Database\Seeders\RoleSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\StateSeeder;
use Database\Seeders\PrioritySeeder;
use Database\Seeders\CategorySeeder;
use Database\Seeders\TerritorialUnitSeeder;
use Database\Seeders\OperationalZoneGeometrySeeder;
use Database\Seeders\OperationalStructureSeeder;
use Database\Seeders\DemoUserSeeder;

class EcuadorIncidentSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_seeds_incidents_without_errors(): void
    {
        // Require prerequisites
        $this->seed(RoleSeeder::class);
        $this->seed(PermissionSeeder::class);
        $this->seed(StateSeeder::class);
        $this->seed(PrioritySeeder::class);
        $this->seed(CategorySeeder::class);
        $this->seed(TerritorialUnitSeeder::class);
        $this->seed(OperationalZoneGeometrySeeder::class);
        $this->seed(OperationalStructureSeeder::class);
        $this->seed(DemoUserSeeder::class);

        $this->seed(EcuadorIncidentSeeder::class);

        $this->assertTrue(Incident::count() > 0);
    }
}
