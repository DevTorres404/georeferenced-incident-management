import { getAccessControlOverview, updateRoleAccess } from '../application/access-control-service.js?v=17'
import { hidePageLoading, showPageLoading } from '../../incidents/presentation/incidents-ui.js?v=16'
import { handleBackendErrors, setFormAlert } from '../../../shared/validators/validation-utils.js?v=1'

document.addEventListener('DOMContentLoaded', initRolePermissionsPage)

const ADMIN_CONTROL_PERMISSION = 'users.manage_roles'
const ADMIN_CONTROL_SCREEN = 'role-permissions'

export async function initRolePermissionsPage() {
  if (typeof globalThis.renderLayout === 'function') {
    globalThis.renderLayout('role-permissions')
  }

  const state = {
    roles: [],
    permissionsByModule: {},
    navigationItems: [],
    selectedRoleCode: null,
    permissionSearchTerm: '',
    showNavigationOnly: false,
    searchRenderTimer: null,
    keepSearchFocus: false
  }

  bindActions(state)
  showPageLoading('Cargando accesos', 'Consultando roles y permisos...')
  const loadingFallback = globalThis.setTimeout(hidePageLoading, 3500)

  try {
    const overview = await getAccessControlOverview()
    state.roles = overview.roles
    state.permissionsByModule = overview.permissionsByModule
    state.navigationItems = overview.navigationItems || []
    state.selectedRoleCode = state.roles[0]?.code || null

    renderRoles(state)
    renderPermissions(state)
  } catch (error) {
    handleBackendErrors(error, null, document.getElementById('access-alert'))
  } finally {
    globalThis.clearTimeout(loadingFallback)
    hidePageLoading()
  }
}

function bindActions(state) {
  document.getElementById('save-role-permissions-btn')?.addEventListener('click', () => saveRolePermissions(state))
}

export function renderRoles(state) {
  const container = document.getElementById('role-list')
  if (!container) {
    return
  }

  container.innerHTML = state.roles.map(role => {
    const activeClass = role.code === state.selectedRoleCode ? 'active' : ''
    const permissionCount = role.permissions?.length || 0

    return `
      <button type="button" class="list-group-item list-group-item-action role-permission-item ${activeClass}" data-role-code="${escapeHtml(role.code)}">
        <div class="d-flex align-items-start justify-content-between">
          <div>
            <strong>${escapeHtml(role.name)}</strong>
            <small class="d-block">${escapeHtml(getRoleDescription(role.code))}</small>
          </div>
          <span class="badge badge-light">${permissionCount}</span>
        </div>
      </button>`
  }).join('')

  container.querySelectorAll('[data-role-code]').forEach(button => {
    button.addEventListener('click', () => {
      state.selectedRoleCode = button.dataset.roleCode
      renderRoles(state)
      renderPermissions(state)
    })
  })
}

export function renderPermissions(state) {
  const container = document.getElementById('permission-matrix')
  if (!container) {
    return
  }

  const role = selectedRole(state)
  if (!role) {
    container.innerHTML = emptyState('No hay roles disponibles.')
    return
  }

  const selectedPermissions = new Set((role.permissions || []).map(permission => permission.code))
  const selectedNavigationCodes = new Set(getNavigationCodesForRole(state.navigationItems, role.code))
  const navigationByPermission = buildNavigationPermissionIndex(state.navigationItems)
  const modules = filterPermissionModules(state.permissionsByModule, navigationByPermission, state)
  const navigationPreview = buildAuthorizedNavigationPreview(state.navigationItems, selectedPermissions, role.code)
  const navigationPermissionCount = countNavigationPermissions(state.navigationItems, selectedPermissions, role.code)

  container.innerHTML = `
    ${renderRoleOverview(role, selectedPermissions, navigationPreview, navigationPermissionCount)}
    ${renderNavigationAccessMatrix(state.navigationItems, role, selectedPermissions, selectedNavigationCodes)}
    ${renderPermissionToolbar(state)}
    <div class="permission-modules">
      ${modules.length ?
    modules.map(([module, permissions]) => `
    <div class="permission-module mb-3">
      <div class="d-flex align-items-center justify-content-between mb-2">
        <div>
          <h4 class="h6 text-uppercase text-muted mb-0">${escapeHtml(formatModuleLabel(module))}</h4>
          <small class="text-muted">${permissions.length} permiso${permissions.length === 1 ? '' : 's'} en este modulo</small>
        </div>
        <button type="button" class="btn btn-xs btn-outline-secondary js-toggle-module" data-module="${escapeHtml(module)}">
          <i class="fas fa-check-double mr-1"></i>Seleccionar todo
        </button>
      </div>
      <div class="row">
        ${(permissions || []).map(permission => `
          <div class="col-md-6 col-xl-4">
            <div class="permission-card ${selectedPermissions.has(permission.code) ? 'is-enabled' : ''}">
              <div class="custom-control custom-checkbox">
              <input type="checkbox"
                class="custom-control-input permission-checkbox"
                id="permission-${escapeAttr(permission.code)}"
                data-module="${escapeHtml(module)}"
                value="${escapeAttr(permission.code)}"
                ${selectedPermissions.has(permission.code) ? 'checked' : ''}
                ${isProtectedAdminPermission(role, permission.code) ? 'disabled' : ''}>
              <label class="custom-control-label" for="permission-${escapeAttr(permission.code)}">
                <span class="d-block">${escapeHtml(formatPermissionLabel(permission))}</span>
                ${renderNavigationBadges(navigationByPermission.get(permission.code))}
                ${permission?.description ? `<small class="d-block text-muted">${escapeHtml(permission.description)}</small>` : ''}
              </label>
              </div>
            </div>
          </div>`).join('')}
      </div>
    </div>`).join('') :
    emptyState('No hay permisos que coincidan con el filtro actual.')}
    </div>`

  bindPermissionFilters(container, state)

  container.querySelectorAll('.js-toggle-module').forEach(button => {
    button.addEventListener('click', () => {
      const checkboxes = [...container.querySelectorAll(`.permission-checkbox[data-module="${cssEscape(button.dataset.module)}"]`)]
        .filter(checkbox => !checkbox.disabled)
      const shouldCheck = checkboxes.some(checkbox => !checkbox.checked)
      checkboxes.forEach(checkbox => {
        checkbox.checked = shouldCheck
      })
    })
  })
}

export function renderRoleOverview(role, selectedPermissions, navigationPreview, navigationPermissionCount) {
  return `
    <section class="role-permission-overview">
      <div class="role-permission-heading">
        <span class="text-uppercase small font-weight-bold">Rol seleccionado</span>
        <h2>${escapeHtml(role.name)}</h2>
        <p>${escapeHtml(getRoleDescription(role.code))}. Los permisos controlan acciones y la matriz de pantallas define la navegación disponible.</p>
      </div>
      <div class="role-permission-stats">
        <div>
          <span>Permisos activos</span>
          <strong>${selectedPermissions.size}</strong>
        </div>
        <div>
          <span>Pantallas visibles</span>
          <strong>${navigationPermissionCount}</strong>
        </div>
        <div>
          <span>Grupos de menu</span>
          <strong>${navigationPreview.length}</strong>
        </div>
      </div>
      <div class="role-menu-preview">
        <div class="role-menu-preview-title">
          <i class="fas fa-sitemap mr-1"></i>Menu que vera este rol
        </div>
        ${navigationPreview.length ?
    navigationPreview.map(item => `
          <div class="role-menu-preview-group">
            <strong><i class="fas ${escapeHtml(item.icon || 'fa-circle')} mr-1"></i>${escapeHtml(item.label)}</strong>
            <span>${escapeHtml(item.children.map(child => child.label).join(' / '))}</span>
          </div>`).join('') :
    '<p class="text-muted mb-0">Este rol no tiene pantallas visibles con los permisos actuales.</p>'}
      </div>
    </section>`
}

export function renderNavigationAccessMatrix(items, role, selectedPermissions, selectedNavigationCodes) {
  const routes = flattenNavigationRoutes(items)

  return `
    <section class="navigation-access-matrix">
      <div class="navigation-access-heading">
        <div>
          <span class="text-uppercase small font-weight-bold text-primary">Acceso a pantallas</span>
          <h3 class="h5 mb-1">Menú disponible para ${escapeHtml(role.name)}</h3>
          <p class="text-muted mb-0">Activa o desactiva cada pantalla sin alterar los permisos funcionales del rol.</p>
        </div>
        <span class="badge badge-primary">${selectedNavigationCodes.size} habilitadas</span>
      </div>
      <div class="row navigation-access-grid">
        ${routes.map(item => {
    const checked = selectedNavigationCodes.has(item.code)
    const hasRequiredPermission = !item.permission || selectedPermissions.has(item.permission)
    const protectedScreen = isProtectedAdminScreen(role, item.code)

    return `
            <div class="col-md-6 col-xl-4">
              <label class="navigation-access-card ${checked ? 'is-enabled' : ''} ${hasRequiredPermission ? '' : 'is-missing-permission'}">
                <input type="checkbox" class="navigation-checkbox"
                  value="${escapeAttr(item.code)}"
                  ${checked ? 'checked' : ''}
                  ${protectedScreen ? 'disabled' : ''}>
                <span class="navigation-access-icon"><i class="fas ${escapeHtml(item.icon || 'fa-file')}"></i></span>
                <span class="navigation-access-content">
                  <strong>${escapeHtml(item.label)}</strong>
                  <small>${escapeHtml(item.path)}</small>
                  ${hasRequiredPermission ?
    '<span class="text-success"><i class="fas fa-check-circle mr-1"></i>Permiso compatible</span>' :
    `<span class="text-warning"><i class="fas fa-exclamation-triangle mr-1"></i>Requiere ${escapeHtml(item.permission)}</span>`}
                  ${protectedScreen ? '<span class="text-info"><i class="fas fa-lock mr-1"></i>Acceso administrativo protegido</span>' : ''}
                </span>
              </label>
            </div>`
  }).join('')}
      </div>
    </section>`
}

export function renderPermissionToolbar(state) {
  return `
    <div class="permission-toolbar">
      <div class="input-group input-group-sm permission-search">
        <div class="input-group-prepend">
          <span class="input-group-text"><i class="fas fa-search"></i></span>
        </div>
        <input id="permission-search-input" type="search" class="form-control"
          placeholder="Buscar permiso, modulo o pantalla..."
          value="${escapeAttr(state.permissionSearchTerm)}">
      </div>
      <label class="permission-nav-filter mb-0">
        <input id="permission-navigation-only" type="checkbox" ${state.showNavigationOnly ? 'checked' : ''}>
        Mostrar solo permisos que habilitan pantallas
      </label>
    </div>`
}

function bindPermissionFilters(container, state) {
  const searchInput = container.querySelector('#permission-search-input')
  const navigationOnlyInput = container.querySelector('#permission-navigation-only')

  if (state.keepSearchFocus && searchInput) {
    searchInput.focus()
    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length)
    state.keepSearchFocus = false
  }

  searchInput?.addEventListener('input', () => {
    state.permissionSearchTerm = searchInput.value
    state.keepSearchFocus = true
    globalThis.clearTimeout(state.searchRenderTimer)
    state.searchRenderTimer = globalThis.setTimeout(() => renderPermissions(state), 180)
  })

  navigationOnlyInput?.addEventListener('change', () => {
    state.showNavigationOnly = navigationOnlyInput.checked
    renderPermissions(state)
  })
}

export function filterPermissionModules(permissionsByModule, navigationByPermission, state) {
  const searchTerm = normalizeSearchTerm(state.permissionSearchTerm)

  return Object.entries(permissionsByModule)
    .map(([module, permissions]) => [
      module,
      (permissions || []).filter(permission => {
        const navigationEntries = navigationByPermission.get(permission.code) || []
        if (state.showNavigationOnly && !navigationEntries.length) {
          return false
        }

        if (!searchTerm) {
          return true
        }

        return normalizeSearchTerm([
          module,
          permission.code,
          permission.name,
          permission.description,
          navigationEntries.map(entry => entry.label).join(' ')
        ].join(' ')).includes(searchTerm)
      })
    ])
    .filter(([, permissions]) => permissions.length)
}

export function buildAuthorizedNavigationPreview(items = [], selectedPermissions = new Set(), roleCode = null) {
  return (items || []).reduce((result, item) => {
    if (!canShowNavigationItem(item, selectedPermissions, roleCode)) {
      return result
    }

    const children = buildAuthorizedNavigationPreview(item.children || [], selectedPermissions, roleCode)
    if ((item.children || []).length && !children.length) {
      return result
    }

    result.push({ ...item, children })
    return result
  }, [])
}

export function canShowNavigationItem(item, selectedPermissions, roleCode = null) {
  return isNavigationItemVisibleForRole(item, roleCode) &&
    (!item.permission || selectedPermissions.has(item.permission))
}

export function countNavigationPermissions(items = [], selectedPermissions = new Set(), roleCode = null) {
  return flattenNavigationItems(buildAuthorizedNavigationPreview(items, selectedPermissions, roleCode))
    .filter(item => item.route)
    .length
}

export function isNavigationItemVisibleForRole(item, roleCode = null) {
  if (!roleCode) {
    return true
  }

  const allowedRoles = Array.isArray(item.allowedRoles) ? item.allowedRoles : []
  return allowedRoles.length === 0 ||
    allowedRoles.map(code => String(code).toUpperCase()).includes(String(roleCode).toUpperCase())
}

export function getNavigationCodesForRole(items = [], roleCode = null) {
  return flattenNavigationItems(items)
    .filter(item => item.route && item.active !== false && isNavigationItemVisibleForRole(item, roleCode))
    .map(item => item.code)
}

export function flattenNavigationRoutes(items = [], parentLabel = '') {
  return (items || []).flatMap(item => {
    const path = parentLabel ? `${parentLabel} / ${item.label}` : item.label
    const current = item.route ? [{ ...item, path }] : []

    return [...current, ...flattenNavigationRoutes(item.children || [], path)]
  })
}

export function flattenNavigationItems(items = []) {
  return items.flatMap(item => [item, ...flattenNavigationItems(item.children || [])])
}

export function buildNavigationPermissionIndex(items = [], parentLabel = '') {
  const index = new Map();

  (items || []).forEach(item => {
    const currentLabel = parentLabel ? `${parentLabel} / ${item.label}` : item.label
    const permission = item.permission || ''

    if (permission) {
      const entries = index.get(permission) || []
      entries.push({
        label: currentLabel,
        route: item.route || '',
        active: item.active !== false
      })
      index.set(permission, entries)
    }

    const childIndex = buildNavigationPermissionIndex(item.children || [], currentLabel)
    childIndex.forEach((entries, code) => {
      index.set(code, [...(index.get(code) || []), ...entries])
    })
  })

  return index
}

function renderNavigationBadges(entries = []) {
  if (!entries.length) {
    return ''
  }

  return `
    <div class="permission-navigation-impact">
      ${entries.map(entry => `
        <span class="badge badge-info mr-1 mb-1" title="${escapeAttr(entry.route || 'Grupo de navegación')}">
          <i class="fas fa-compass mr-1"></i>${escapeHtml(entry.label)}
        </span>`).join('')}
    </div>`
}

export function formatModuleLabel(module) {
  const labels = {
    about: 'Información',
    dashboard: 'Panel principal',
    incidents: 'Incidencias',
    comments: 'Comentarios',
    profile: 'Perfil',
    users: 'Usuarios',
    operations: 'Cobertura operativa',
    catalogs: 'Catalogos',
    territorial_units: 'Territorio',
    reportes: 'Reportes',
    configuracion: 'Configuración',
    audit: 'Auditoria'
  }
  const key = String(module || '').toLowerCase()
  return labels[key] || humanizeCode(module)
}

export function formatPermissionLabel(permission) {
  return permission?.name || humanizeCode(permission?.code)
}

export function getRoleDescription(code) {
  const descriptions = {
    ADMIN: 'Administracion completa',
    SUPERVISOR: 'Supervision y coordinacion',
    OPERADOR: 'Atención operativa',
    CIUDADANO: 'Registro y seguimiento'
  }
  return descriptions[String(code || '').toUpperCase()] || 'Rol del sistema'
}

export function humanizeCode(value) {
  return String(value || '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

export function normalizeSearchTerm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .trim()
}

export async function saveRolePermissions(state) {
  const role = selectedRole(state)
  if (!role) {
    return
  }

  const permissions = [...document.querySelectorAll('.permission-checkbox:checked')]
    .map(checkbox => checkbox.value)
  const navigationItems = [...document.querySelectorAll('.navigation-checkbox:checked')]
    .map(checkbox => checkbox.value)

  if (String(role.code).toUpperCase() === 'ADMIN') {
    if (!permissions.includes(ADMIN_CONTROL_PERMISSION)) {
      permissions.push(ADMIN_CONTROL_PERMISSION)
    }

    if (!navigationItems.includes(ADMIN_CONTROL_SCREEN)) {
      navigationItems.push(ADMIN_CONTROL_SCREEN)
    }
  }

  showPageLoading('Guardando accesos', 'Actualizando permisos y pantallas del rol...')

  try {
    const response = await updateRoleAccess(role.id, permissions, navigationItems)

    replaceRole(state, response?.data?.role)
    if (Array.isArray(response?.data?.navigationItems)) {
      state.navigationItems = response.data.navigationItems
    }

    renderRoles(state)
    renderPermissions(state)
    setFormAlert(document.getElementById('access-alert'), response.message || 'Accesos actualizados.', 'success')
  } catch (error) {
    handleBackendErrors(error, null, document.getElementById('access-alert'))
  } finally {
    hidePageLoading()
  }
}

export function isProtectedAdminPermission(role, permissionCode) {
  return String(role?.code || '').toUpperCase() === 'ADMIN' &&
    permissionCode === ADMIN_CONTROL_PERMISSION
}

export function isProtectedAdminScreen(role, navigationCode) {
  return String(role?.code || '').toUpperCase() === 'ADMIN' &&
    navigationCode === ADMIN_CONTROL_SCREEN
}

export function selectedRole(state) {
  return state.roles.find(role => role.code === state.selectedRoleCode) || null
}

function replaceRole(state, updatedRole) {
  if (!updatedRole?.id) {
    return
  }

  state.roles = state.roles.map(role => role.id === updatedRole.id ? updatedRole : role)
}

export function emptyState(message) {
  return `
    <div class="text-center text-muted py-4">
      <i class="fas fa-inbox fa-2x mb-2 d-block"></i>${escapeHtml(message)}
    </div>`
}

export function cssEscape(value) {
  return String(value || '').replace(/["\\]/g, '\\$&')
}

export function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', '&quot;')
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#039;')
}
