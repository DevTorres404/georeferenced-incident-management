<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('auth.navigation_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('parent_id')
                ->nullable()
                ->constrained('auth.navigation_items')
                ->cascadeOnDelete();
            $table->string('code', 80)->unique();
            $table->string('label', 120);
            $table->string('icon', 80)->nullable();
            $table->string('route', 160)->nullable();
            $table->string('permission_code', 120)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->foreign('permission_code')
                ->references('code')
                ->on('auth.permissions')
                ->nullOnDelete();
            $table->index(['parent_id', 'sort_order'], 'idx_navigation_items_parent_sort');
            $table->index(['active', 'sort_order'], 'idx_navigation_items_active_sort');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('auth.navigation_items');
    }
};
