<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        $permissions = [
            [
                'code' => 'incidents.map',
                'name' => 'Ver mapa de incidencias',
                'description' => 'Permite acceder al mapa georreferenciado de incidencias.',
                'module' => 'incidents',
            ],
            [
                'code' => 'notifications.view',
                'name' => 'Ver notificaciones',
                'description' => 'Permite consultar notificaciones propias del usuario.',
                'module' => 'notifications',
            ],
        ];

        foreach ($permissions as $permission) {
            DB::table('auth.permissions')->updateOrInsert(
                ['code' => $permission['code']],
                array_merge($permission, ['updated_at' => $now, 'created_at' => $now])
            );
        }

        $this->grant('incidents.map', ['ADMIN', 'SUPERVISOR', 'OPERADOR']);
        $this->grant('notifications.view', ['ADMIN', 'SUPERVISOR', 'OPERADOR', 'CIUDADANO']);
        $this->revoke('dashboard.view', ['CIUDADANO']);
    }

    public function down(): void
    {
        $this->revoke('incidents.map', ['ADMIN', 'SUPERVISOR', 'OPERADOR']);
        $this->revoke('notifications.view', ['ADMIN', 'SUPERVISOR', 'OPERADOR', 'CIUDADANO']);
    }

    /**
     * @param  array<int, string>  $roleCodes
     */
    private function grant(string $permissionCode, array $roleCodes): void
    {
        $permissionId = DB::table('auth.permissions')->where('code', $permissionCode)->value('id');

        if (! $permissionId) {
            return;
        }

        $roleIds = DB::table('auth.roles')->whereIn('code', $roleCodes)->pluck('id');

        foreach ($roleIds as $roleId) {
            DB::table('auth.permission_role')->updateOrInsert(
                ['role_id' => $roleId, 'permission_id' => $permissionId],
                ['updated_at' => now(), 'created_at' => now()]
            );
        }
    }

    /**
     * @param  array<int, string>  $roleCodes
     */
    private function revoke(string $permissionCode, array $roleCodes): void
    {
        $permissionId = DB::table('auth.permissions')->where('code', $permissionCode)->value('id');

        if (! $permissionId) {
            return;
        }

        $roleIds = DB::table('auth.roles')->whereIn('code', $roleCodes)->pluck('id');

        DB::table('auth.permission_role')
            ->where('permission_id', $permissionId)
            ->whereIn('role_id', $roleIds)
            ->delete();
    }
};
