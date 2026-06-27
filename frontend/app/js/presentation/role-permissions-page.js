import { getAccessControlOverview, updateRolePermissions } from '../application/access-control-service.js?v=15';
import { hidePageLoading, showPageLoading } from './incidents-ui.js?v=16';

document.addEventListener('DOMContentLoaded', initRolePermissionsPage);

async function initRolePermissionsPage() {
  if (typeof window.renderLayout === 'function') {
    window.renderLayout('role-permissions');
  }

  const state = {
    roles: [],
    permissionsByModule: {},
    selectedRoleCode: null,
  };

  bindActions(state);
  showPageLoading('Cargando accesos', 'Consultando roles y permisos...');
  const loadingFallback = window.setTimeout(hidePageLoading, 3500);

  try {
    const overview = await getAccessControlOverview();
    state.roles = overview.roles;
    state.permissionsByModule = overview.permissionsByModule;
    state.selectedRoleCode = state.roles[0]?.code || null;

    renderRoles(state);
    renderPermissions(state);
  } catch (error) {
    showAlert(error.message || 'No se pudo cargar roles y permisos.', 'danger');
  } finally {
    window.clearTimeout(loadingFallback);
    hidePageLoading();
  }
}

function bindActions(state) {
  document.getElementById('save-role-permissions-btn')?.addEventListener('click', () => saveRolePermissions(state));
}

function renderRoles(state) {
  const container = document.getElementById('role-list');
  if (!container) return;

  container.innerHTML = state.roles.map((role) => {
    const activeClass = role.code === state.selectedRoleCode ? 'active' : '';
    const permissionCount = role.permissions?.length || 0;

    return `
      <button type="button" class="list-group-item list-group-item-action ${activeClass}" data-role-code="${escapeHtml(role.code)}">
        <div class="d-flex align-items-center justify-content-between">
          <strong>${escapeHtml(role.name)}</strong>
          <span class="badge badge-light">${permissionCount}</span>
        </div>
        <small>${escapeHtml(role.code)}</small>
      </button>`;
  }).join('');

  container.querySelectorAll('[data-role-code]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedRoleCode = button.dataset.roleCode;
      renderRoles(state);
      renderPermissions(state);
    });
  });
}

function renderPermissions(state) {
  const container = document.getElementById('permission-matrix');
  if (!container) return;

  const role = selectedRole(state);
  if (!role) {
    container.innerHTML = emptyState('No hay roles disponibles.');
    return;
  }

  const selectedPermissions = new Set((role.permissions || []).map((permission) => permission.code));
  const modules = Object.entries(state.permissionsByModule);

  container.innerHTML = modules.map(([module, permissions]) => `
    <div class="permission-module mb-3">
      <div class="d-flex align-items-center justify-content-between mb-2">
        <h4 class="h6 text-uppercase text-muted mb-0">${escapeHtml(module)}</h4>
        <button type="button" class="btn btn-xs btn-outline-secondary js-toggle-module" data-module="${escapeHtml(module)}">
          <i class="fas fa-check-double mr-1"></i>Seleccionar modulo
        </button>
      </div>
      <div class="row">
        ${(permissions || []).map((permission) => `
          <div class="col-md-6 col-xl-4">
            <div class="custom-control custom-checkbox mb-2">
              <input type="checkbox"
                class="custom-control-input permission-checkbox"
                id="permission-${escapeAttr(permission.code)}"
                data-module="${escapeHtml(module)}"
                value="${escapeAttr(permission.code)}"
                ${selectedPermissions.has(permission.code) ? 'checked' : ''}>
              <label class="custom-control-label" for="permission-${escapeAttr(permission.code)}">
                <span class="d-block">${escapeHtml(permission.name)}</span>
              </label>
            </div>
          </div>`).join('')}
      </div>
    </div>`).join('');

  container.querySelectorAll('.js-toggle-module').forEach((button) => {
    button.addEventListener('click', () => {
      const checkboxes = [...container.querySelectorAll(`.permission-checkbox[data-module="${cssEscape(button.dataset.module)}"]`)];
      const shouldCheck = checkboxes.some((checkbox) => !checkbox.checked);
      checkboxes.forEach((checkbox) => {
        checkbox.checked = shouldCheck;
      });
    });
  });
}

async function saveRolePermissions(state) {
  const role = selectedRole(state);
  if (!role) return;

  const permissions = [...document.querySelectorAll('.permission-checkbox:checked')]
    .map((checkbox) => checkbox.value);

  showPageLoading('Guardando permisos', 'Actualizando configuración del rol...');

  try {
    const response = await updateRolePermissions(role.id, permissions);

    replaceRole(state, response?.data);
    renderRoles(state);
    renderPermissions(state);
    showAlert(response.message || 'Permisos actualizados.', 'success');
  } catch (error) {
    showAlert(error.message || 'No se pudieron guardar los permisos.', 'danger');
  } finally {
    hidePageLoading();
  }
}

function selectedRole(state) {
  return state.roles.find((role) => role.code === state.selectedRoleCode) || null;
}

function replaceRole(state, updatedRole) {
  if (!updatedRole?.id) return;
  state.roles = state.roles.map((role) => role.id === updatedRole.id ? updatedRole : role);
}

function showAlert(message, type) {
  const alert = document.getElementById('access-alert');
  if (!alert) return;

  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  alert.classList.remove('d-none');

  window.setTimeout(() => {
    alert.classList.add('d-none');
  }, 3500);
}

function emptyState(message) {
  return `
    <div class="text-center text-muted py-4">
      <i class="fas fa-inbox fa-2x mb-2 d-block"></i>${escapeHtml(message)}
    </div>`;
}

function cssEscape(value) {
  return String(value || '').replace(/["\\]/g, '\\$&');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
