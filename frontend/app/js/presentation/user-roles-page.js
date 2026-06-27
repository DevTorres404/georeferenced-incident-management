import { getUsersAndRoles, assignUserRole } from '../application/access-control-service.js?v=15';
import { hidePageLoading, showPageLoading, escapeHtml } from './incidents-ui.js?v=16';

document.addEventListener('DOMContentLoaded', initUserRolesPage);

async function initUserRolesPage() {
  if (typeof window.renderLayout === 'function') {
    window.renderLayout('user-roles');
  }

  const state = {
    users: [],
    roles: []
  };

  bindActions(state);
  showPageLoading('Cargando usuarios', 'Consultando directorio de usuarios...');
  const loadingFallback = window.setTimeout(hidePageLoading, 3500);

  try {
    const data = await getUsersAndRoles();
    state.users = data.users || [];
    state.roles = data.roles || [];
    renderUsersTable(state.users, state.roles);
  } catch (error) {
    showAlert(error.message || 'Error al cargar usuarios y roles', 'danger');
  } finally {
    window.clearTimeout(loadingFallback);
    hidePageLoading();
  }
}

function bindActions(state) {
  const searchInput = document.getElementById('user-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      const filtered = state.users.filter(u => 
        (u.name && u.name.toLowerCase().includes(term)) || 
        (u.email && u.email.toLowerCase().includes(term))
      );
      renderUsersTable(filtered, state.roles);
    });
  }

  // Event delegation for assign buttons
  const tbody = document.getElementById('user-role-table');
  if (tbody) {
    tbody.addEventListener('click', async (e) => {
      if (e.target.closest('.btn-assign-role')) {
        const btn = e.target.closest('.btn-assign-role');
        const userId = btn.dataset.userId;
        const select = document.getElementById(`role-select-${userId}`);
        const roleCode = select.value;

        if (!roleCode) {
          showAlert('Selecciona un rol válido', 'warning');
          return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        try {
          const response = await assignUserRole(userId, roleCode);
          if (window.showGlobalAlert) {
            window.showGlobalAlert('Rol asignado correctamente', 'success');
          }
          const userObj = state.users.find(u => u.id == userId);
          if (userObj) {
            const selectedRole = state.roles.find(r => r.code === roleCode);
            const updatedUser = response?.data || {};
            Object.assign(userObj, updatedUser, {
              role: roleCode,
              role_name: selectedRole?.name || updatedUser.role_name || roleCode,
              roles: selectedRole ? [selectedRole] : updatedUser.roles || [],
            });
          }
          renderUsersTable(state.users, state.roles);
        } catch (error) {
          showAlert(error.message || 'No se pudo asignar el rol', 'danger');
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-check"></i>';
        }
      }
    });
  }
}

function renderUsersTable(users, roles) {
  const tbody = document.getElementById('user-role-table');
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No se encontraron usuarios.</td></tr>`;
    return;
  }

  let html = '';
  users.forEach(user => {
    let roleOptions = roles.map(r => {
      const selected = user.role === r.code ? 'selected' : '';
      return `<option value="${escapeHtml(r.code)}" ${selected}>${escapeHtml(r.name)}</option>`;
    }).join('');
    const userName = user.name || user.username || user.email || 'Usuario';

    html += `
      <tr>
        <td>
          <div class="d-flex align-items-center">
            <div class="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center mr-2" style="width: 32px; height: 32px; font-weight: bold;">
              ${escapeHtml(userName).charAt(0).toUpperCase()}
            </div>
            <div>
              <p class="mb-0 font-weight-bold">${escapeHtml(userName)}</p>
            </div>
          </div>
        </td>
        <td>${escapeHtml(user.email)}</td>
        <td>
          <span class="badge badge-info">${escapeHtml(user.role_name || user.role || 'Sin Rol')}</span>
        </td>
        <td>
          <select class="form-control form-control-sm" id="role-select-${user.id}">
            <option value="">-- Seleccionar --</option>
            ${roleOptions}
          </select>
        </td>
        <td class="text-center">
          <button type="button" class="btn btn-sm btn-success btn-assign-role" data-user-id="${user.id}" title="Aplicar Rol">
            <i class="fas fa-check"></i>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function showAlert(message, type) {
  const alertEl = document.getElementById('access-alert');
  if (!alertEl) return;
  alertEl.className = `alert alert-${type}`;
  alertEl.textContent = message;
  alertEl.classList.remove('d-none');
  setTimeout(() => alertEl.classList.add('d-none'), 5000);
}
