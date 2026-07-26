<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('core.category_requests', function (Blueprint $table) {
            $table->string('suggested_subcategory_name', 100)->nullable()->after('suggested_name');
            $table->foreignId('created_category_id')
                ->nullable()
                ->after('resolved_by')
                ->constrained('core.categories')
                ->nullOnDelete();
            $table->foreignId('created_subcategory_id')
                ->nullable()
                ->after('created_category_id')
                ->constrained('core.subcategories')
                ->nullOnDelete();
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::table('core.category_requests', function (Blueprint $table) {
            $table->dropIndex(['status', 'created_at']);
            $table->dropConstrainedForeignId('created_subcategory_id');
            $table->dropConstrainedForeignId('created_category_id');
            $table->dropColumn('suggested_subcategory_name');
        });
    }
};
