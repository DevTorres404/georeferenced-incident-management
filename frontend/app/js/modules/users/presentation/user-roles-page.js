import { getUsersAndRoles, assignUserRole } from '../../roles/application/access-control-service.js?v=15';
import { hidePageLoading, showPageLoading, escapeHtml } from '../../incidents/presentation/incidents-ui.js?v=16';
import { handleBackendErrors, setFormAlert } from '../../../shared/validators/validation-utils.js?v=1';
import { requestBackend } from '../../../infrastructure/backend-client.js?v=20';

const CITIZEN_ROLE_CODE = 'CIUDADANO';
const EXECUTIVE_ROLE_CODES = new Set(['ADMIN', 'SUPERVISOR', 'OPERADOR']);

document.addEventListener('DOMContentLoaded', initUserRolesPage);

async function initUserRolesPage() {
  if (typeof window.renderLayout === 'function') {
    window.renderLayout('user-roles');
  }

  const state = {
    users: [],
    roles: [],
    filteredUsers: [],
    page: 1,
    perPage: 10,
    searchTerm: '',
    roleGroup: 'all'
  };

  bindActions(state);
  showPageLoading('Cargando usuarios', 'Consultando directorio de usuarios...');
  const loadingFallback = window.setTimeout(hidePageLoading, 3500);

  try {
    const data = await getUsersAndRoles();
    state.users = data.users || [];
    state.roles = data.roles || [];
    applyFilters(state);
  } catch (error) {
    handleBackendErrors(error, null, document.getElementById('access-alert'));
  } finally {
    window.clearTimeout(loadingFallback);
    hidePageLoading();
  }
}

function bindActions(state) {
  const searchInput = document.getElementById('user-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchTerm = e.target.value.toLowerCase().trim();
      state.page = 1;
      applyFilters(state);
    });
  }

  const perPageSelect = document.getElementById('users-per-page');
  if (perPageSelect) {
    perPageSelect.addEventListener('change', (e) => {
      state.perPage = Number(e.target.value) || 10;
      state.page = 1;
      renderPaginatedUsers(state);
    });
  }

  document.getElementById('clear-user-search')?.addEventListener('click', () => {
    state.searchTerm = '';
    state.roleGroup = 'all';
    state.page = 1;
    if (searchInput) searchInput.value = '';
    setActiveRoleGroupButton('all');
    applyFilters(state);
  });

  document.querySelectorAll('[data-role-group]').forEach((button) => {
    button.addEventListener('click', () => {
      state.roleGroup = button.dataset.roleGroup || 'all';
      state.page = 1;
      setActiveRoleGroupButton(state.roleGroup);
      applyFilters(state);
    });
  });

  const pagination = document.getElementById('users-pagination');
  if (pagination) {
    pagination.addEventListener('click', (e) => {
      const button = e.target.closest('[data-page]');
      if (!button || button.classList.contains('disabled')) return;
      const nextPage = Number(button.dataset.page);
      if (!Number.isFinite(nextPage) || nextPage === state.page) return;
      state.page = nextPage;
      renderPaginatedUsers(state);
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
          setFormAlert(document.getElementById('access-alert'), 'Selecciona un rol válido', 'warning');
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
          applyFilters(state, { keepPage: true });
        } catch (error) {
          handleBackendErrors(error, null, document.getElementById('access-alert'));
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-check"></i>';
        }
      } else if (e.target.closest('.btn-deactivate-user')) {
        const btn = e.target.closest('.btn-deactivate-user');
        const userId = btn.dataset.userId;
        
        // Show the bootstrap modal instead of browser confirm
        document.getElementById('btnConfirmDeactivate').dataset.userId = userId;
        $('#modalDeactivateUser').modal('show');
        
      }
    });
  }

  // Handle actual deactivation from the modal
  const btnConfirmDeactivate = document.getElementById('btnConfirmDeactivate');
  if (btnConfirmDeactivate) {
    btnConfirmDeactivate.addEventListener('click', async (e) => {
      const userId = e.target.closest('button').dataset.userId;
      if (!userId) return;

      const btn = e.target.closest('button');
      btn.disabled = true;
      const originalText = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Desactivando...';
      
      try {
        await requestBackend(`/users/${userId}`, { method: 'DELETE' });
        
        $('#modalDeactivateUser').modal('hide');
        
        if (window.showGlobalAlert) {
          window.showGlobalAlert('Usuario desactivado exitosamente', 'success');
        }
        
        // Remover usuario del estado
        state.users = state.users.filter(u => u.id != userId);
        applyFilters(state, { keepPage: true });
      } catch (error) {
        handleBackendErrors(error, null, document.getElementById('access-alert'));
        $('#modalDeactivateUser').modal('hide');
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    });
  }
}

function applyFilters(state, options = {}) {
  const term = state.searchTerm;
  state.filteredUsers = state.users.filter((user) => {
    if (!userMatchesRoleGroup(user, state.roleGroup)) {
      return false;
    }

    if (!term) {
      return true;
    }

    const values = [
      user.name,
      user.username,
      user.email,
      user.role,
      user.role_name,
      getRoleGroupLabel(user.role),
    ];
    return values.some((value) => String(value || '').toLowerCase().includes(term));
  });

  if (!options.keepPage) {
    state.page = 1;
  }
  renderPaginatedUsers(state);
}

function renderPaginatedUsers(state) {
  const total = state.filteredUsers.length;
  const totalPages = Math.max(Math.ceil(total / state.perPage), 1);
  state.page = Math.min(Math.max(state.page, 1), totalPages);

  const startIndex = (state.page - 1) * state.perPage;
  const pageUsers = state.filteredUsers.slice(startIndex, startIndex + state.perPage);

  renderUsersTable(pageUsers, state.roles);
  renderPagination(state, total, totalPages, startIndex, pageUsers.length);
  renderTotalBadge(state.users.length, total);
  renderRoleCounters(state.users);
}

function renderUsersTable(users, roles) {
  const tbody = document.getElementById('user-role-table');
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-muted py-4">
          <i class="fas fa-search d-block mb-2"></i>No se encontraron usuarios.
        </td>
      </tr>`;
    return;
  }

  let html = '';
  users.forEach(user => {
    const roleOptions = buildRoleOptions(roles, user.role);
    const userName = user.name || user.username || user.email || 'Usuario';
    const roleGroup = getRoleGroupLabel(user.role);

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
        <td>
          <span class="text-muted">${escapeHtml(user.email || '-')}</span>
        </td>
        <td>
          <span class="badge badge-info">${escapeHtml(user.role_name || user.role || 'Sin rol')}</span>
          <small class="d-block text-muted mt-1">${escapeHtml(roleGroup)}</small>
        </td>
        <td>
          <select class="form-control form-control-sm" id="role-select-${user.id}">
            <option value="">Seleccionar rol</option>
            ${roleOptions}
          </select>
        </td>
        <td class="text-center text-nowrap">
          <button type="button" class="btn btn-sm btn-success btn-assign-role mb-1" data-user-id="${user.id}" title="Aplicar Rol">
            <i class="fas fa-check"></i>
          </button>
          <button type="button" class="btn btn-sm btn-outline-danger btn-deactivate-user mb-1 ml-1" data-user-id="${user.id}" title="Desactivar/Eliminar usuario">
            <i class="fas fa-trash-alt"></i>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function buildRoleOptions(roles, currentRoleCode) {
  const groups = roles.reduce((acc, role) => {
    const group = getRoleGroup(role.code);
    acc[group].push(role);
    return acc;
  }, { executives: [], citizens: [], others: [] });

  return [
    buildOptionGroup('Roles ejecutivos', groups.executives, currentRoleCode),
    buildOptionGroup('Ciudadanos', groups.citizens, currentRoleCode),
    buildOptionGroup('Otros roles', groups.others, currentRoleCode),
  ].filter(Boolean).join('');
}

function buildOptionGroup(label, roles, currentRoleCode) {
  if (!roles.length) return '';

  const options = roles.map((role) => {
    const selected = normalizeRoleCode(currentRoleCode) === normalizeRoleCode(role.code) ? 'selected' : '';
    return `<option value="${escapeHtml(role.code)}" ${selected}>${escapeHtml(role.name)}</option>`;
  }).join('');

  return `<optgroup label="${escapeHtml(label)}">${options}</optgroup>`;
}

function setActiveRoleGroupButton(group) {
  document.querySelectorAll('[data-role-group]').forEach((button) => {
    const isActive = button.dataset.roleGroup === group;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function userMatchesRoleGroup(user, group) {
  if (group === 'citizens') {
    return getRoleGroup(user.role) === 'citizens';
  }

  if (group === 'executives') {
    return getRoleGroup(user.role) === 'executives';
  }

  return true;
}

function getRoleGroup(roleCode) {
  const normalizedCode = normalizeRoleCode(roleCode);
  if (normalizedCode === CITIZEN_ROLE_CODE) {
    return 'citizens';
  }
  if (EXECUTIVE_ROLE_CODES.has(normalizedCode)) {
    return 'executives';
  }
  return 'others';
}

function getRoleGroupLabel(roleCode) {
  const group = getRoleGroup(roleCode);
  if (group === 'citizens') {
    return 'Ciudadanos';
  }
  if (group === 'executives') {
    return 'Roles ejecutivos';
  }
  return 'Otros roles';
}

function normalizeRoleCode(roleCode) {
  return String(roleCode || '').trim().toUpperCase();
}

function renderRoleCounters(users) {
  const citizens = users.filter((user) => getRoleGroup(user.role) === 'citizens').length;
  const executives = users.filter((user) => getRoleGroup(user.role) === 'executives').length;

  const citizenBadge = document.getElementById('citizen-count-badge');
  if (citizenBadge) {
    citizenBadge.textContent = String(citizens);
  }

  const executiveBadge = document.getElementById('executive-count-badge');
  if (executiveBadge) {
    executiveBadge.textContent = String(executives);
  }
}

function renderPagination(state, total, totalPages, startIndex, count) {
  const summary = document.getElementById('users-pagination-summary');
  if (summary) {
    if (total === 0) {
      summary.textContent = 'Sin usuarios para mostrar.';
    } else {
      summary.textContent = `Mostrando ${startIndex + 1}-${startIndex + count} de ${total} usuarios`;
    }
  }

  const pagination = document.getElementById('users-pagination');
  if (!pagination) return;

  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  const pages = buildPageList(state.page, totalPages);
  pagination.innerHTML = `
    <li class="page-item ${state.page === 1 ? 'disabled' : ''}">
      <button type="button" class="page-link" data-page="${state.page - 1}" aria-label="Anterior">
        <i class="fas fa-chevron-left"></i>
      </button>
    </li>
    ${pages.map((page) => page === 'ellipsis'
      ? '<li class="page-item disabled"><span class="page-link">...</span></li>'
      : `<li class="page-item ${page === String(state.page) ? 'active' : ''}">
          <button type="button" class="page-link" data-page="${page}">${page}</button>
        </li>`).join('')}
    <li class="page-item ${state.page === totalPages ? 'disabled' : ''}">
      <button type="button" class="page-link" data-page="${state.page + 1}" aria-label="Siguiente">
        <i class="fas fa-chevron-right"></i>
      </button>
    </li>
  `;
}

function buildPageList(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => String(index + 1));
  }

  const pages = ['1'];
  const start = Math.max(currentPage - 1, 2);
  const end = Math.min(currentPage + 1, totalPages - 1);

  if (start > 2) pages.push('ellipsis');
  for (let page = start; page <= end; page += 1) pages.push(String(page));
  if (end < totalPages - 1) pages.push('ellipsis');
  pages.push(String(totalPages));

  return pages;
}

function renderTotalBadge(totalUsers, filteredUsers) {
  const badge = document.getElementById('user-total-badge');
  if (!badge) return;
  badge.textContent = String(totalUsers);
}
