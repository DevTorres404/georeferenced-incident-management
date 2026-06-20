<?php

namespace Database\Seeders;

use App\Auth\Infrastructure\Persistence\Models\Permission;
use App\Auth\Infrastructure\Persistence\Models\Role;
use Illuminate\Database\Seeder;

class PermissionSeeder extends Seeder
{
    public function run(): void
    {
        $permissions = [
            ['code' => 'incidents.view', 'name' => 'Ver incidencias', 'module' => 'incidents'],
            ['code' => 'incidents.create', 'name' => 'Crear incidencias', 'module' => 'incidents'],
            ['code' => 'incidents.edit', 'name' => 'Editar incidencias', 'module' => 'incidents'],
            ['code' => 'incidents.delete', 'name' => 'Eliminar incidencias', 'module' => 'incidents'],
            ['code' => 'incidents.assign', 'name' => 'Asignar incidencias', 'module' => 'incidents'],
            ['code' => 'incidents.close', 'name' => 'Cerrar incidencias', 'module' => 'incidents'],
            ['code' => 'incidents.reopen', 'name' => 'Reabrir incidencias', 'module' => 'incidents'],

            ['code' => 'comments.create', 'name' => 'Crear comentarios', 'module' => 'comments'],
            ['code' => 'comments.internal', 'name' => 'Crear comentarios internos', 'module' => 'comments'],

            ['code' => 'users.view', 'name' => 'Ver usuarios', 'module' => 'users'],
            ['code' => 'users.create', 'name' => 'Crear usuarios', 'module' => 'users'],
            ['code' => 'users.edit', 'name' => 'Editar usuarios', 'module' => 'users'],
            ['code' => 'users.delete', 'name' => 'Eliminar usuarios', 'module' => 'users'],
            ['code' => 'users.manage_roles', 'name' => 'Gestionar roles de usuario', 'module' => 'users'],

            ['code' => 'catalogs.manage', 'name' => 'Gestionar catálogos', 'module' => 'catalogs'],

            ['code' => 'reportes.ver', 'name' => 'Ver reportes', 'module' => 'reportes'],
            ['code' => 'reportes.exportar', 'name' => 'Exportar reportes', 'module' => 'reportes'],

            ['code' => 'configuracion.ver', 'name' => 'Ver configuración', 'module' => 'configuracion'],
            ['code' => 'configuracion.editar', 'name' => 'Editar configuración', 'module' => 'configuracion'],

            ['code' => 'audit.view', 'name' => 'Ver logs de auditoría', 'module' => 'audit'],
        ];

        foreach ($permissions as $permission) {
            Permission::updateOrCreate(
                ['code' => $permission['code']],
                $permission
            );
        }

        $assignments = [
            'ADMIN' => Permission::pluck('id')->toArray(),
            'SUPERVISOR' => Permission::whereIn('code', [
                'incidents.view', 'incidents.create', 'incidents.edit',
                'incidents.assign', 'incidents.close', 'incidents.reopen',
                'comments.create', 'comments.internal',
                'users.view',
                'reportes.ver', 'reportes.exportar',
                'catalogs.manage',
            ])->pluck('id')->toArray(),
            'OPERADOR' => Permission::whereIn('code', [
                'incidents.view', 'incidents.edit',
                'comments.create', 'comments.internal',
            ])->pluck('id')->toArray(),
            'CIUDADANO' => Permission::whereIn('code', [
                'incidents.view', 'incidents.create',
                'comments.create',
            ])->pluck('id')->toArray(),
        ];

        foreach ($assignments as $roleCode => $permissionIds) {
            $role = Role::where('code', $roleCode)->first();

            if ($role) {
                $role->permissions()->syncWithoutDetaching($permissionIds);
            }
        }
    }
}
