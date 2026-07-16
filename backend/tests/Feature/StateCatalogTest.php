<?php

namespace Tests\Feature;

use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Incidents\Infrastructure\Persistence\Models\StateTransition;
use Database\Seeders\StateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StateCatalogTest extends TestCase
{
    use RefreshDatabase;

    private const COLORS = [
        'NUEVA' => '#90A4AE',
        'EN_REVISION' => '#2196F3',
        'EN_PROGRESO' => '#FFC107',
        'RESUELTA' => '#8BC34A',
        'CERRADA' => '#4CAF50',
        'RECHAZADA' => '#F44336',
        'REABIERTA' => '#FF9800',
    ];

    public function test_state_seeder_restores_the_canonical_catalog_idempotently(): void
    {
        $this->seed(StateSeeder::class);

        State::query()->update(['color' => '#000000']);
        State::where('name', 'REABIERTA')->update(['description' => 'Outdated']);
        $this->corruptReopeningTransitions();

        $this->seed(StateSeeder::class);
        $this->seed(StateSeeder::class);

        $this->assertCanonicalCatalog();
    }

    public function test_catalog_migration_skips_an_empty_catalog_without_writes(): void
    {
        $migration = require database_path('migrations/2026_07_16_000003_align_reopening_state_catalog.php');

        $this->assertDatabaseCount('core.states', 0);
        $this->assertDatabaseCount('core.state_transitions', 0);

        $migration->up();

        $this->assertDatabaseCount('core.states', 0);
        $this->assertDatabaseCount('core.state_transitions', 0);
    }

    public function test_catalog_migration_fails_before_writes_when_a_canonical_state_is_missing(): void
    {
        $this->seed(StateSeeder::class);
        $migration = require database_path('migrations/2026_07_16_000003_align_reopening_state_catalog.php');

        State::where('name', 'RECHAZADA')->delete();
        State::where('name', 'NUEVA')->update(['color' => '#000000']);
        State::where('name', 'REABIERTA')->update(['description' => 'Outdated']);
        $closedTransition = StateTransition::where(
            'source_state_id',
            State::where('name', 'CERRADA')->value('id')
        )->where(
            'target_state_id',
            State::where('name', 'REABIERTA')->value('id')
        )->firstOrFail();
        $closedTransition->update(['requires_comment' => false, 'is_active' => false]);

        try {
            $migration->up();
            $this->fail('A missing canonical state must abort the migration.');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString('RECHAZADA', $exception->getMessage());
        }

        $this->assertSame('#000000', State::where('name', 'NUEVA')->value('color'));
        $this->assertSame('Outdated', State::where('name', 'REABIERTA')->value('description'));
        $this->assertFalse($closedTransition->fresh()->requires_comment);
        $this->assertFalse($closedTransition->fresh()->is_active);
    }

    public function test_catalog_migration_is_idempotent(): void
    {
        $this->seed(StateSeeder::class);
        $migration = require database_path('migrations/2026_07_16_000003_align_reopening_state_catalog.php');

        State::query()->update(['color' => '#000000']);
        State::where('name', 'REABIERTA')->update(['description' => 'Outdated']);
        $this->corruptReopeningTransitions();

        $migration->up();
        $migration->up();
        $this->assertCanonicalCatalog();
    }

    public function test_catalog_migration_down_removes_created_rejected_reopening_transition_only(): void
    {
        $this->seed(StateSeeder::class);
        $migration = require database_path('migrations/2026_07_16_000003_align_reopening_state_catalog.php');
        $rejectedId = State::where('name', 'RECHAZADA')->value('id');
        $reopenedId = State::where('name', 'REABIERTA')->value('id');
        StateTransition::where('source_state_id', $rejectedId)
            ->where('target_state_id', $reopenedId)
            ->delete();

        $migration->up();

        $transitionId = StateTransition::where('source_state_id', $rejectedId)
            ->where('target_state_id', $reopenedId)
            ->value('id');
        $this->assertNotNull($transitionId);

        State::where('name', 'NUEVA')->update(['color' => '#010203']);
        State::where('name', 'REABIERTA')->update(['description' => 'Customized after migration']);
        $migration->down();

        $this->assertSame('#010203', State::where('name', 'NUEVA')->value('color'));
        $this->assertSame('#4CAF50', State::where('name', 'CERRADA')->value('color'));
        $this->assertSame(
            'Customized after migration',
            State::where('name', 'REABIERTA')->value('description')
        );
        $this->assertReopeningTransition('CERRADA');
        $this->assertDatabaseMissing('core.state_transitions', ['id' => $transitionId]);
    }

    public function test_catalog_migration_down_also_removes_a_preexisting_rejected_reopening_transition(): void
    {
        $this->seed(StateSeeder::class);
        $migration = require database_path('migrations/2026_07_16_000003_align_reopening_state_catalog.php');
        $transition = StateTransition::where(
            'source_state_id',
            State::where('name', 'RECHAZADA')->value('id')
        )->where(
            'target_state_id',
            State::where('name', 'REABIERTA')->value('id')
        )->firstOrFail();

        $migration->up();
        $migration->down();

        $this->assertDatabaseMissing('core.state_transitions', ['id' => $transition->id]);
        $this->assertReopeningTransition('CERRADA');
    }

    private function corruptReopeningTransitions(): void
    {
        $states = State::whereIn('name', ['RESUELTA', 'CERRADA', 'RECHAZADA', 'REABIERTA'])
            ->pluck('id', 'name');

        StateTransition::where('target_state_id', $states['REABIERTA'])->delete();
        foreach (['RESUELTA', 'CERRADA'] as $source) {
            StateTransition::create([
                'source_state_id' => $states[$source],
                'target_state_id' => $states['REABIERTA'],
                'requires_comment' => false,
                'allowed_roles' => ['CIUDADANO'],
                'is_active' => false,
            ]);
        }
    }

    private function assertCanonicalCatalog(): void
    {
        foreach (self::COLORS as $name => $color) {
            $this->assertSame($color, State::where('name', $name)->value('color'));
        }

        $this->assertSame(
            'Reabierta por un supervisor o administrador debido a una resolución insatisfactoria.',
            State::where('name', 'REABIERTA')->value('description')
        );

        $this->assertReopeningTransition('CERRADA');
        $this->assertReopeningTransition('RECHAZADA');
        $this->assertDatabaseMissing('core.state_transitions', [
            'source_state_id' => State::where('name', 'RESUELTA')->value('id'),
            'target_state_id' => State::where('name', 'REABIERTA')->value('id'),
        ]);
    }

    private function assertReopeningTransition(string $source): void
    {
        $transition = StateTransition::where(
            'source_state_id',
            State::where('name', $source)->value('id')
        )->where(
            'target_state_id',
            State::where('name', 'REABIERTA')->value('id')
        )->firstOrFail();

        $this->assertTrue($transition->requires_comment);
        $this->assertSame(['ADMIN', 'SUPERVISOR'], $transition->allowed_roles);
        $this->assertTrue($transition->is_active);
    }
}
