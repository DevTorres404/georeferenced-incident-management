<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Laravel Sanctum — Tokens de acceso personal para autenticación API.
 * Ubicada en el esquema 'auth' para mantener la coherencia.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('auth.personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->morphs('tokenable'); // tokenable_type + tokenable_id
            $table->string('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('auth.personal_access_tokens');
    }
};
