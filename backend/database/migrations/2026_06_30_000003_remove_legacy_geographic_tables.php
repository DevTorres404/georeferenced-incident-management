<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('core.incidents', 'city_id')) {
            Schema::table('core.incidents', function (Blueprint $table) {
                $table->dropForeign(['city_id']);
                $table->dropIndex('idx_incidents_city');
                $table->dropColumn('city_id');
            });
        }

        Schema::dropIfExists('core.cities');
        Schema::dropIfExists('core.provinces');
        Schema::dropIfExists('core.countries');
    }

    public function down(): void
    {
        Schema::create('core.countries', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->char('iso_code', 2)->unique();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('core.provinces', function (Blueprint $table) {
            $table->id();
            $table->foreignId('country_id')
                ->constrained('core.countries')
                ->cascadeOnDelete();
            $table->string('name', 100);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index('country_id', 'idx_provinces_country');
        });

        Schema::create('core.cities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('province_id')
                ->constrained('core.provinces')
                ->cascadeOnDelete();
            $table->string('name', 100);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index('province_id', 'idx_cities_province');
        });

        if (! Schema::hasColumn('core.incidents', 'city_id')) {
            Schema::table('core.incidents', function (Blueprint $table) {
                $table->foreignId('city_id')
                    ->nullable()
                    ->after('territorial_unit_id')
                    ->constrained('core.cities')
                    ->nullOnDelete();
                $table->index('city_id', 'idx_incidents_city');
            });
        }
    }
};
