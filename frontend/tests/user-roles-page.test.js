import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

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

describe('user-roles-page.js — constants', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('CITIZEN_ROLE_CODE is CIUDADANO', async () => {
    const { CITIZEN_ROLE_CODE } = await import('../app/js/modules/users/presentation/user-roles-page.js');
    expect(CITIZEN_ROLE_CODE).toBe('CIUDADANO');
  });

  it('EXECUTIVE_ROLE_CODES contains expected roles', async () => {
    const { EXECUTIVE_ROLE_CODES } = await import('../app/js/modules/users/presentation/user-roles-page.js');
    expect(EXECUTIVE_ROLE_CODES.has('ADMIN')).toBe(true);
    expect(EXECUTIVE_ROLE_CODES.has('SUPERVISOR')).toBe(true);
    expect(EXECUTIVE_ROLE_CODES.has('OPERADOR')).toBe(true);
  });

  it('ROLE_BADGE_COLORS maps all roles', async () => {
    const { ROLE_BADGE_COLORS } = await import('../app/js/modules/users/presentation/user-roles-page.js');
    expect(ROLE_BADGE_COLORS.ADMIN).toBe('danger');
    expect(ROLE_BADGE_COLORS.CIUDADANO).toBe('secondary');
  });

  it('ROLE_DESCRIPTIONS contains descriptions', async () => {
    const { ROLE_DESCRIPTIONS } = await import('../app/js/modules/users/presentation/user-roles-page.js');
    expect(ROLE_DESCRIPTIONS.ADMIN).toContain('completo');
  });
});

describe('user-roles-page.js — pure functions', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('normalizeRoleCode', () => {
    it('trims and uppercases', async () => {
      const { normalizeRoleCode } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      expect(normalizeRoleCode(' admin ')).toBe('ADMIN');
    });
  });

  describe('getRoleGroup', () => {
    it('returns citizens for CIUDADANO', async () => {
      const { getRoleGroup } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      expect(getRoleGroup('CIUDADANO')).toBe('citizens');
    });

    it('returns executives for ADMIN', async () => {
      const { getRoleGroup } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      expect(getRoleGroup('ADMIN')).toBe('executives');
    });

    it('returns others for unknown', async () => {
      const { getRoleGroup } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      expect(getRoleGroup('CUSTOM')).toBe('others');
    });
  });

  describe('getRoleGroupLabel', () => {
    it('returns label for each group', async () => {
      const { getRoleGroupLabel } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      expect(getRoleGroupLabel('CIUDADANO')).toContain('Ciudadano');
      expect(getRoleGroupLabel('ADMIN')).toContain('ejecutivo');
    });
  });

  describe('userMatchesRoleGroup', () => {
    it('matches all for "all" group', async () => {
      const { userMatchesRoleGroup } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      expect(userMatchesRoleGroup({ role: 'ADMIN' }, 'all')).toBe(true);
    });

    it('matches citizens group', async () => {
      const { userMatchesRoleGroup } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      expect(userMatchesRoleGroup({ role: 'CIUDADANO' }, 'citizens')).toBe(true);
      expect(userMatchesRoleGroup({ role: 'ADMIN' }, 'citizens')).toBe(false);
    });
  });

  describe('getRoleBadgeColor', () => {
    it('returns known color for ADMIN', async () => {
      const { getRoleBadgeColor } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      expect(getRoleBadgeColor('ADMIN')).toBe('danger');
    });

    it('returns default for unknown role', async () => {
      const { getRoleBadgeColor } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      expect(getRoleBadgeColor('UNKNOWN')).toBe('dark');
    });
  });

  describe('getAvatarColor', () => {
    it('returns consistent color for same name', async () => {
      const { getAvatarColor } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      expect(getAvatarColor('Juan')).toBe(getAvatarColor('Juan'));
    });
  });

  describe('buildPageList', () => {
    it('returns all pages when <= 7', async () => {
      const { buildPageList } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      expect(buildPageList(1, 5)).toEqual(['1', '2', '3', '4', '5']);
    });

    it('includes ellipsis for large page counts', async () => {
      const { buildPageList } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      const pages = buildPageList(5, 20);
      expect(pages).toContain('ellipsis');
      expect(pages[0]).toBe('1');
      expect(pages[pages.length - 1]).toBe('20');
    });
  });

  describe('applyFilters', () => {
    it('filters by lowercase search term matching name', async () => {
      const { applyFilters } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      const state = {
        users: [
          { name: 'Juan Pérez', role: 'CIUDADANO' },
          { name: 'María López', role: 'ADMIN' },
        ],
        roles: [],
        filteredUsers: [],
        page: 1,
        perPage: 10,
        searchTerm: 'juan',
        roleGroup: 'all',
      };
      applyFilters(state);
      expect(state.filteredUsers).toHaveLength(1);
      expect(state.filteredUsers[0].name).toBe('Juan Pérez');
    });
  });
});

describe('user-roles-page.js — DOM rendering', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.$ = vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      modal: vi.fn().mockReturnThis(),
    }));
    document.body.innerHTML = `
      <table><tbody id="user-role-table"></tbody></table>
      <div id="users-pagination-summary"></div>
      <ul id="users-pagination" class="pagination"></ul>
      <span id="user-total-badge"></span>
      <span id="citizen-count-badge"></span>
      <span id="executive-count-badge"></span>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('renderUsersTable', () => {
    it('renders empty state when no users', async () => {
      const { renderUsersTable } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      renderUsersTable([], []);
      const tbody = document.getElementById('user-role-table');
      expect(tbody.innerHTML).toContain('No se encontraron');
    });

    it('renders rows for users', async () => {
      const { renderUsersTable } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      const users = [{ id: 1, name: 'Juan', username: 'juan', email: 'j@j.com', role: 'CIUDADANO', role_name: 'Ciudadano' }];
      renderUsersTable(users, []);
      const tbody = document.getElementById('user-role-table');
      expect(tbody.innerHTML).toContain('Juan');
    });
  });

  describe('renderPagination', () => {
    it('renders pagination when more than 1 page', async () => {
      const { renderPagination } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      const state = { page: 1, filteredUsers: [], users: [], searchTerm: '', roleGroup: 'all', perPage: 10 };
      renderPagination(state, 25, 3, 0, 10);
      const pagination = document.getElementById('users-pagination');
      expect(pagination.innerHTML).toContain('page-item');
    });
  });

  describe('setActiveRoleGroupButton', () => {
    it('toggles active class on buttons', async () => {
      document.body.innerHTML = '<button data-role-group="all"></button><button data-role-group="executives"></button>';
      const { setActiveRoleGroupButton } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      setActiveRoleGroupButton('executives');
      const buttons = document.querySelectorAll('[data-role-group]');
      expect(buttons[0].classList.contains('active')).toBe(false);
      expect(buttons[1].classList.contains('active')).toBe(true);
    });
  });

  describe('renderTotalBadge', () => {
    it('sets badge text to total count', async () => {
      const { renderTotalBadge } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      renderTotalBadge(42, 10);
      expect(document.getElementById('user-total-badge').textContent).toBe('42');
    });
  });

  describe('renderRoleCounters', () => {
    it('updates counters for each group', async () => {
      const { renderRoleCounters } = await import('../app/js/modules/users/presentation/user-roles-page.js');
      const users = [
        { role: 'CIUDADANO' },
        { role: 'ADMIN' },
        { role: 'SUPERVISOR' },
        { role: 'CIUDADANO' },
      ];
      renderRoleCounters(users);
      expect(document.getElementById('citizen-count-badge').textContent).toBe('2');
      expect(document.getElementById('executive-count-badge').textContent).toBe('2');
    });
  });
});
