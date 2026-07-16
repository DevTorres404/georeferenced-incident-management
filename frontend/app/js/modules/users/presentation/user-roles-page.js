import { getUsersAndRoles, assignUserRole } from '../../roles/application/access-control-service.js?v=15';
import { hidePageLoading, showPageLoading, escapeHtml } from '../../incidents/presentation/incidents-ui.js?v=16';
import { handleBackendErrors } from '../../../shared/validators/validation-utils.js?v=1';
import { requestBackend } from '../../../infrastructure/backend-client.js?v=20';

export const CITIZEN_ROLE_CODE = 'CIUDADANO';
export const EXECUTIVE_ROLE_CODES = new Set(['ADMIN', 'SUPERVISOR', 'OPERADOR']);

// ─── Role badge color map ───────────────────────────────────────────
export const ROLE_BADGE_COLORS = {
  ADMIN: 'danger',
  SUPERVISOR: 'warning',
  OPERADOR: 'success',
  CIUDADANO: 'secondary',
};

export const ROLE_BADGE_DEFAULTS = {
  executives: 'info',
  citizens: 'secondary',
  others: 'dark',
};

// ─── Role descriptions ──────────────────────────────────────────────
export const ROLE_DESCRIPTIONS = {
  ADMIN: 'Acceso completo al sistema. Gesti&oacute;n de usuarios, roles, cat&aacute;logos y configuraci&oacute;n general.',
  SUPERVISOR: 'Supervisi&oacute;n operativa por zona. Asignaci&oacute;n de incidentes y gesti&oacute;n del equipo de operadores.',
  OPERADOR: 'Gesti&oacute;n de incidentes asignados. Actualizaci&oacute;n de estado, comentarios y evidencia.',
  CIUDADANO: 'Reporte de incidentes como ciudadano. Solo puede ver y gestionar sus propios reportes.',
};

document.addEventListener('DOMContentLoaded', initUserRolesPage);

async function initUserRolesPage() {
  if (typeof globalThis.renderLayout === 'function') {
    globalThis.renderLayout('user-roles');
  }

  // Bootstrap 4 agrega role='dialog' dinamicamente al .modal, pero role='document'
  // en .modal-dialog debe agregarse manualmente (Web:S6819 / SonarQube)
  $('#modalAssignRole').on('show.bs.modal', function () {
    $('.modal-dialog', this).attr('role', 'document');
  });

  const state = {
    users: [],
    roles: [],
    filteredUsers: [],
    page: 1,
    perPage: 10,
    searchTerm: '',
    roleGroup: 'all',
    // Modal state
    selectedUserForRole: null,
  };

  bindActions(state);
  bindAssignModal(state);
  bindDeactivateModal(state);

  showPageLoading('Cargando usuarios', 'Consultando directorio de usuarios...');
  const loadingFallback = globalThis.setTimeout(hidePageLoading, 3500);

  try {
    const data = await getUsersAndRoles();
    state.users = data.users || [];
    state.roles = data.roles || [];
    applyFilters(state);
  } catch (error) {
    handleBackendErrors(error, null, document.getElementById('access-alert'));
  } finally {
    globalThis.clearTimeout(loadingFallback);
    hidePageLoading();
  }
}

// ─── Bind UI actions ────────────────────────────────────────────────
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

  // Event delegation: assign / deactivate buttons
  const tbody = document.getElementById('user-role-table');
  if (tbody) {
    tbody.addEventListener('click', (e) => {
      const assignBtn = e.target.closest('.btn-assign-role');
      if (assignBtn) {
        const userId = assignBtn.dataset.userId;
        const user = state.users.find((u) => u.id == userId);
        if (user) {
          state.selectedUserForRole = user;
          openAssignModal(state);
        }
        return;
      }

      const deactivateBtn = e.target.closest('.btn-deactivate-user');
      if (deactivateBtn) {
        const userId = deactivateBtn.dataset.userId;
        document.getElementById('btnConfirmDeactivate').dataset.userId = userId;
        $('#modalDeactivateUser').modal('show');
      }
    });
  }
}

// ─── Assign role modal ──────────────────────────────────────────────
function bindAssignModal(state) {
  const roleSelect = document.getElementById('assignRoleSelect');
  if (roleSelect) {
    roleSelect.addEventListener('change', () => {
      const code = roleSelect.value;
      const desc = document.getElementById('assignRoleDescription');
      const confirmBtn = document.getElementById('btnConfirmAssignRole');
      confirmBtn.disabled = !code;

      if (code && ROLE_DESCRIPTIONS[code]) {
        desc.innerHTML = ROLE_DESCRIPTIONS[code];
      } else if (code) {
        const role = state.roles.find((r) => r.code === code);
        desc.textContent = role?.description || 'Rol seleccionado.';
      } else {
        desc.textContent = 'Selecciona un rol para ver su descripción.';
      }
    });
  }

  document.getElementById('btnConfirmAssignRole')?.addEventListener('click', async () => {
    const user = state.selectedUserForRole;
    const roleCode = document.getElementById('assignRoleSelect').value;
    if (!user || !roleCode) return;

    const btn = document.getElementById('btnConfirmAssignRole');
    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Asignando...';

    try {
      const response = await assignUserRole(user.id, roleCode);
      $('#modalAssignRole').modal('hide');

      if (globalThis.showGlobalAlert) {
        globalThis.showGlobalAlert('Rol asignado correctamente', 'success');
      }

      const selectedRole = state.roles.find((r) => r.code === roleCode);
      const updatedUser = response?.data || {};
      Object.assign(user, updatedUser, {
        role: roleCode,
        role_name: selectedRole?.name || updatedUser.role_name || roleCode,
        roles: selectedRole ? [selectedRole] : updatedUser.roles || [],
      });

      applyFilters(state, { keepPage: true });
    } catch (error) {
      handleBackendErrors(error, null, document.getElementById('access-alert'));
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  });
}

function openAssignModal(state) {
  const user = state.selectedUserForRole;
  if (!user) return;

  const userName = user.name || user.username || user.email || 'Usuario';
  const initial = userName.charAt(0).toUpperCase();
  const email = user.email || '';
  const isActive = user.is_active ?? user.activo ?? true;

  // User avatar
  const avatarEl = document.getElementById('assignUserAvatar');
  avatarEl.textContent = initial;
  avatarEl.style.backgroundColor = getAvatarColor(userName);

  // User name and email
  document.getElementById('assignUserName').textContent = userName;
  document.getElementById('assignUserEmail').textContent = email;

  // User status
  const statusEl = document.getElementById('assignUserStatus');
  statusEl.innerHTML = isActive
    ? '<span class="badge badge-success badge-sm"><i class="fas fa-circle mr-1" style="font-size: 0.45rem; vertical-align: middle;"></i>Activo</span>'
    : '<span class="badge badge-secondary"><i class="fas fa-circle mr-1" style="font-size: 0.45rem; vertical-align: middle;"></i>Inactivo</span>';

  // Current role badge
  const currentRoleCode = user.role || '';
  const currentRoleName = user.role_name || 'Sin rol';
  const badgeColor = getRoleBadgeColor(currentRoleCode);
  document.getElementById('assignCurrentRoleBadge').className = `badge badge-${badgeColor} px-3 py-2 font-weight-bold`;
  document.getElementById('assignCurrentRoleBadge').textContent = currentRoleName;

  // Build role options
  const select = document.getElementById('assignRoleSelect');
  select.innerHTML = '<option value="">Seleccionar rol</option>';

  const groups = state.roles.reduce((acc, role) => {
    const group = getRoleGroup(role.code);
    acc[group].push(role);
    return acc;
  }, { executives: [], citizens: [], others: [] });

  const groupLabels = {
    executives: 'Roles ejecutivos',
    citizens: 'Ciudadanos',
    others: 'Otros roles',
  };

  Object.entries(groups).forEach(([groupKey, roles]) => {
    if (!roles.length) return;
    const optgroup = document.createElement('optgroup');
    optgroup.label = groupLabels[groupKey] || groupKey;

    roles.forEach((role) => {
      const option = document.createElement('option');
      option.value = role.code;
      option.textContent = role.name;
      if (normalizeRoleCode(role.code) === normalizeRoleCode(currentRoleCode)) {
        option.selected = true;
      }
      optgroup.appendChild(option);
    });

    select.appendChild(optgroup);
  });

  // Reset description and confirm button
  document.getElementById('assignRoleDescription').textContent =
    currentRoleCode
      ? 'El rol actual est&aacute; preseleccionado. Elige otro si deseas cambiar.'
      : 'Selecciona un rol para asignarlo al usuario.';
  document.getElementById('btnConfirmAssignRole').disabled = false;

  $('#modalAssignRole').modal('show');
}

// ─── Deactivate modal ───────────────────────────────────────────────
function bindDeactivateModal(state) {
  const btnConfirmDeactivate = document.getElementById('btnConfirmDeactivate');
  if (!btnConfirmDeactivate) return;

  btnConfirmDeactivate.addEventListener('click', async (e) => {
    const userId = e.currentTarget.dataset.userId;
    if (!userId) return;

    const btn = e.currentTarget;
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Desactivando...';

    try {
      await requestBackend(`/users/${userId}`, { method: 'DELETE' });
      $('#modalDeactivateUser').modal('hide');

      if (globalThis.showGlobalAlert) {
        globalThis.showGlobalAlert('Usuario desactivado exitosamente', 'success');
      }

      state.users = state.users.filter((u) => u.id != userId);
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

// ─── Filtering & rendering ──────────────────────────────────────────
export function applyFilters(state, options = {}) {
  const term = state.searchTerm;
  state.filteredUsers = state.users.filter((user) => {
    if (!userMatchesRoleGroup(user, state.roleGroup)) return false;
    if (!term) return true;

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

  if (!options.keepPage) state.page = 1;
  renderPaginatedUsers(state);
}

export function renderPaginatedUsers(state) {
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

export function renderUsersTable(users, roles) {
  const tbody = document.getElementById('user-role-table');
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-muted py-4">
          <i class="fas fa-search d-block mb-2" style="font-size: 1.5rem;"></i>
          No se encontraron usuarios.
        </td>
      </tr>`;
    return;
  }

  let html = '';
  users.forEach((user) => {
    const userName = user.name || user.username || user.email || 'Usuario';
    const initial = userName.charAt(0).toUpperCase();
    const avatarColor = getAvatarColor(userName);
    const badgeColor = getRoleBadgeColor(user.role);
    const roleDisplay = user.role_name || user.role || 'Sin rol';
    const roleGroupLabel = getRoleGroupLabel(user.role);
    const isActive = user.is_active ?? user.activo ?? true;

    html += `
      <tr class="${isActive ? '' : 'table-inactive'}">
        <td>
          <div class="d-flex align-items-center">
            <div class="ur-avatar rounded-circle text-white d-flex align-items-center justify-content-center mr-2 flex-shrink-0"
                 style="width: 36px; height: 36px; font-weight: 700; font-size: 0.9rem; background-color: ${avatarColor};">
              ${escapeHtml(initial)}
            </div>
            <div class="min-w-0">
              <p class="mb-0 font-weight-bold text-truncate" style="max-width: 200px;">${escapeHtml(userName)}</p>
              <small class="text-muted">@${escapeHtml(user.username || '—')}</small>
            </div>
          </div>
        </td>
        <td>
          <span class="text-muted">${escapeHtml(user.email || '—')}</span>
        </td>
        <td>
          <div class="d-flex align-items-center flex-wrap gap-1">
            <span class="badge badge-${badgeColor} px-3 py-2 font-weight-bold">${escapeHtml(roleDisplay)}</span>
            <small class="text-muted d-block w-100 mt-1">${escapeHtml(roleGroupLabel)}</small>
          </div>
        </td>
        <td class="text-center">
          <div class="d-flex justify-content-center gap-1">
            <button type="button" class="btn btn-sm btn-outline-primary btn-assign-role font-weight-bold"
                    data-user-id="${user.id}" title="Asignar rol">
              <i class="fas fa-user-tag mr-1"></i>Rol
            </button>
            <button type="button" class="btn btn-sm btn-outline-danger btn-deactivate-user"
                    data-user-id="${user.id}" title="Desactivar usuario">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </td>
      </tr>`;
  });

  tbody.innerHTML = html;
}

// ─── Role helpers ───────────────────────────────────────────────────
export function getRoleBadgeColor(roleCode) {
  const code = normalizeRoleCode(roleCode);
  if (ROLE_BADGE_COLORS[code]) return ROLE_BADGE_COLORS[code];

  const group = getRoleGroup(code);
  return ROLE_BADGE_DEFAULTS[group] || 'secondary';
}

export function getAvatarColor(name) {
  const colors = [
    '#1498D4', '#D9534F', '#D99A27', '#269B72',
    '#7B61FF', '#E67E22', '#1ABC9C', '#3498DB',
    '#E74C3C', '#2ECC71', '#F39C12', '#9B59B6',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.codePointAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function setActiveRoleGroupButton(group) {
  document.querySelectorAll('[data-role-group]').forEach((button) => {
    const isActive = button.dataset.roleGroup === group;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

export function userMatchesRoleGroup(user, group) {
  if (group === 'citizens') return getRoleGroup(user.role) === 'citizens';
  if (group === 'executives') return getRoleGroup(user.role) === 'executives';
  return true;
}

export function getRoleGroup(roleCode) {
  const normalizedCode = normalizeRoleCode(roleCode);
  if (normalizedCode === CITIZEN_ROLE_CODE) return 'citizens';
  if (EXECUTIVE_ROLE_CODES.has(normalizedCode)) return 'executives';
  return 'others';
}

export function getRoleGroupLabel(roleCode) {
  const group = getRoleGroup(roleCode);
  if (group === 'citizens') return 'Ciudadanos';
  if (group === 'executives') return 'Roles ejecutivos';
  return 'Otros roles';
}

export function normalizeRoleCode(roleCode) {
  return String(roleCode || '').trim().toUpperCase();
}

// ─── Counters, pagination, summary ──────────────────────────────────
export function renderRoleCounters(users) {
  const citizens = users.filter((user) => getRoleGroup(user.role) === 'citizens').length;
  const executives = users.filter((user) => getRoleGroup(user.role) === 'executives').length;

  const citizenBadge = document.getElementById('citizen-count-badge');
  if (citizenBadge) citizenBadge.textContent = String(citizens);

  const executiveBadge = document.getElementById('executive-count-badge');
  if (executiveBadge) executiveBadge.textContent = String(executives);
}

export function renderPagination(state, total, totalPages, startIndex, count) {
  const summary = document.getElementById('users-pagination-summary');
  if (summary) {
    if (total === 0) {
      summary.textContent = 'Sin usuarios para mostrar.';
    } else {
      summary.textContent = `Mostrando ${startIndex + 1}–${startIndex + count} de ${total} usuarios`;
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
    ${pages.map((page) =>
      page === 'ellipsis'
        ? '<li class="page-item disabled"><span class="page-link">...</span></li>'
        : `<li class="page-item ${page === String(state.page) ? 'active' : ''}">
            <button type="button" class="page-link" data-page="${page}">${page}</button>
          </li>`
    ).join('')}
    <li class="page-item ${state.page === totalPages ? 'disabled' : ''}">
      <button type="button" class="page-link" data-page="${state.page + 1}" aria-label="Siguiente">
        <i class="fas fa-chevron-right"></i>
      </button>
    </li>`;
}

export function buildPageList(currentPage, totalPages) {
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

export function renderTotalBadge(totalUsers, filteredUsers) {
  const badge = document.getElementById('user-total-badge');
  if (!badge) return;
  badge.textContent = String(totalUsers);
}

export { initUserRolesPage, openAssignModal, bindActions, bindAssignModal, bindDeactivateModal };
