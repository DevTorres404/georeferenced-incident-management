<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('core.incidents', function (Blueprint $table) {
            $table->string('address_reference', 500)
                ->nullable()
                ->after('address');
        });

        DB::statement('UPDATE core.incidents SET address_reference = address WHERE address_reference IS NULL');
    }

    public function down(): void
    {
        Schema::table('core.incidents', function (Blueprint $table) {
            $table->dropColumn('address_reference');
        });
    }
};
