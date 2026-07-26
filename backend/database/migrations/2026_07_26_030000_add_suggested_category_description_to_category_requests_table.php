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
            $table->string('suggested_category_description', 255)
                ->nullable()
                ->after('suggested_name');
        });
    }

    public function down(): void
    {
        Schema::table('core.category_requests', function (Blueprint $table) {
            $table->dropColumn('suggested_category_description');
        });
    }
};
