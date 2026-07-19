<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $cerradaId = DB::table('core.states')->where('name', 'CERRADA')->value('id');
        $reabiertaId = DB::table('core.states')->where('name', 'REABIERTA')->value('id');

        if ($cerradaId && $reabiertaId) {
            DB::table('core.state_transitions')
                ->where('source_state_id', $cerradaId)
                ->where('target_state_id', $reabiertaId)
                ->update(['allowed_roles' => json_encode(['ADMIN'])]);
        }
    }

    public function down(): void
    {
        $cerradaId = DB::table('core.states')->where('name', 'CERRADA')->value('id');
        $reabiertaId = DB::table('core.states')->where('name', 'REABIERTA')->value('id');

        if ($cerradaId && $reabiertaId) {
            DB::table('core.state_transitions')
                ->where('source_state_id', $cerradaId)
                ->where('target_state_id', $reabiertaId)
                ->update(['allowed_roles' => json_encode(['ADMIN', 'SUPERVISOR'])]);
        }
    }
};
