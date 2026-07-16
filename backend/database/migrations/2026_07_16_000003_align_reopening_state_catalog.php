<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const COLORS = [
        'NUEVA' => '#90A4AE',
        'EN_REVISION' => '#2196F3',
        'EN_PROGRESO' => '#FFC107',
        'RESUELTA' => '#8BC34A',
        'CERRADA' => '#4CAF50',
        'RECHAZADA' => '#F44336',
        'REABIERTA' => '#FF9800',
    ];

    private const REOPENED_DESCRIPTION =
        'Reabierta por un supervisor o administrador debido a una resolución insatisfactoria.';

    public function up(): void
    {
        DB::transaction(function (): void {
            $states = DB::table('core.states')
                ->whereIn('name', array_keys(self::COLORS))
                ->pluck('id', 'name');

            if ($states->isEmpty()) {
                return;
            }

            $missingStates = array_diff(array_keys(self::COLORS), $states->keys()->all());

            if ($missingStates !== []) {
                throw new RuntimeException(
                    'Cannot align reopening state catalog; missing canonical states: '.implode(', ', $missingStates)
                );
            }

            foreach (self::COLORS as $name => $color) {
                DB::table('core.states')->where('name', $name)->update([
                    'color' => $color,
                    'updated_at' => now(),
                ]);
            }

            DB::table('core.states')->where('name', 'REABIERTA')->update([
                'description' => self::REOPENED_DESCRIPTION,
                'updated_at' => now(),
            ]);

            DB::table('core.state_transitions')
                ->where('source_state_id', $states['RESUELTA'])
                ->where('target_state_id', $states['REABIERTA'])
                ->delete();

            foreach (['CERRADA', 'RECHAZADA'] as $source) {
                $this->upsertReopeningTransition($states[$source], $states['REABIERTA']);
            }
        });
    }

    public function down(): void
    {
        DB::transaction(function (): void {
            $states = DB::table('core.states')
                ->whereIn('name', ['RECHAZADA', 'REABIERTA'])
                ->pluck('id', 'name');

            if (! isset($states['RECHAZADA'], $states['REABIERTA'])) {
                return;
            }

            // Display values are forward-only because their pre-migration values are not knowable.
            DB::table('core.state_transitions')
                ->where('source_state_id', $states['RECHAZADA'])
                ->where('target_state_id', $states['REABIERTA'])
                ->delete();
        });
    }

    private function upsertReopeningTransition(int $sourceStateId, int $targetStateId): void
    {
        $key = [
            'source_state_id' => $sourceStateId,
            'target_state_id' => $targetStateId,
        ];
        $values = [
            'requires_comment' => true,
            'allowed_roles' => json_encode(['ADMIN', 'SUPERVISOR'], JSON_THROW_ON_ERROR),
            'is_active' => true,
            'updated_at' => now(),
        ];

        $transition = DB::table('core.state_transitions')->where($key);

        if ($transition->exists()) {
            $transition->update($values);
        } else {
            DB::table('core.state_transitions')->insert($key + $values + ['created_at' => now()]);
        }
    }
};
