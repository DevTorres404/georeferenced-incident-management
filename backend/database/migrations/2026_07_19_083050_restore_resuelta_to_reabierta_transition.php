<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $resolvedId = DB::table('core.states')->where('name', 'RESUELTA')->value('id');
        $reopenedId = DB::table('core.states')->where('name', 'REABIERTA')->value('id');

        if ($resolvedId && $reopenedId) {
            DB::table('core.state_transitions')->updateOrInsert(
                [
                    'source_state_id' => $resolvedId,
                    'target_state_id' => $reopenedId,
                ],
                [
                    'requires_comment' => true,
                    'allowed_roles' => json_encode(['ADMIN', 'SUPERVISOR']),
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );
        }
    }

    public function down(): void
    {
        $resolvedId = DB::table('core.states')->where('name', 'RESUELTA')->value('id');
        $reopenedId = DB::table('core.states')->where('name', 'REABIERTA')->value('id');

        if ($resolvedId && $reopenedId) {
            DB::table('core.state_transitions')
                ->where('source_state_id', $resolvedId)
                ->where('target_state_id', $reopenedId)
                ->delete();
        }
    }
};
