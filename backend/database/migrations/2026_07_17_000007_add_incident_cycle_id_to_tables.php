<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private array $tables = [
        'core.incident_states' => 'incident_cycle_id',
        'core.incident_comments' => 'incident_cycle_id',
        'core.incident_attachments' => 'incident_cycle_id',
        'core.incident_assignments' => 'incident_cycle_id',
    ];

    public function up(): void
    {
        foreach ($this->tables as $table => $column) {
            Schema::table($table, function (Blueprint $t) use ($column) {
                $t->unsignedBigInteger($column)->nullable()->after('incident_id');

                $t->foreign($column)
                    ->references('id')
                    ->on('core.incident_cycles')
                    ->onDelete('restrict');

                $t->index($column);
            });
        }
    }

    public function down(): void
    {
        foreach (array_reverse($this->tables) as $table => $column) {
            Schema::table($table, function (Blueprint $t) use ($column) {
                $t->dropIndex([$column]);
                $t->dropForeign([$column]);
                $t->dropColumn($column);
            });
        }
    }
};
