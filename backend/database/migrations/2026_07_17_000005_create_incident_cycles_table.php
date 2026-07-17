<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('core.incident_cycles', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('incident_id');
            $table->integer('cycle_number');
            $table->timestamp('opened_at');
            $table->unsignedBigInteger('opened_by');
            $table->text('reopening_reason')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->unsignedBigInteger('resolved_by')->nullable();
            $table->text('resolution_description')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->unsignedBigInteger('closed_by')->nullable();
            $table->text('closure_reason')->nullable();
            $table->jsonb('snapshot')->nullable();
            $table->timestamp('snapshot_generated_at')->nullable();
            $table->timestamps();

            $table->unique(['incident_id', 'cycle_number'], 'uq_incident_cycles_number');

            $table->index('incident_id');
            $table->index('cycle_number');
            $table->index('opened_at');
            $table->index('resolved_at');
            $table->index('closed_at');

            $table->foreign('incident_id')
                ->references('id')
                ->on('core.incidents')
                ->onDelete('cascade');

            $table->foreign('opened_by')
                ->references('id')
                ->on('auth.users')
                ->onDelete('restrict');

            $table->foreign('resolved_by')
                ->references('id')
                ->on('auth.users')
                ->onDelete('set null');

            $table->foreign('closed_by')
                ->references('id')
                ->on('auth.users')
                ->onDelete('set null');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('core.incident_cycles');
    }
};
