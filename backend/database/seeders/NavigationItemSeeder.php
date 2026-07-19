<?php

namespace Database\Seeders;

use App\Auth\Infrastructure\Persistence\Models\NavigationItem;
use Illuminate\Database\Seeder;

class NavigationItemSeeder extends Seeder
{
    public function run(): void
    {
        $groups = [
            [
                'code' => 'workspace',
                'label' => 'Centro operativo',
                'icon' => 'fa-th-large',
                'permission_code' => 'dashboard.view',
                'sort_order' => 10,
                'children' => [
                    ['code' => 'dashboard', 'label' => 'Panel principal', 'icon' => 'fa-tachometer-alt', 'route' => 'dashboard.html', 'permission_code' => 'dashboard.view', 'sort_order' => 10],
                    ['code' => 'reports', 'label' => 'Reportes y estadisticas', 'icon' => 'fa-chart-bar', 'route' => 'reports.html', 'permission_code' => 'reportes.ver', 'sort_order' => 20],
                ],
            ],
            [
                'code' => 'incident-hub',
                'label' => 'Gestion de incidencias',
                'icon' => 'fa-exclamation-circle',
                'permission_code' => 'incidents.view',
                'sort_order' => 20,
                'children' => [
                    ['code' => 'incidents', 'label' => 'Listado general', 'icon' => 'fa-list-alt', 'route' => 'incidents.html', 'permission_code' => 'incidents.list', 'sort_order' => 10],
                    ['code' => 'assignment-management', 'label' => 'Gestion de asignaciones', 'icon' => 'fa-tasks', 'route' => 'assignment-management.html', 'permission_code' => 'incidents.assign', 'sort_order' => 20],
                    ['code' => 'incident-map', 'label' => 'Mapa de incidencias', 'icon' => 'fa-map-marked-alt', 'route' => 'incident-map.html', 'permission_code' => 'incidents.map', 'sort_order' => 30],
                    ['code' => 'incident-create', 'label' => 'Nueva incidencia', 'icon' => 'fa-plus-circle', 'route' => 'incident-create.html', 'permission_code' => 'incidents.create', 'sort_order' => 40],
                ],
            ],
            [
                'code' => 'territorial-ops',
                'label' => 'Cobertura nacional',
                'icon' => 'fa-network-wired',
                'permission_code' => 'operations.view',
                'sort_order' => 30,
                'children' => [
                    ['code' => 'operational-structure', 'label' => 'Operacion nacional', 'icon' => 'fa-draw-polygon', 'route' => 'operational-structure.html', 'permission_code' => 'operations.view', 'sort_order' => 10],
                ],
            ],
            [
                'code' => 'territorial-zonal',
                'label' => 'Cobertura zonal',
                'icon' => 'fa-map-pin',
                'permission_code' => 'operations.view_team',
                'sort_order' => 35,
                'children' => [
                    ['code' => 'my-team', 'label' => 'Mi equipo', 'icon' => 'fa-users', 'route' => 'my-team.html', 'permission_code' => 'operations.view_team', 'sort_order' => 10],
                ],
            ],
            [
                'code' => 'admin-tools',
                'label' => 'Administracion',
                'icon' => 'fa-shield-alt',
                'permission_code' => 'users.manage_roles',
                'sort_order' => 40,
                'children' => [
                    ['code' => 'role-permissions', 'label' => 'Roles y permisos', 'icon' => 'fa-user-shield', 'route' => 'role-permissions.html', 'permission_code' => 'users.manage_roles', 'sort_order' => 10],
                    ['code' => 'user-roles', 'label' => 'Usuarios y roles', 'icon' => 'fa-user-tag', 'route' => 'user-roles.html', 'permission_code' => 'users.manage_roles', 'sort_order' => 20],
                    ['code' => 'audit-logs', 'label' => 'Auditoria', 'icon' => 'fa-clipboard-list', 'route' => 'audit-logs.html', 'permission_code' => 'audit.view', 'sort_order' => 30],
                ],
            ],
        ];

        $activeCodes = [];
        foreach ($groups as $group) {
            $children = $group['children'];
            unset($group['children']);

            $parent = NavigationItem::updateOrCreate(
                ['code' => $group['code']],
                [...$group, 'parent_id' => null, 'route' => null, 'active' => true]
            );
            $activeCodes[] = $group['code'];

            foreach ($children as $child) {
                NavigationItem::updateOrCreate(
                    ['code' => $child['code']],
                    [...$child, 'parent_id' => $parent->id, 'active' => true]
                );
                $activeCodes[] = $child['code'];
            }
        }

        NavigationItem::whereNotIn('code', $activeCodes)->delete();
    }
}
