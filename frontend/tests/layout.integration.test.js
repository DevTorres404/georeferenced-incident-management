import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock functions — must be before vi.mock calls
// ---------------------------------------------------------------------------
const { mockBackend, mockRaw, mockSubscribe } = vi.hoisted(() => ({
  mockBackend: vi.fn(),
  mockRaw: vi.fn(),
  mockSubscribe: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Global jQuery mock — data() must be on fn AND return null for pushmenu check
// ---------------------------------------------------------------------------
const mockJQueryObj = {
  on: vi.fn().mockReturnThis(),
  off: vi.fn().mockReturnThis(),
  val: vi.fn(),
  text: vi.fn(),
  html: vi.fn(),
  toggle: vi.fn(),
  addClass: vi.fn().mockReturnThis(),
  removeClass: vi.fn().mockReturnThis(),
  hasClass: vi.fn(),
  find: vi.fn().mockReturnThis(),
  closest: vi.fn().mockReturnThis(),
  data: vi.fn(() => null),
  prop: vi.fn(),
  attr: vi.fn(),
  trigger: vi.fn(),
  show: vi.fn(),
  hide: vi.fn(),
  empty: vi.fn(),
  append: vi.fn(),
  remove: vi.fn(),
  fadeIn: vi.fn(),
  fadeOut: vi.fn(),
  slideToggle: vi.fn(),
  css: vi.fn(),
  width: vi.fn(() => 1024),
};
function createMockJQuery() {
  const jq = vi.fn(() => mockJQueryObj);
  jq.fn = {};
  jq.ajax = vi.fn();
  jq.data = vi.fn(() => null);
  return jq;
}
globalThis.jQuery = createMockJQuery();
globalThis.$ = globalThis.jQuery;

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('../app/js/layout/sidebar.js', () => ({
  buildSidebarHtml: vi.fn(() => `
    <ul class="nav nav-pills nav-sidebar flex-column">
      <li class="nav-item has-treeview menu-open">
        <a href="#"
           class="nav-link active"
           data-menu-toggle="true">
          <i class="fas fa-th"></i><p>Espacio de trabajo</p>
        </a>
        <ul class="nav nav-treeview">
          <li class="nav-item">
            <a href="dashboard.html" class="nav-link">
              <i class="fas fa-chart-pie"></i><p>Dashboard</p>
            </a>
          </li>
        </ul>
      </li>
      <li class="nav-item">
        <a href="incidents.html" class="nav-link">
          <i class="fas fa-list"></i><p>Incidencias</p>
        </a>
      </li>
    </ul>
  `),
}));

vi.mock('../app/js/layout/topbar.js', () => ({
  buildTopbarHtml: vi.fn(() => `
    <a data-widget="pushmenu" href="#"><i class="fas fa-bars"></i></a>
    <div class="navbar-nav ml-auto">
      <div class="dropdown" id="userDropdown">
        <a class="dropdown-toggle" href="#"
           id="userMenuButton" data-toggle="dropdown">
          <img src="avatar.jpg" class="user-avatar" alt="avatar">
          <span>Test User</span>
        </a>
        <div class="dropdown-menu dropdown-menu-right">
          <h6 class="dropdown-header">Test User</h6>
          <a class="dropdown-item" href="profile.html">
            <i class="fas fa-user"></i> Mi perfil
          </a>
          <div class="dropdown-divider"></div>
          <button class="dropdown-item" id="btnLogout">
            <i class="fas fa-sign-out-alt"></i> Cerrar sesión
          </button>
        </div>
      </div>
    </div>
    <div id="notificationsDropdown" style="display:none">
      <span id="navbarNotificationsBadge" style="display:none">0</span>
      <span id="navbarNotificationsBadgeCount" style="display:none">0</span>
      <div id="navbarNotificationsList"></div>
      <button id="btnMarkAllRead" style="display:none">Marcar todas</button>
    </div>
  `),
}));

vi.mock('../app/js/layout/nav-items.js', () => ({
  NAV_ITEMS: [
    {
      id: 'workspace', label: 'Espacio de trabajo', icon: 'fas fa-th',
      children: [
        { id: 'dashboard', label: 'Dashboard', icon: 'fas fa-chart-pie', route: 'dashboard.html', permission: 'dashboard.view' },
        { id: 'incidents', label: 'Incidencias', icon: 'fas fa-list', route: 'incidents.html', permission: 'incidents.view' },
      ],
    },
    {
      id: 'admin', label: 'Administración', icon: 'fas fa-cog',
      children: [
        { id: 'users', label: 'Usuarios', icon: 'fas fa-users', route: 'users.html', permission: null },
      ],
    },
  ],
  PAGE_ACCESS: {
    dashboard: { permission: 'dashboard.view' },
    incidents: { permission: 'incidents.view' },
    profile: { permission: 'profile.view' },
  },
  ROLES: { ADMIN: 'ADMIN' },
}));

vi.mock('../app/js/infrastructure/backend-client.js', () => ({
  requestBackend: mockBackend,
  requestRaw: mockRaw,
}));

vi.mock('../app/js/core/auth-session.js', () => ({
  clearSession: vi.fn(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    localStorage.removeItem('auth_expires_at');
  }),
}));

vi.mock('../app/js/modules/notifications/application/subscribe-notifications.usecase.js', () => ({
  subscribeToUserNotifications: mockSubscribe,
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
function setupAuthSession(opts = {}) {
  localStorage.setItem('auth_token', opts.token ?? 'mock-token');
  localStorage.setItem('user_data', JSON.stringify(opts.user ?? {
    id: 1,
    nombre: 'Test',
    apellido: 'User',
    name: 'Test User',
    email: 'test@example.com',
    roles: [{ name: 'Operator' }],
    permissions: ['dashboard.view', 'incidents.view', 'notifications.view'],
    two_factor_enabled: true,
  }));
  localStorage.setItem('auth_expires_at', opts.expiresAt ?? new Date(Date.now() + 86400000).toISOString());
}

function setupLayoutDOM() {
  document.body.innerHTML = `
    <div class="content-wrapper"></div>
    <nav id="mainNavbar"></nav>
    <aside id="mainSidebar" class="main-sidebar">
      <div class="sidebar"></div>
    </aside>
    <div id="alertaGlobal" style="display:none"></div>
    <div id="pageLoader" hidden class="d-none"></div>
    <button id="btnDarkModeToggle"><i class="fas fa-moon"></i></button>
  `;
}

function configureSuccessfulBackend(userData) {
  mockBackend.mockImplementation((path) => {
    if (path === '/me') return Promise.resolve({ user: userData ?? JSON.parse(localStorage.getItem('user_data')) });
    if (path === '/navigation/menu') return Promise.resolve({ data: [] });
    if (path === '/notifications/unread/count') return Promise.resolve({ count: 0 });
    if (path === '/notifications?per_page=5') return Promise.resolve({ data: [] });
    if (path === '/logout') return Promise.resolve({});
    return Promise.resolve(null);
  });
  mockSubscribe.mockResolvedValue({ cleanup: vi.fn() });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('layout.js — Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '';
    vi.clearAllMocks();
    document.__clickListeners = [];
    document.addEventListener = ((orig) => (type, handler, ...rest) => {
      if (type === 'click') document.__clickListeners.push(handler);
      return orig(type, handler, ...rest);
    })(document.addEventListener.bind(document));
    globalThis.location = {
      pathname: '/html/dashboard.html',
      origin: 'http://localhost',
      href: 'http://localhost/html/dashboard.html',
      replace: vi.fn(),
      assign: vi.fn(),
    };
    globalThis.matchMedia = vi.fn(() => ({ matches: true, media: '', onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
    delete globalThis.SGIDomUtils;
    delete globalThis.SGINavigationStore;
    delete globalThis.SGIProtectedPageGuard;
    delete globalThis.renderLayout;
    delete globalThis.showGlobalAlert;
    delete globalThis.requestBackend;
    delete globalThis.mutateBackend;
    vi.resetModules();
  });

  afterEach(() => {
    const clickHandlers = document.__clickListeners || [];
    for (const fn of clickHandlers) {
      document.removeEventListener('click', fn);
    }
    document.__clickListeners = [];
    delete globalThis.SGIDomUtils;
    delete globalThis.SGINavigationStore;
    delete globalThis.SGIProtectedPageGuard;
    delete globalThis.renderLayout;
    delete globalThis.showGlobalAlert;
    delete globalThis.requestBackend;
    delete globalThis.mutateBackend;
  });

  // ---------------------------------------------------------------
  // 1. Module exports
  // ---------------------------------------------------------------
  describe('1. Module exports', () => {
    it('all expected exported functions exist and are functions', async () => {
      const mod = await import('../app/js/layout/layout.js');
      const expected = [
        'canAccessItem', 'escapeHtml', 'filterAuthorizedMenuItems',
        'flattenMenuItems', 'formatRelativeTime', 'formatRoleLabel',
        'formatUserRoles', 'getNotificationIconClass', 'getNotificationTypeClass',
        'html', 'isSessionExpired', 'loadNavbarNotifications',
        'logoutManually', 'normalizeMobileSidebar', 'normalizePermissionCode',
        'normalizeRoleCode', 'refreshSessionUserOrRedirect', 'renderLayout',
        'safeUrl', 'scheduleInactivityLogout', 'showGlobalAlert',
        'showLayoutMessage', 'startInactivityWatcher',
      ];
      for (const name of expected) {
        expect(mod[name]).toBeDefined(`${name} should be exported`);
        expect(typeof mod[name]).toBe('function');
      }
    });
  });

  // ---------------------------------------------------------------
  // 2. DOMContentLoaded init — accessibility setup
  // ---------------------------------------------------------------
  describe('2. DOMContentLoaded init', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div class="content-wrapper"></div>
        <div id="alertaGlobal"></div>
        <button data-card-widget="collapse"></button>
        <button data-card-widget="remove"></button>
      `;
    });

    it('inserts skip-to-content link', async () => {
      await import('../app/js/layout/layout.js');
      document.dispatchEvent(new Event('DOMContentLoaded'));
      const skipLink = document.querySelector('a[href="#mainContent"]');
      expect(skipLink).toBeTruthy();
      expect(skipLink.textContent).toBe('Saltar al contenido principal');
    });

    it('sets role="main" and id on content-wrapper', async () => {
      await import('../app/js/layout/layout.js');
      document.dispatchEvent(new Event('DOMContentLoaded'));
      const cw = document.querySelector('.content-wrapper');
      expect(cw.getAttribute('role')).toBe('main');
      expect(cw.id).toBe('mainContent');
    });

    it('adds aria-live to alertaGlobal', async () => {
      await import('../app/js/layout/layout.js');
      document.dispatchEvent(new Event('DOMContentLoaded'));
      const alerta = document.getElementById('alertaGlobal');
      expect(alerta.getAttribute('aria-live')).toBe('polite');
    });

    it('adds aria-label to card-widget buttons', async () => {
      await import('../app/js/layout/layout.js');
      document.dispatchEvent(new Event('DOMContentLoaded'));
      const collapse = document.querySelector('[data-card-widget="collapse"]');
      const remove = document.querySelector('[data-card-widget="remove"]');
      expect(collapse.getAttribute('aria-label')).toBe('Colapsar sección');
      expect(remove.getAttribute('aria-label')).toBe('Cerrar sección');
    });
  });

  // ---------------------------------------------------------------
  // 3. Dark mode toggle — single test to avoid accumulated document
  //    click listeners across resetModules
  // ---------------------------------------------------------------
  describe('3. Dark mode toggle', () => {
    function clickDarkModeToggle() {
      document.getElementById('btnDarkModeToggle')
        .dispatchEvent(new Event('click', { bubbles: true }));
    }

    it('comprehensive dark mode behavior', async () => {
      document.body.innerHTML = `
        <button id="btnDarkModeToggle"><i class="fas fa-moon"></i></button>
        <nav id="mainNavbar" class="navbar-white navbar-light"></nav>
      `;

      await import('../app/js/layout/layout.js');
      const btn = document.getElementById('btnDarkModeToggle');
      const navbar = document.getElementById('mainNavbar');
      const icon = document.querySelector('#btnDarkModeToggle i');

      expect(document.body.classList.contains('dark-mode')).toBe(false);
      expect(icon.className).toBe('fas fa-moon');
      expect(navbar.classList.contains('navbar-white')).toBe(true);
      expect(localStorage.getItem('SGI_darkMode')).toBeNull();

      clickDarkModeToggle();
      expect(document.body.classList.contains('dark-mode')).toBe(true);
      expect(icon.className).toBe('fas fa-sun');
      expect(navbar.classList.contains('navbar-dark')).toBe(true);
      expect(navbar.classList.contains('navbar-white')).toBe(false);
      expect(localStorage.getItem('SGI_darkMode')).toBe('true');

      clickDarkModeToggle();
      expect(document.body.classList.contains('dark-mode')).toBe(false);
      expect(icon.className).toBe('fas fa-moon');
      expect(navbar.classList.contains('navbar-white')).toBe(true);
      expect(navbar.classList.contains('navbar-dark')).toBe(false);
      expect(localStorage.getItem('SGI_darkMode')).toBe('false');
    });

    it('restores saved dark mode on module init', async () => {
      localStorage.setItem('SGI_darkMode', 'true');
      document.body.innerHTML = `
        <button id="btnDarkModeToggle"><i class="fas fa-moon"></i></button>
        <nav id="mainNavbar" class="navbar-white navbar-light"></nav>
      `;
      await import('../app/js/layout/layout.js');
      expect(document.body.classList.contains('dark-mode')).toBe(true);
      const navbar = document.getElementById('mainNavbar');
      expect(navbar.classList.contains('navbar-dark')).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // 4. renderLayout — full lifecycle
  // ---------------------------------------------------------------
  describe('4. renderLayout — full lifecycle', () => {
    beforeEach(() => {
      setupAuthSession();
      setupLayoutDOM();
      configureSuccessfulBackend();
    });

    it('injects navbar HTML into #mainNavbar', async () => {
      await import('../app/js/layout/layout.js');
      await globalThis.renderLayout('dashboard');
      const navbar = document.getElementById('mainNavbar');
      expect(navbar.innerHTML).toContain('data-widget="pushmenu"');
      expect(navbar.innerHTML).toContain('btnLogout');
    });

    it('injects sidebar HTML into #mainSidebar', async () => {
      await import('../app/js/layout/layout.js');
      await globalThis.renderLayout('dashboard');
      const sidebar = document.getElementById('mainSidebar');
      expect(sidebar.innerHTML).toContain('nav-link');
      expect(sidebar.innerHTML).toContain('Incidencias');
    });

    it('sets up SGINavigationStore and SGIDomUtils', async () => {
      const mod = await import('../app/js/layout/layout.js');
      await mod.renderLayout('dashboard');
      expect(globalThis.SGIDomUtils).toBeDefined();
      expect(typeof globalThis.SGIDomUtils.delegateEvent).toBe('function');
      expect(globalThis.SGINavigationStore).toBeDefined();
      expect(globalThis.SGINavigationStore.menuItems).toBeDefined();
    });

    it('loads backend navigation and falls back to local', async () => {
      await import('../app/js/layout/layout.js');
      await globalThis.renderLayout('dashboard');
      expect(mockBackend).toHaveBeenCalledWith('/navigation/menu', { noCache: true });
      expect(mockBackend).toHaveBeenCalledWith('/me', { noCache: true });
    });

    it('redirects to login when no authenticated session', async () => {
      localStorage.clear();
      await import('../app/js/layout/layout.js');
      await globalThis.renderLayout('dashboard');
      expect(globalThis.location.replace).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // 5. Sidebar toggle — pushmenu fallback
  // ---------------------------------------------------------------
  describe('5. Sidebar toggle', () => {
    it('fallback toggle on [data-widget="pushmenu"] click changes sidebar class', async () => {
      // renderLayout creates pushmenu handlers — need a full run
      setupAuthSession();
      document.body.innerHTML = `
        <nav id="mainNavbar"></nav>
        <aside id="mainSidebar" class="main-sidebar">
          <div class="sidebar"></div>
        </aside>
        <div id="pageLoader" hidden class="d-none"></div>
      `;
      configureSuccessfulBackend();
      await import('../app/js/layout/layout.js');
      await globalThis.renderLayout('dashboard');

      const btn = document.querySelector('[data-widget="pushmenu"]');
      expect(btn).toBeTruthy();

      btn.click();
      expect(document.body.classList.contains('sidebar-collapse')).toBe(true);
      btn.click();
      expect(document.body.classList.contains('sidebar-collapse')).toBe(false);
    });

    it('sidebar menu item click toggles active state on treeview', async () => {
      setupAuthSession();
      document.body.innerHTML = `
        <nav id="mainNavbar"></nav>
        <aside id="mainSidebar" class="main-sidebar">
          <div class="sidebar"></div>
        </aside>
        <div id="pageLoader" hidden class="d-none"></div>
      `;
      configureSuccessfulBackend();
      await import('../app/js/layout/layout.js');
      await globalThis.renderLayout('dashboard');

      const treeview = document.querySelector('.nav-item.has-treeview');
      expect(treeview.classList.contains('menu-open')).toBe(true);

      const toggleLink = treeview.querySelector('a.nav-link[data-menu-toggle="true"]');
      toggleLink.click();
      expect(treeview.classList.contains('menu-open')).toBe(false);
      expect(toggleLink.getAttribute('aria-expanded')).toBe('false');

      toggleLink.click();
      expect(treeview.classList.contains('menu-open')).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // 6. User menu — logout
  // ---------------------------------------------------------------
  describe('6. User menu — logout', () => {
    it('clicking #btnLogout calls logoutManually which clears session and redirects', async () => {
      setupAuthSession();
      setupLayoutDOM();
      configureSuccessfulBackend();

      await import('../app/js/layout/layout.js');
      await globalThis.renderLayout('dashboard');

      const { clearSession } = await import('../app/js/core/auth-session.js');

      document.getElementById('btnLogout')
        .dispatchEvent(new Event('click', { bubbles: true }));

      // logoutManually is async — flush microtasks to await completion
      await new Promise(r => setTimeout(r, 0));

      expect(clearSession).toHaveBeenCalled();
      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(globalThis.location.replace).toHaveBeenCalled();
    });

    it('redirects to index.html when on html/ subpath', async () => {
      setupAuthSession();
      setupLayoutDOM();
      configureSuccessfulBackend();

      const { logoutManually } = await import('../app/js/layout/layout.js');
      await logoutManually();

      expect(globalThis.location.replace).toHaveBeenCalledWith('../index.html');
    });
  });

  // ---------------------------------------------------------------
  // 7. Responsive layout — normalizeMobileSidebar
  // ---------------------------------------------------------------
  describe('7. Responsive layout — normalizeMobileSidebar', () => {
    it('closes sidebar on mobile viewport', async () => {
      document.body.innerHTML = `
        <div id="sidebar-overlay" class="show" style="display:block"></div>
      `;
      document.body.classList.add('sidebar-open');

      const { normalizeMobileSidebar } = await import('../app/js/layout/layout.js');
      normalizeMobileSidebar();

      expect(document.body.classList.contains('sidebar-open')).toBe(false);
      const overlay = document.getElementById('sidebar-overlay');
      expect(overlay.classList.contains('show')).toBe(false);
    });

    it('sidebar overlay gets display removed', async () => {
      document.body.innerHTML = `
        <div id="sidebar-overlay" class="show" style="display:block"></div>
      `;
      const { normalizeMobileSidebar } = await import('../app/js/layout/layout.js');
      normalizeMobileSidebar();

      const overlay = document.getElementById('sidebar-overlay');
      expect(overlay.style.display).toBe('');
    });
  });

  // ---------------------------------------------------------------
  // 8. showGlobalAlert — toast stack
  // ---------------------------------------------------------------
  describe('8. showGlobalAlert — toast', () => {
    it('creates toast stack and appends toast element', async () => {
      const { showGlobalAlert } = await import('../app/js/layout/layout.js');
      showGlobalAlert('Test message', 'success');
      const stack = document.querySelector('.sgi-toast-stack');
      expect(stack).toBeTruthy();
      expect(stack.children.length).toBe(1);
      expect(stack.querySelector('.sgi-toast-message').textContent).toBe('Test message');
    });

    it('reuses existing toast stack', async () => {
      const stack = document.createElement('div');
      stack.className = 'sgi-toast-stack';
      document.body.appendChild(stack);
      const { showGlobalAlert } = await import('../app/js/layout/layout.js');
      showGlobalAlert('Msg 1', 'info');
      showGlobalAlert('Msg 2', 'danger');
      expect(stack.children.length).toBe(2);
    });

    it('shows correct icon per type', async () => {
      const { showGlobalAlert } = await import('../app/js/layout/layout.js');
      showGlobalAlert('Success', 'success');
      expect(document.querySelector('.sgi-toast-icon i').className).toContain('fa-check-circle');
    });

    it('adds progress bar with transition duration', async () => {
      const { showGlobalAlert } = await import('../app/js/layout/layout.js');
      showGlobalAlert('Loading', 'info', '', 3000);
      const fill = document.querySelector('.sgi-toast-progress-fill');
      expect(fill).toBeTruthy();
      expect(fill.style.transitionDuration).toBe('3000ms');
    });

    it('sets globalThis.showGlobalAlert for external use', async () => {
      await import('../app/js/layout/layout.js');
      expect(typeof globalThis.showGlobalAlert).toBe('function');
    });
  });

  // ---------------------------------------------------------------
  // 9. Global event listeners
  // ---------------------------------------------------------------
  describe('9. Global event listeners', () => {
    it('sgi:unauthorized clears session and redirects to login', async () => {
      await import('../app/js/layout/layout.js');
      globalThis.dispatchEvent(new CustomEvent('sgi:unauthorized'));

      const { clearSession } = await import('../app/js/core/auth-session.js');
      expect(clearSession).toHaveBeenCalled();
      expect(globalThis.location.replace).toHaveBeenCalled();
    });

    it('sgi:validate-session calls refreshSessionUserOrRedirect which hits /me', async () => {
      setupAuthSession();
      mockBackend.mockResolvedValue(null);

      await import('../app/js/layout/layout.js');
      globalThis.dispatchEvent(new CustomEvent('sgi:validate-session'));

      expect(mockBackend).toHaveBeenCalledWith('/me', { noCache: true });
    });
  });

  // ---------------------------------------------------------------
  // 10. showLayoutMessage
  // ---------------------------------------------------------------
  describe('10. showLayoutMessage', () => {
    it('shows message in alertaGlobal and hides after timeout', async () => {
      vi.useFakeTimers();
      document.body.innerHTML = '<div id="alertaGlobal" style="display:none"></div>';
      const { showLayoutMessage } = await import('../app/js/layout/layout.js');

      showLayoutMessage('Hello world', 'success');
      const alerta = document.getElementById('alertaGlobal');
      expect(alerta.textContent).toBe('Hello world');
      expect(alerta.style.display).toBe('block');
      expect(alerta.className).toContain('alert-success');

      vi.advanceTimersByTime(3500);
      expect(alerta.style.display).toBe('none');
      vi.useRealTimers();
    });

    it('does nothing if alertaGlobal is missing', async () => {
      const { showLayoutMessage } = await import('../app/js/layout/layout.js');
      expect(() => showLayoutMessage('test')).not.toThrow();
    });
  });
});
