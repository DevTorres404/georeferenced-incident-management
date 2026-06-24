<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            DELETE FROM auth.role_user AS ru
            USING auth.role_user AS du
            WHERE ru.user_id = du.user_id
              AND ru.id > du.id
        ");

        DB::statement('ALTER TABLE auth.role_user DROP CONSTRAINT IF EXISTS uq_role_user');
        DB::statement('ALTER TABLE auth.role_user ADD CONSTRAINT uq_role_user_single_role UNIQUE (user_id)');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE auth.role_user DROP CONSTRAINT IF EXISTS uq_role_user_single_role');
        DB::statement('ALTER TABLE auth.role_user ADD CONSTRAINT uq_role_user UNIQUE (user_id, role_id)');
    }
};
