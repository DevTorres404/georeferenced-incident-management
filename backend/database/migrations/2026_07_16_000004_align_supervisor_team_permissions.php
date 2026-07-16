<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const PERMISSION_CODE = 'operations.view_team';

    private const SUPERVISOR_REVOKED_CODES = [
        'incidents.create',
        'operations.view',
    ];

    public function up(): void
    {
        DB::transaction(function (): void {
            $now = now();
            $permission = DB::table('auth.permissions')->where('code', self::PERMISSION_CODE);
            $values = [
                'name' => 'Ver equipo de trabajo',
                'description' => 'Permite consultar los operadores asignados directamente al supervisor autenticado.',
                'module' => 'operations',
                'updated_at' => $now,
            ];

            if ($permission->exists()) {
                $permission->update($values);
                $permissionId = $permission->value('id');
            } else {
                $permissionId = DB::table('auth.permissions')->insertGetId([
                    'code' => self::PERMISSION_CODE,
                    ...$values,
                    'created_at' => $now,
                ]);
            }

            $roleIds = DB::table('auth.roles')
                ->whereIn('code', ['ADMIN', 'SUPERVISOR'])
                ->pluck('id', 'code');

            foreach ($roleIds as $roleId) {
                DB::table('auth.permission_role')->updateOrInsert(
                    ['permission_id' => $permissionId, 'role_id' => $roleId],
                    ['created_at' => $now, 'updated_at' => $now]
                );
            }

            if (isset($roleIds['SUPERVISOR'])) {
                $revokedPermissionIds = DB::table('auth.permissions')
                    ->whereIn('code', self::SUPERVISOR_REVOKED_CODES)
                    ->pluck('id');

                DB::table('auth.permission_role')
                    ->where('role_id', $roleIds['SUPERVISOR'])
                    ->whereIn('permission_id', $revokedPermissionIds)
                    ->delete();
            }
        });
    }

    public function down(): void
    {
        DB::transaction(function (): void {
            $permissionId = DB::table('auth.permissions')
                ->where('code', self::PERMISSION_CODE)
                ->value('id');

            if ($permissionId) {
                DB::table('auth.permission_role')->where('permission_id', $permissionId)->delete();
                DB::table('auth.permissions')->where('id', $permissionId)->delete();
            }

            $supervisorId = DB::table('auth.roles')->where('code', 'SUPERVISOR')->value('id');

            if (! $supervisorId) {
                return;
            }

            // Restore the exact supervisor grants present in the pre-000004 code state.
            $now = now();
            $permissionIds = DB::table('auth.permissions')
                ->whereIn('code', self::SUPERVISOR_REVOKED_CODES)
                ->pluck('id');

            foreach ($permissionIds as $restoredPermissionId) {
                DB::table('auth.permission_role')->updateOrInsert(
                    ['permission_id' => $restoredPermissionId, 'role_id' => $supervisorId],
                    ['created_at' => $now, 'updated_at' => $now]
                );
            }
        });
    }
};
