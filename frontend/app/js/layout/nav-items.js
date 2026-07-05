const ROLES = {
  ADMIN: 'ADMIN',
};

const NAV_ITEMS = [
  {
    id: 'workspace',
    label: 'Centro operativo',
    icon: 'fa-th-large',
    permission: 'dashboard.view',
    children: [
      {
        id: 'dashboard',
        label: 'Panel principal',
        icon: 'fa-tachometer-alt',
        route: 'dashboard.html',
        permission: 'dashboard.view',
      },
      {
        id: 'reports',
        label: 'Reportes y estadisticas',
        icon: 'fa-chart-bar',
        route: 'reports.html',
        permission: 'reportes.ver',
      },
      {
        id: 'notifications',
        label: 'Notificaciones',
        icon: 'fa-bell',
        route: 'notifications.html',
        permission: 'notifications.view',
      },
    ],
  },
  {
    id: 'incident-hub',
    label: 'Gestion de incidencias',
    icon: 'fa-exclamation-circle',
    permission: 'incidents.view',
    children: [
      {
        id: 'incidents',
        label: 'Listado general',
        icon: 'fa-list-alt',
        route: 'incidents.html',
        permission: 'incidents.view',
      },
      {
        id: 'assignment-management',
        label: 'Gestion de asignaciones',
        icon: 'fa-tasks',
        route: 'assignment-management.html',
        permission: 'incidents.assign',
      },
      {
        id: 'incident-map',
        label: 'Mapa de incidencias',
        icon: 'fa-map-marked-alt',
        route: 'incident-map.html',
        permission: 'incidents.map',
      },
      {
        id: 'incident-create',
        label: 'Nueva incidencia',
        icon: 'fa-plus-circle',
        route: 'incident-create.html',
        permission: 'incidents.create',
      },
    ],
  },
  {
    id: 'territorial-ops',
    label: 'Cobertura nacional',
    icon: 'fa-network-wired',
    permission: 'operations.view',
    children: [
      {
        id: 'operational-structure',
        label: 'Operacion nacional',
        icon: 'fa-draw-polygon',
        route: 'operational-structure.html',
        permission: 'operations.view',
      },
    ],
  },
  {
    id: 'admin-tools',
    label: 'Administracion',
    icon: 'fa-shield-alt',
    permission: 'users.manage_roles',
    children: [
      {
        id: 'role-permissions',
        label: 'Roles y permisos',
        icon: 'fa-user-shield',
        route: 'role-permissions.html',
        permission: 'users.manage_roles',
      },
      {
        id: 'user-roles',
        label: 'Usuarios y roles',
        icon: 'fa-user-tag',
        route: 'user-roles.html',
        permission: 'users.manage_roles',
      },
      {
        id: 'audit-logs',
        label: 'Auditoria',
        icon: 'fa-clipboard-list',
        route: 'audit-logs.html',
        permission: 'audit.view',
      },
    ],
  },
];

const PAGE_ACCESS = {
  about: { permission: 'about.view' },
  profile: { permission: 'profile.view' },
  notifications: { permission: 'notifications.view' },
  'incident-detail': { permission: 'incidents.detail' },
  dashboard: { permission: 'dashboard.view' },
  incidents: { permission: 'incidents.view' },
  'incident-map': { permission: 'incidents.map' },
  'incident-create': { permission: 'incidents.create' },
  'assignment-management': { permission: 'incidents.assign' },
  'operational-structure': { permission: 'operations.view' },
  'role-permissions': { permission: 'users.manage_roles' },
  'user-roles': { permission: 'users.manage_roles' },
  reports: { permission: 'reportes.ver' },
  'audit-logs': { permission: 'audit.view' },
  'territorial-units': { permission: 'operations.view' },
};

export { NAV_ITEMS, PAGE_ACCESS, ROLES };
