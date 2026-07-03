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
            ['code' => 'about.view', 'name' => 'Ver informacion del sistema', 'description' => 'Permite acceder a la pantalla Acerca del sistema.', 'module' => 'about'],

            ['code' => 'dashboard.view', 'name' => 'Ver panel principal', 'description' => 'Permite acceder al panel principal del sistema.', 'module' => 'dashboard'],

            ['code' => 'incidents.view', 'name' => 'Ver incidencias', 'description' => 'Permite consultar el listado y detalle de incidencias segun el alcance del rol.', 'module' => 'incidents'],
            ['code' => 'incidents.detail', 'name' => 'Ver detalle de incidencias', 'description' => 'Permite acceder a la pantalla de detalle de una incidencia.', 'module' => 'incidents'],
            ['code' => 'incidents.create', 'name' => 'Crear incidencias', 'description' => 'Permite registrar nuevas incidencias en el sistema.', 'module' => 'incidents'],
            ['code' => 'incidents.edit', 'name' => 'Editar incidencias', 'description' => 'Permite actualizar datos operativos de una incidencia.', 'module' => 'incidents'],
            ['code' => 'incidents.delete', 'name' => 'Eliminar incidencias', 'description' => 'Permite eliminar incidencias cuando la politica lo autorice.', 'module' => 'incidents'],
            ['code' => 'incidents.assign', 'name' => 'Gestionar asignaciones', 'description' => 'Permite usar la pantalla de Gestion de Asignaciones y asignar incidencias a operadores.', 'module' => 'incidents'],
            ['code' => 'incidents.close', 'name' => 'Resolver incidencias', 'description' => 'Permite marcar incidencias como resueltas.', 'module' => 'incidents'],
            ['code' => 'incidents.reopen', 'name' => 'Reabrir incidencias', 'description' => 'Permite reabrir incidencias previamente resueltas.', 'module' => 'incidents'],

            ['code' => 'profile.view', 'name' => 'Ver perfil propio', 'description' => 'Permite acceder a la pantalla Mi perfil.', 'module' => 'profile'],

            ['code' => 'comments.create', 'name' => 'Crear comentarios', 'description' => 'Permite registrar comentarios visibles en el seguimiento de la incidencia.', 'module' => 'comments'],
            ['code' => 'comments.internal', 'name' => 'Crear comentarios internos', 'description' => 'Permite registrar comentarios internos para uso operativo.', 'module' => 'comments'],

            ['code' => 'users.view', 'name' => 'Ver usuarios', 'description' => 'Permite consultar usuarios del sistema.', 'module' => 'users'],
            ['code' => 'users.create', 'name' => 'Crear usuarios', 'description' => 'Permite registrar usuarios manualmente.', 'module' => 'users'],
            ['code' => 'users.edit', 'name' => 'Editar usuarios', 'description' => 'Permite actualizar informacion de usuarios.', 'module' => 'users'],
            ['code' => 'users.delete', 'name' => 'Eliminar usuarios', 'description' => 'Permite desactivar o eliminar usuarios segun la politica del sistema.', 'module' => 'users'],
            ['code' => 'users.manage_roles', 'name' => 'Gestionar roles y permisos', 'description' => 'Permite administrar las pantallas de Roles y permisos y Usuarios y roles.', 'module' => 'users'],

            ['code' => 'operations.view', 'name' => 'Ver cobertura operativa', 'description' => 'Permite acceder al mapa y ficha de Cobertura Operativa segun la zona autorizada.', 'module' => 'operations'],
            ['code' => 'operations.manage', 'name' => 'Gestionar cobertura operativa', 'description' => 'Permite cambiar supervisores, operadores, limites y encargados de zona.', 'module' => 'operations'],

            ['code' => 'catalogs.manage', 'name' => 'Gestionar catalogos', 'description' => 'Permite administrar catalogos maestros, incluidas prioridades y sus pesos.', 'module' => 'catalogs'],
            ['code' => 'territorial_units.view', 'name' => 'Ver unidades territoriales', 'description' => 'Permite consultar el arbol territorial.', 'module' => 'territorial_units'],
            ['code' => 'territorial_units.manage', 'name' => 'Gestionar unidades territoriales', 'description' => 'Permite crear o ajustar unidades territoriales.', 'module' => 'territorial_units'],

            ['code' => 'reportes.ver', 'name' => 'Ver reportes', 'description' => 'Permite consultar reportes operativos.', 'module' => 'reportes'],
            ['code' => 'reportes.exportar', 'name' => 'Exportar reportes', 'description' => 'Permite exportar reportes del sistema.', 'module' => 'reportes'],

            ['code' => 'configuracion.ver', 'name' => 'Ver configuracion', 'description' => 'Permite consultar opciones generales del sistema.', 'module' => 'configuracion'],
            ['code' => 'configuracion.editar', 'name' => 'Editar configuracion', 'description' => 'Permite ajustar opciones generales del sistema.', 'module' => 'configuracion'],

            ['code' => 'audit.view', 'name' => 'Ver logs de auditoria', 'description' => 'Permite consultar trazabilidad y auditoria del sistema.', 'module' => 'audit'],
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
                'about.view',
                'dashboard.view',
                'incidents.view',
                'incidents.detail',
                'incidents.create',
                'incidents.edit',
                'incidents.assign',
                'incidents.close',
                'incidents.reopen',
                'profile.view',
                'comments.create',
                'comments.internal',
                'users.view',
                'operations.view',
                'reportes.ver',
                'reportes.exportar',
                'catalogs.manage',
                'territorial_units.view',
            ])->pluck('id')->toArray(),
            'OPERADOR' => Permission::whereIn('code', [
                'about.view',
                'dashboard.view',
                'incidents.view',
                'incidents.detail',
                'incidents.edit',
                'profile.view',
                'comments.create',
                'comments.internal',
                'territorial_units.view',
            ])->pluck('id')->toArray(),
            'CIUDADANO' => Permission::whereIn('code', [
                'about.view',
                'incidents.view',
                'incidents.detail',
                'incidents.create',
                'profile.view',
                'comments.create',
                'territorial_units.view',
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
