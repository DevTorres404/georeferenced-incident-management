<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('state_change_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('incident_id')->constrained()->cascadeOnDelete();
            $table->foreignId('requested_by_user_id')->constrained('users');
            $table->foreignId('requested_state_id')->constrained('states');
            $table->string('reason', 2000);
            $table->string('status', 20)->default('pending'); // pending, approved, rejected
            $table->foreignId('reviewed_by_user_id')->nullable()->constrained('users');
            $table->string('reviewer_comment', 2000)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('reviewed_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('state_change_requests');
    }
};
