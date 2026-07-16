<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $states = DB::table('core.states')
            ->whereIn('name', ['RESUELTA', 'CERRADA', 'REABIERTA'])
            ->pluck('id', 'name');

        if (! $states->has(['RESUELTA', 'CERRADA', 'REABIERTA'])) {
            return;
        }

        DB::transaction(function () use ($states): void {
            DB::table('core.state_transitions')
                ->where('source_state_id', $states['RESUELTA'])
                ->where('target_state_id', $states['REABIERTA'])
                ->delete();

            DB::table('core.state_transitions')->updateOrInsert(
                [
                    'source_state_id' => $states['CERRADA'],
                    'target_state_id' => $states['REABIERTA'],
                ],
                [
                    'requires_comment' => true,
                    'allowed_roles' => json_encode(['ADMIN', 'SUPERVISOR'], JSON_THROW_ON_ERROR),
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );
        });
    }

    public function down(): void
    {
        $states = DB::table('core.states')
            ->whereIn('name', ['RESUELTA', 'CERRADA', 'REABIERTA'])
            ->pluck('id', 'name');

        if (! $states->has(['RESUELTA', 'CERRADA', 'REABIERTA'])) {
            return;
        }

        DB::transaction(function () use ($states): void {
            DB::table('core.state_transitions')
                ->where('source_state_id', $states['CERRADA'])
                ->where('target_state_id', $states['REABIERTA'])
                ->delete();

            DB::table('core.state_transitions')->updateOrInsert(
                [
                    'source_state_id' => $states['RESUELTA'],
                    'target_state_id' => $states['REABIERTA'],
                ],
                [
                    'requires_comment' => true,
                    'allowed_roles' => json_encode(['ADMIN', 'SUPERVISOR', 'CIUDADANO'], JSON_THROW_ON_ERROR),
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );
        });
    }
};
