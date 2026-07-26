<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('core.category_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('incident_id')->constrained('core.incidents')->cascadeOnDelete();
            $table->foreignId('requested_by')->constrained('auth.users')->cascadeOnDelete();
            $table->string('suggested_name', 100);
            $table->string('reason', 500);
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->foreignId('resolved_by')->nullable()->constrained('auth.users')->nullOnDelete();
            $table->string('admin_comment', 500)->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('core.category_requests');
    }
};
