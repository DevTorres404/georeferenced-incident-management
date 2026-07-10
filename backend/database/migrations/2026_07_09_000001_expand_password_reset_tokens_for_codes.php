<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('auth.password_reset_tokens', function (Blueprint $table) {
            if (! Schema::hasColumn('auth.password_reset_tokens', 'expires_at')) {
                $table->timestamp('expires_at')->nullable()->after('created_at');
            }

            if (! Schema::hasColumn('auth.password_reset_tokens', 'attempts')) {
                $table->unsignedTinyInteger('attempts')->default(0)->after('expires_at');
            }

            if (! Schema::hasColumn('auth.password_reset_tokens', 'used_at')) {
                $table->timestamp('used_at')->nullable()->after('attempts');
            }
        });
    }

    public function down(): void
    {
        Schema::table('auth.password_reset_tokens', function (Blueprint $table) {
            if (Schema::hasColumn('auth.password_reset_tokens', 'used_at')) {
                $table->dropColumn('used_at');
            }

            if (Schema::hasColumn('auth.password_reset_tokens', 'attempts')) {
                $table->dropColumn('attempts');
            }

            if (Schema::hasColumn('auth.password_reset_tokens', 'expires_at')) {
                $table->dropColumn('expires_at');
            }
        });
    }
};
