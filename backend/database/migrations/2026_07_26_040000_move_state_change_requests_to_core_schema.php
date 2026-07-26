<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $publicTableExists = $this->relationExists('public.state_change_requests');
        $coreTableExists = $this->relationExists('core.state_change_requests');

        if ($publicTableExists && $coreTableExists) {
            throw new RuntimeException('Both public.state_change_requests and core.state_change_requests exist.');
        }

        if ($coreTableExists) {
            return;
        }

        if (! $publicTableExists) {
            throw new RuntimeException('public.state_change_requests does not exist.');
        }

        DB::statement('ALTER TABLE "public"."state_change_requests" SET SCHEMA "core"');
    }

    public function down(): void
    {
        $publicTableExists = $this->relationExists('public.state_change_requests');
        $coreTableExists = $this->relationExists('core.state_change_requests');

        if ($publicTableExists && $coreTableExists) {
            throw new RuntimeException('Both public.state_change_requests and core.state_change_requests exist.');
        }

        if ($publicTableExists) {
            return;
        }

        if (! $coreTableExists) {
            throw new RuntimeException('core.state_change_requests does not exist.');
        }

        DB::statement('ALTER TABLE "core"."state_change_requests" SET SCHEMA "public"');
    }

    private function relationExists(string $qualifiedTable): bool
    {
        $result = DB::selectOne(
            'SELECT to_regclass(?) AS relation_name',
            [$qualifiedTable],
        );

        return $result?->relation_name !== null;
    }
};
