import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../app/js/modules/roles/application/access-control-service.js', () => ({
  getUsersAndRoles: vi.fn(),
  assignUserRole: vi.fn(),
}));

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  escapeHtml: (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn(),
}));

vi.mock('../app/js/shared/validators/validation-utils.js', () => ({
  handleBackendErrors: vi.fn(),
}));

vi.mock('../app/js/infrastructure/backend-client.js', () => ({
  requestBackend: vi.fn(),
}));

import { getUsersAndRoles, assignUserRole } from '../app/js/modules/roles/application/access-control-service.js';
import { handleBackendErrors } from '../app/js/shared/validators/validation-utils.js';
import { requestBackend } from '../app/js/infrastructure/backend-client.js';
import { showPageLoading, hidePageLoading } from '../app/js/modules/incidents/presentation/incidents-ui.js';

const DOM_FIXTURE = `
<div id="access-alert"></div>

<input id="user-search" type="text" />
<button id="clear-user-search" type="button">Limpiar</button>

<select id="users-per-page">
  <option value="10">10</option>
  <option value="25">25</option>
  <option value="50">50</option>
</select>

<div id="filter-buttons">
  <button data-role-group="all" class="active">Todos</button>
  <button data-role-group="executives">Ejecutivos</button>
  <button data-role-group="citizens">Ciudadanos</button>
</div>

<table>
  <tbody id="user-role-table"></tbody>
</table>

<ul id="users-pagination" class="pagination"></ul>
<div id="users-pagination-summary"></div>

<span id="user-total-badge"></span>
<span id="citizen-count-badge"></span>
<span id="executive-count-badge"></span>

<div id="modalAssignRole" class="modal fade">
  <div class="modal-dialog">
    <div class="modal-content">
      <div id="assignUserAvatar" class="ur-avatar"></div>
      <div id="assignUserName"></div>
      <div id="assignUserEmail"></div>
      <div id="assignUserStatus"></div>
      <div id="assignCurrentRoleBadge"></div>
      <select id="assignRoleSelect"></select>
      <div id="assignRoleDescription"></div>
      <button id="btnConfirmAssignRole" type="button">Asignar Rol</button>
    </div>
  </div>
</div>

<div id="modalDeactivateUser" class="modal fade">
  <button id="btnConfirmDeactivate" type="button">Desactivar</button>
</div>
`;

function getMockUsers() {
  return [
    { id: 1, name: 'Juan Pérez', username: 'jperez', email: 'juan@test.com', role: 'ADMIN', role_name: 'Administrador', is_active: true },
    { id: 2, name: 'María López', username: 'mlopez', email: 'maria@test.com', role: 'CIUDADANO', role_name: 'Ciudadano', is_active: true },
    { id: 3, name: 'Carlos Ruiz', username: 'cruiz', email: 'carlos@test.com', role: 'OPERADOR', role_name: 'Operador', is_active: false },
  ];
}

const MOCK_ROLES = [
  { code: 'ADMIN', name: 'Administrador', description: 'Acceso completo' },
  { code: 'SUPERVISOR', name: 'Supervisor', description: 'Supervisión operativa' },
  { code: 'OPERADOR', name: 'Operador', description: 'Gestión de incidentes' },
  { code: 'CIUDADANO', name: 'Ciudadano', description: 'Reporte de incidentes' },
];

function setupJQueryMock() {
  const modalShow = vi.fn();
  const modalHide = vi.fn();

  globalThis.$ = vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    modal: vi.fn((action) => {
      if (action === 'show') modalShow();
      if (action === 'hide') modalHide();
    }),
    val: vi.fn(),
    text: vi.fn(),
    html: vi.fn(),
    toggle: vi.fn(),
    addClass: vi.fn().mockReturnThis(),
    removeClass: vi.fn().mockReturnThis(),
    hasClass: vi.fn(),
    find: vi.fn().mockReturnThis(),
    closest: vi.fn().mockReturnThis(),
    data: vi.fn(),
    prop: vi.fn(),
    attr: vi.fn().mockReturnThis(),
    trigger: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    empty: vi.fn(),
    append: vi.fn(),
    remove: vi.fn(),
    fadeIn: vi.fn(),
    fadeOut: vi.fn(),
    serialize: vi.fn(() => ''),
    serializeArray: vi.fn(() => []),
  }));
  globalThis.$.ajax = vi.fn();
  globalThis.$.post = vi.fn();

  return { modalShow, modalHide };
}

describe('user-roles-page — integration', () => {
  let modalFns;

  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = DOM_FIXTURE;

    globalThis.renderLayout = vi.fn();
    globalThis.showGlobalAlert = vi.fn();

    modalFns = setupJQueryMock();

    vi.mocked(getUsersAndRoles).mockReset();
    vi.mocked(assignUserRole).mockReset();
    vi.mocked(handleBackendErrors).mockReset();
    vi.mocked(requestBackend).mockReset();
    vi.mocked(showPageLoading).mockReset();
    vi.mocked(hidePageLoading).mockReset();

    vi.mocked(getUsersAndRoles).mockResolvedValue({ users: getMockUsers(), roles: MOCK_ROLES });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete globalThis.renderLayout;
    delete globalThis.showGlobalAlert;
    delete globalThis.$;
  });

  // ── 1. Module exports ───────────────────────────────────────

  describe('module exports', () => {
    it('exports all public functions and constants', async () => {
      const mod = await import('../app/js/modules/users/presentation/user-roles-page.js');
      expect(mod.CITIZEN_ROLE_CODE).toBe('CIUDADANO');
      expect(mod.EXECUTIVE_ROLE_CODES).toBeInstanceOf(Set);
      expect(mod.ROLE_BADGE_COLORS).toBeTypeOf('object');
      expect(mod.ROLE_DESCRIPTIONS).toBeTypeOf('object');
      expect(mod.applyFilters).toBeTypeOf('function');
      expect(mod.renderPaginatedUsers).toBeTypeOf('function');
      expect(mod.renderUsersTable).toBeTypeOf('function');
      expect(mod.getRoleBadgeColor).toBeTypeOf('function');
      expect(mod.getAvatarColor).toBeTypeOf('function');
      expect(mod.setActiveRoleGroupButton).toBeTypeOf('function');
      expect(mod.userMatchesRoleGroup).toBeTypeOf('function');
      expect(mod.getRoleGroup).toBeTypeOf('function');
      expect(mod.getRoleGroupLabel).toBeTypeOf('function');
      expect(mod.normalizeRoleCode).toBeTypeOf('function');
      expect(mod.renderRoleCounters).toBeTypeOf('function');
      expect(mod.renderPagination).toBeTypeOf('function');
      expect(mod.buildPageList).toBeTypeOf('function');
      expect(mod.renderTotalBadge).toBeTypeOf('function');
      expect(mod.initUserRolesPage).toBeTypeOf('function');
      expect(mod.openAssignModal).toBeTypeOf('function');
      expect(mod.bindActions).toBeTypeOf('function');
      expect(mod.bindAssignModal).toBeTypeOf('function');
      expect(mod.bindDeactivateModal).toBeTypeOf('function');
    });
  });

  // ── 2. DOMContentLoaded init ───────────────────────────────

  describe('DOMContentLoaded init', () => {
    it('calls renderLayout and loads users on init', async () => {
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      expect(globalThis.renderLayout).toHaveBeenCalledWith('user-roles');
      expect(getUsersAndRoles).toHaveBeenCalledOnce();
      expect(showPageLoading).toHaveBeenCalled();
      expect(hidePageLoading).toHaveBeenCalled();
    });

    it('renders user rows after init', async () => {
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      const tbody = document.getElementById('user-role-table');
      expect(tbody.innerHTML).toContain('Juan Pérez');
      expect(tbody.innerHTML).toContain('María López');
      expect(tbody.innerHTML).toContain('Carlos Ruiz');
    });

    it('renders total badge and role counters after init', async () => {
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      expect(document.getElementById('user-total-badge').textContent).toBe('3');
      expect(document.getElementById('citizen-count-badge').textContent).toBe('1');
      expect(document.getElementById('executive-count-badge').textContent).toBe('2');
    });

    it('shows empty state when no users returned', async () => {
      vi.mocked(getUsersAndRoles).mockResolvedValue({ users: [], roles: [] });
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      const tbody = document.getElementById('user-role-table');
      expect(tbody.innerHTML).toContain('No se encontraron usuarios');
      expect(document.getElementById('user-total-badge').textContent).toBe('0');
    });

    it('calls handleBackendErrors on API failure', async () => {
      const apiError = new Error('Network error');
      vi.mocked(getUsersAndRoles).mockRejectedValue(apiError);
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      expect(handleBackendErrors).toHaveBeenCalledWith(
        apiError,
        null,
        document.getElementById('access-alert'),
      );
      expect(hidePageLoading).toHaveBeenCalled();
    });
  });

  // ── 3. User list rendering ─────────────────────────────────

  describe('user list rendering', () => {
    it('renders user name, username, email, role and status badge', async () => {
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();
      const html = document.getElementById('user-role-table').innerHTML;

      expect(html).toContain('Juan Pérez');
      expect(html).toContain('@jperez');
      expect(html).toContain('juan@test.com');
      expect(html).toContain('Administrador');
      expect(html).toContain('Roles ejecutivos');
    });

    it('renders action buttons for each user row', async () => {
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      const assignButtons = document.querySelectorAll('.btn-assign-role');
      expect(assignButtons).toHaveLength(6);
      expect(assignButtons[0].dataset.userId).toBe('1');

      const deactivateButtons = document.querySelectorAll('.btn-deactivate-user');
      expect(deactivateButtons).toHaveLength(6);
    });

    it('applies table-inactive class for inactive users', async () => {
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      const rows = document.querySelectorAll('#user-role-table tr');
      expect(rows.length).toBeGreaterThanOrEqual(3);

      const inactiveRow = [...rows].find((r) => r.classList.contains('table-inactive'));
      expect(inactiveRow).toBeTruthy();
      expect(inactiveRow.textContent).toContain('Carlos Ruiz');
    });
  });

  // ── 4. Search and filter ───────────────────────────────────

  describe('search and filter', () => {
    it('filters users by name when typing in search input', async () => {
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      const searchInput = document.getElementById('user-search');
      searchInput.value = 'maría';
      searchInput.dispatchEvent(new Event('input'));

      const tbody = document.getElementById('user-role-table');
      expect(tbody.innerHTML).toContain('María López');
      expect(tbody.innerHTML).not.toContain('Juan Pérez');
    });

    it('filters users by email via search', async () => {
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      const searchInput = document.getElementById('user-search');
      searchInput.value = 'carlos@test.com';
      searchInput.dispatchEvent(new Event('input'));

      const tbody = document.getElementById('user-role-table');
      expect(tbody.innerHTML).toContain('Carlos Ruiz');
      expect(tbody.innerHTML).not.toContain('Juan Pérez');
    });

    it('filters by role group button (executives)', async () => {
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      const execBtn = document.querySelector('[data-role-group="executives"]');
      execBtn.click();

      const tbody = document.getElementById('user-role-table');
      expect(tbody.innerHTML).toContain('Juan Pérez');
      expect(tbody.innerHTML).toContain('Carlos Ruiz');
      expect(tbody.innerHTML).not.toContain('María López');
    });

    it('filters by citizens group', async () => {
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      document.querySelector('[data-role-group="citizens"]').click();

      const tbody = document.getElementById('user-role-table');
      expect(tbody.innerHTML).toContain('María López');
      expect(tbody.innerHTML).not.toContain('Juan Pérez');
    });

    it('clear button resets search and role group', async () => {
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      document.querySelector('[data-role-group="executives"]').click();
      document.getElementById('clear-user-search').click();

      const tbody = document.getElementById('user-role-table');
      expect(tbody.innerHTML).toContain('Juan Pérez');
      expect(tbody.innerHTML).toContain('María López');
      expect(tbody.innerHTML).toContain('Carlos Ruiz');

      const allBtn = document.querySelector('[data-role-group="all"]');
      expect(allBtn.classList.contains('active')).toBe(true);
    });

    it('shows empty message when no users match filter', async () => {
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      const searchInput = document.getElementById('user-search');
      searchInput.value = 'xyznotfound';
      searchInput.dispatchEvent(new Event('input'));

      const tbody = document.getElementById('user-role-table');
      expect(tbody.innerHTML).toContain('No se encontraron');
    });
  });

  // ── 5. Role assignment ──────────────────────────────────────

  describe('role assignment', () => {
    it('opens assign role modal when clicking assign button', async () => {
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      document.querySelector('.btn-assign-role[data-user-id="1"]').click();

      expect(document.getElementById('assignUserName').textContent).toBe('Juan Pérez');
      expect(document.getElementById('assignUserEmail').textContent).toBe('juan@test.com');
      expect(document.getElementById('assignUserAvatar').textContent).toBe('J');
      expect(document.getElementById('assignCurrentRoleBadge').textContent).toBe('Administrador');
      expect(modalFns.modalShow).toHaveBeenCalled();
    });

    it('populates role select with optgroups', async () => {
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      document.querySelector('.btn-assign-role[data-user-id="1"]').click();

      const select = document.getElementById('assignRoleSelect');
      const options = select.querySelectorAll('option');
      const optgroups = select.querySelectorAll('optgroup');

      expect(select.querySelector('option[value=""]')).toBeTruthy();
      expect(optgroups.length).toBeGreaterThanOrEqual(2);
      const roleNames = [...options].map((o) => o.textContent);
      expect(roleNames).toContain('Administrador');
      expect(roleNames).toContain('Ciudadano');
    });

    it('preselects current role in the dropdown', async () => {
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      document.querySelector('.btn-assign-role[data-user-id="1"]').click();

      const selectedOption = [...document.querySelectorAll('#assignRoleSelect option')].find((o) => o.selected);
      expect(selectedOption).toBeTruthy();
      expect(selectedOption.value).toBe('ADMIN');
    });

    it('shows role description on select change (known role)', async () => {
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      document.querySelector('.btn-assign-role[data-user-id="1"]').click();

      const select = document.getElementById('assignRoleSelect');
      select.value = 'SUPERVISOR';
      select.dispatchEvent(new Event('change'));

      const desc = document.getElementById('assignRoleDescription');
      expect(desc.innerHTML).toContain('operativa');
    });

    it('shows default description when selecting empty option', async () => {
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      document.querySelector('.btn-assign-role[data-user-id="1"]').click();

      const select = document.getElementById('assignRoleSelect');
      select.value = '';
      select.dispatchEvent(new Event('change'));

      expect(document.getElementById('assignRoleDescription').textContent).toContain('Selecciona un rol');
    });

    it('disables confirm button when no role selected', async () => {
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      document.querySelector('.btn-assign-role[data-user-id="1"]').click();

      const select = document.getElementById('assignRoleSelect');
      const confirmBtn = document.getElementById('btnConfirmAssignRole');

      select.value = '';
      select.dispatchEvent(new Event('change'));
      expect(confirmBtn.disabled).toBe(true);

      select.value = 'OPERADOR';
      select.dispatchEvent(new Event('change'));
      expect(confirmBtn.disabled).toBe(false);
    });

    it('calls assignUserRole on confirm and shows success', async () => {
      vi.mocked(assignUserRole).mockResolvedValue({
        data: { role_name: 'Operador', role: 'OPERADOR' },
      });
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      document.querySelector('.btn-assign-role[data-user-id="1"]').click();

      const select = document.getElementById('assignRoleSelect');
      select.value = 'OPERADOR';
      select.dispatchEvent(new Event('change'));

      document.getElementById('btnConfirmAssignRole').click();

      await vi.waitFor(() => {
        expect(assignUserRole).toHaveBeenCalledWith(1, 'OPERADOR');
      });

      await vi.waitFor(() => {
        expect(globalThis.showGlobalAlert).toHaveBeenCalledWith(
          'Rol asignado correctamente',
          'success',
        );
      });

      expect(modalFns.modalHide).toHaveBeenCalled();
    });

    it('updates user role in table after successful assignment', async () => {
      vi.mocked(assignUserRole).mockResolvedValue({
        data: { role_name: 'Operador', role: 'OPERADOR' },
      });
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      document.querySelector('.btn-assign-role[data-user-id="1"]').click();

      const select = document.getElementById('assignRoleSelect');
      select.value = 'OPERADOR';
      select.dispatchEvent(new Event('change'));
      document.getElementById('btnConfirmAssignRole').click();

      await vi.waitFor(() => {
        const tbody = document.getElementById('user-role-table');
        expect(tbody.innerHTML).toContain('Operador');
      });
    });

    it('calls handleBackendErrors on role assignment failure', async () => {
      const apiError = new Error('Forbidden');
      apiError.status = 403;
      vi.mocked(assignUserRole).mockRejectedValue(apiError);

      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      document.querySelector('.btn-assign-role[data-user-id="1"]').click();

      const select = document.getElementById('assignRoleSelect');
      select.value = 'OPERADOR';
      select.dispatchEvent(new Event('change'));
      document.getElementById('btnConfirmAssignRole').click();

      await vi.waitFor(() => {
        expect(handleBackendErrors).toHaveBeenCalledWith(
          apiError,
          null,
          document.getElementById('access-alert'),
        );
      });
    });
  });

  // ── 6. Deactivate user ──────────────────────────────────────

  describe('deactivate user', () => {
    it('opens deactivate modal on deactivate button click', async () => {
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      document.querySelector('.btn-deactivate-user[data-user-id="1"]').click();

      expect(document.getElementById('btnConfirmDeactivate').dataset.userId).toBe('1');
      expect(modalFns.modalShow).toHaveBeenCalled();
    });

    it('calls requestBackend on confirm deactivation', async () => {
      vi.mocked(requestBackend).mockResolvedValue({ success: true });

      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      document.querySelector('.btn-deactivate-user[data-user-id="2"]').click();
      document.getElementById('btnConfirmDeactivate').click();

      await vi.waitFor(() => {
        expect(requestBackend).toHaveBeenCalledWith('/users/2', { method: 'DELETE' });
      });

      await vi.waitFor(() => {
        expect(globalThis.showGlobalAlert).toHaveBeenCalledWith(
          'Usuario desactivado exitosamente',
          'success',
        );
      });

      expect(modalFns.modalHide).toHaveBeenCalled();
    });

    it('removes user from table after successful deactivation', async () => {
      vi.mocked(requestBackend).mockResolvedValue({ success: true });

      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      document.querySelector('.btn-deactivate-user[data-user-id="2"]').click();
      document.getElementById('btnConfirmDeactivate').click();

      await vi.waitFor(() => {
        const tbody = document.getElementById('user-role-table');
        expect(tbody.innerHTML).not.toContain('María López');
      });

      expect(document.getElementById('citizen-count-badge').textContent).toBe('0');
      expect(document.getElementById('user-total-badge').textContent).toBe('2');
    });

    it('calls handleBackendErrors on deactivation failure', async () => {
      const apiError = new Error('Server error');
      apiError.status = 500;
      vi.mocked(requestBackend).mockRejectedValue(apiError);

      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      document.querySelector('.btn-deactivate-user[data-user-id="1"]').click();
      document.getElementById('btnConfirmDeactivate').click();

      await vi.waitFor(() => {
        expect(handleBackendErrors).toHaveBeenCalledWith(
          apiError,
          null,
          document.getElementById('access-alert'),
        );
      });

      expect(modalFns.modalHide).toHaveBeenCalled();
    });
  });

  // ── 7. Pagination ───────────────────────────────────────────

  describe('pagination', () => {
    it('shows pagination summary with correct counts', async () => {
      const manyUsers = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        name: `User ${i + 1}`,
        username: `user${i + 1}`,
        email: `user${i + 1}@test.com`,
        role: i < 10 ? 'ADMIN' : 'CIUDADANO',
        role_name: i < 10 ? 'Admin' : 'Ciudadano',
        is_active: true,
      }));
      vi.mocked(getUsersAndRoles).mockResolvedValue({ users: manyUsers, roles: MOCK_ROLES });

      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      const summary = document.getElementById('users-pagination-summary');
      expect(summary.textContent).toMatch(/Mostrando 1–10 de 25 usuarios/);

      const pagination = document.getElementById('users-pagination');
      expect(pagination.innerHTML).toContain('page-item');
      expect(pagination.innerHTML).toContain('data-page="2"');
      expect(pagination.innerHTML).toContain('data-page="3"');
    });

    it('clears pagination when all users fit on one page', async () => {
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      const pagination = document.getElementById('users-pagination');
      expect(pagination.innerHTML).toBe('');
    });

    it('navigates to next page on pagination click', async () => {
      const manyUsers = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        name: `User ${i + 1}`,
        username: `user${i + 1}`,
        email: `user${i + 1}@test.com`,
        role: 'CIUDADANO',
        role_name: 'Ciudadano',
        is_active: true,
      }));
      vi.mocked(getUsersAndRoles).mockResolvedValue({ users: manyUsers, roles: MOCK_ROLES });

      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      const page2Btn = document.querySelector('[data-page="2"]');
      page2Btn.click();

      const tbody = document.getElementById('user-role-table');
      expect(tbody.innerHTML).toContain('User 11');
      expect(tbody.innerHTML).toContain('User 20');
      expect([...tbody.querySelectorAll('tr')]).toHaveLength(10);
    });
  });

  // ── 7b. Per page selector ───────────────────────────────────

  describe('per page selector', () => {
    it('changes items per page and re-renders', async () => {
      const manyUsers = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        name: `User ${i + 1}`,
        username: `user${i + 1}`,
        email: `user${i + 1}@test.com`,
        role: 'CIUDADANO',
        role_name: 'Ciudadano',
        is_active: true,
      }));
      vi.mocked(getUsersAndRoles).mockResolvedValue({ users: manyUsers, roles: MOCK_ROLES });

      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      const perPageSelect = document.getElementById('users-per-page');
      perPageSelect.value = '25';
      perPageSelect.dispatchEvent(new Event('change'));

      const tbody = document.getElementById('user-role-table');
      expect(tbody.innerHTML).toContain('User 25');
      expect(tbody.innerHTML).toContain('User 1');
    });
  });

  // ── 8. Role management - badge colors ───────────────────────

  describe('role badge colors', () => {
    it('renders correct badge class for each role', async () => {
      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      const html = document.getElementById('user-role-table').innerHTML;
      expect(html).toContain('badge-danger');
      expect(html).toContain('badge-secondary');
      expect(html).toContain('badge-success');
    });
  });

  // ── 8b. Role counters ───────────────────────────────────────

  describe('role counters', () => {
    it('recalculates counters after changing role via assignment', async () => {
      vi.mocked(assignUserRole).mockResolvedValue({
        data: { role_name: 'Ciudadano', role: 'CIUDADANO' },
      });

      const { initUserRolesPage } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      await initUserRolesPage();

      expect(document.getElementById('executive-count-badge').textContent).toBe('2');
      expect(document.getElementById('citizen-count-badge').textContent).toBe('1');

      document.querySelector('.btn-assign-role[data-user-id="1"]').click();
      document.getElementById('assignRoleSelect').value = 'CIUDADANO';
      document.getElementById('assignRoleSelect').dispatchEvent(new Event('change'));
      document.getElementById('btnConfirmAssignRole').click();

      await vi.waitFor(() => {
        expect(document.getElementById('executive-count-badge').textContent).toBe('1');
        expect(document.getElementById('citizen-count-badge').textContent).toBe('2');
      });
    });
  });
});
