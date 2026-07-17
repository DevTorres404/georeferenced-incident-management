<?php

namespace Tests\Unit\Migrations;

use Closure;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Mockery;
use Tests\TestCase;

final class AddIncidentCycleIdToTablesMigrationTest extends TestCase
{
    public function test_down_removes_each_cycle_foreign_key_index_and_column(): void
    {
        $tables = [
            'core.incident_assignments',
            'core.incident_attachments',
            'core.incident_comments',
            'core.incident_states',
        ];
        $originalSchema = Schema::getFacadeRoot();
        $schema = Mockery::mock();

        foreach ($tables as $table) {
            $blueprint = Mockery::mock(Blueprint::class);
            $blueprint->shouldReceive('dropIndex')->once()->with(['incident_cycle_id']);
            $blueprint->shouldReceive('dropForeign')->once()->with(['incident_cycle_id']);
            $blueprint->shouldReceive('dropColumn')->once()->with('incident_cycle_id');
            $schema->shouldReceive('table')->once()->with($table, Mockery::type(Closure::class))
                ->andReturnUsing(static function (string $_table, Closure $callback) use ($blueprint): void {
                    $callback($blueprint);
                });
        }

        Schema::swap($schema);

        try {
            $migration = require base_path('database/migrations/2026_07_17_000007_add_incident_cycle_id_to_tables.php');
            $migration->down();
        } finally {
            Schema::swap($originalSchema);
        }

        $this->assertTrue(true);
    }
}
