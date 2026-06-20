<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('auth.user_identities', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->string('provider', 50);
            $table->string('provider_uid', 191)->nullable();
            $table->string('provider_email', 255);
            $table->timestamp('verified_at')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->jsonb('provider_data')->nullable();
            $table->timestamps();

            $table->foreign('user_id')
                ->references('id')
                ->on('auth.users')
                ->cascadeOnDelete();

            $table->unique(['provider', 'provider_uid'], 'uniq_user_identities_provider_uid');
            $table->unique(['user_id', 'provider'], 'uniq_user_identities_user_provider');
            $table->index(['provider', 'provider_email'], 'idx_user_identities_provider_email');
        });

        $users = DB::table('auth.users')
            ->select('id', 'email', 'email_verified_at', 'created_at', 'updated_at')
            ->orderBy('id')
            ->get();

        foreach ($users as $user) {
            DB::table('auth.user_identities')->insert([
                'user_id' => $user->id,
                'provider' => 'local',
                'provider_uid' => strtolower((string) $user->email),
                'provider_email' => $user->email,
                'verified_at' => $user->email_verified_at,
                'last_used_at' => null,
                'provider_data' => json_encode([
                    'source' => 'backfill',
                ]),
                'created_at' => $user->created_at,
                'updated_at' => $user->updated_at,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('auth.user_identities');
    }
};
