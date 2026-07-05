import { request } from '../../../core/api-client.js?v=14';

/**
 * Obtiene el listado de roles y la matriz de permisos
 */
async function getAccessControlOverview() {
  const response = await request('/admin/access-control');
  const data = response?.data || response || {};

  return {
    roles: (data.roles || []).map(normalizeRole),
    permissionsByModule: normalizePermissionsByModule(data.permissions_by_module || data.permissionsByModule || {}),
    navigationItems: normalizeNavigationItems(data.navigation_items || data.navigationItems || []),
    users: (data.users || []).map(normalizeUser),
  };
}

/**
 * Actualiza los permisos asociados a un rol
 */
async function updateRolePermissions(roleId, permissions) {
  const data = await request(`/admin/roles/${encodeURIComponent(roleId)}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permissions }),
  });
  if (data?.data) data.data = normalizeRole(data.data);
  return data;
}

/**
 * Obtiene todos los usuarios y los roles disponibles para asignación
 */
async function getUsersAndRoles() {
  const overview = await getAccessControlOverview();

  return {
    users: overview.users,
    roles: overview.roles,
  };
}

/**
 * Asigna o cambia el rol de un usuario
 */
async function assignUserRole(userId, roleCode) {
  const data = await request(`/users/${encodeURIComponent(userId)}/roles`, {
    method: 'PUT',
    body: JSON.stringify({ roles: [roleCode] }),
  });
  if (data?.data) data.data = normalizeUser(data.data);
  return data;
}

function normalizeRole(role = {}) {
  return {
    ...role,
    id: role.id ?? role.role_id ?? role.roleId,
    code: role.code || role.codigo || role.name || '',
    name: role.name || role.nombre || role.code || role.codigo || 'Rol',
    description: role.description || role.descripcion || '',
    permissions: (role.permissions || []).map(normalizePermission),
  };
}

function normalizePermission(permission = {}) {
  return {
    ...permission,
    id: permission.id ?? permission.permission_id ?? permission.permissionId,
    code: permission.code || permission.codigo || '',
    name: permission.name || permission.nombre || permission.code || permission.codigo || 'Permiso',
    description: permission.description || permission.descripcion || '',
    module: permission.module || permission.modulo || 'General',
  };
}

function normalizePermissionsByModule(groups = {}) {
  return Object.fromEntries(
    Object.entries(groups).map(([module, permissions]) => [
      module,
      (permissions || []).map(normalizePermission),
    ])
  );
}

function normalizeNavigationItems(items = []) {
  return (items || []).map((item = {}) => ({
    id: item.id ?? item.navigation_item_id ?? item.navigationItemId,
    code: item.code || item.codigo || '',
    label: item.label || item.nombre || item.name || item.code || 'Menu',
    icon: item.icon || '',
    route: item.route || item.href || '',
    permission: item.permission || item.permission_code || item.permissionCode || '',
    active: item.active ?? item.activo ?? true,
    children: normalizeNavigationItems(item.children || []),
  }));
}

function normalizeUser(user = {}) {
  const roles = Array.isArray(user.roles) ? user.roles.map(normalizeRole) : [];
  const primaryRole = roles[0] || null;
  const firstName = user.nombre || user.first_name || user.firstName || '';
  const lastName = user.apellido || user.last_name || user.lastName || '';
  const fullName = user.name || [firstName, lastName].filter(Boolean).join(' ').trim();

  return {
    ...user,
    name: fullName || user.username || user.email || 'Usuario',
    role: primaryRole?.code || user.role || user.role_code || user.roleCode || '',
    role_name: primaryRole?.name || user.role_name || user.roleName || user.role || 'Sin rol',
    roles,
  };
}

export {
  getAccessControlOverview,
  updateRolePermissions,
  getUsersAndRoles,
  assignUserRole
};
