/**
 * ============================================================
 * LAYOUT COMPARTIDO: Navbar + Sidebar
 * Inyectado dinámicamente para mantener DRY
 * ============================================================
 */
'use strict';
window.SGINavigationStore = {
  NAV_STATE_KEY: 'SGI_nav_state',
  menuItems: [
    { id: 'dashboard', label: 'Panel principal', icon: 'fa-tachometer-alt', href: 'dashboard.html', permission: 'dashboard.view' },
    { id: 'incidents', label: 'Incidencias', icon: 'fa-list-alt', href: 'incidents.html', permission: 'incidents.view' },
    { id: 'incident-create', label: 'Nueva incidencia', icon: 'fa-plus-circle', href: 'incident-create.html', permission: 'incidents.create' },
    { id: 'role-permissions', label: 'Roles y permisos', icon: 'fa-user-shield', href: 'role-permissions.html', permission: 'users.manage_roles' },
    { id: 'user-roles', label: 'Usuarios y roles', icon: 'fa-user-tag', href: 'user-roles.html', permission: 'users.manage_roles' },
    { id: 'reports', label: 'Reportes', icon: 'fa-chart-bar', href: 'reports.html', permission: 'reportes.ver' }
  ],
  getAuthorizedMenu: function () {
    return this.menuItems.filter((item) => {
      if (hasRole('CIUDADANO') && item.id === 'dashboard') return false;
      return !item.permission || hasPermission(item.permission);
    });
  },
  startNavigation: function (href) {
    sessionStorage.setItem(this.NAV_STATE_KEY, JSON.stringify({ inProgress: true, target: href, timestamp: Date.now() }));
  },
  isNavigationInProgress: function () {
    const stateStr = sessionStorage.getItem(this.NAV_STATE_KEY);
    if (!stateStr) return false;
    try {
      const state = JSON.parse(stateStr);
      if (state && state.inProgress) {
        if (Date.now() - state.timestamp > 5000) {
          sessionStorage.removeItem(this.NAV_STATE_KEY);
          return false;
        }
        return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  },
  clearNavigation: function () {
    sessionStorage.removeItem(this.NAV_STATE_KEY);
  }
};
const AUTH_KEYS = {
  token: 'auth_token',
  user: 'user_data',
  expiresAt: 'auth_expires_at',
  lastActivityAt: 'auth_last_activity_at',
};
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000; // Cierre por inactividad: 2 minutos sin interaccion del usuario
const ACTIVITY_EVENTS = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart', 'pointerdown'];
let inactivityTimer = null;
let lastActivityWrite = 0;
function readSessionUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEYS.user);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
/**
 * Verifica si el usuario en sesión tiene el permiso indicado.
 */
function hasPermission(code) {
  const user = readSessionUser();
  if (!user) return false;
  // 1. El administrador tiene acceso a todas las pantallas
  if (Array.isArray(user.roles)) {
    for (const role of user.roles) {
      if (normalizeCode(role) === 'ADMIN') {
        return true;
      }
    }
  }
  // 2. Verificar permisos a nivel de usuario (estructura de la API)
  if (Array.isArray(user.permissions)) {
    if (user.permissions.some(p => normalizeCode(p) === code)) {
      return true;
    }
  }
  // 3. Fallback (por si los permisos vienen anidados en los roles)
  if (Array.isArray(user.roles)) {
    for (const role of user.roles) {
      if (Array.isArray(role.permissions)) {
        if (role.permissions.some(p => normalizeCode(p) === code)) {
          return true;
        }
      }
    }
  }
  return false;
}
function hasRole(roleCode) {
  const user = readSessionUser();
  if (!user || !Array.isArray(user.roles)) return false;
  return user.roles.some((role) => normalizeCode(role) === roleCode);
}
function normalizeCode(value) {
  if (typeof value === 'string') return value;
  return value?.codigo || value?.code || '';
}
function formatRoleLabel(role) {
  if (typeof role === 'string') return role;
  return role?.name || role?.nombre || role?.codigo || role?.code || '';
}
function formatUserRoles(user) {
  const roles = Array.isArray(user?.roles) ? user.roles.map(formatRoleLabel).filter(Boolean) : [];
  return roles.length ? roles.join(', ') : 'Sin rol asignado';
}
function getAvailableMenus() {
  return window.SGINavigationStore.getAuthorizedMenu();
}
function getDefaultPageForSession() {
  if (hasRole('CIUDADANO') && hasPermission('incidents.create')) {
    return 'incident-create.html';
  }
  // Orden de candidatos: se retorna la primera página que el usuario puede ver.
  // Si ningún permiso coincide, se retorna null para mostrar acceso denegado.
  const candidates = [
    ['dashboard.view', 'dashboard.html'],
    ['incidents.create', 'incident-create.html'],
    ['incidents.view', 'incidents.html'],
    ['reportes.ver', 'reports.html'],
    ['users.manage_roles', 'role-permissions.html'],
  ];
  const match = candidates.find(([permission]) => hasPermission(permission));
  return match ? match[1] : null;
}
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function safeUrl(url) {
  if (!url) return '#';
  const strUrl = String(url).trim();
  const lowerUrl = strUrl.toLowerCase();
  if (lowerUrl.startsWith('javascript:') || lowerUrl.startsWith('data:') || lowerUrl.startsWith('vbscript:') || lowerUrl.startsWith('file:')) {
    return '#';
  }
  try {
    const parsed = new URL(strUrl, window.location.origin);
    if (['http:', 'https:'].includes(parsed.protocol)) return strUrl;
    return '#';
  } catch (e) {
    if (/^[a-zA-Z0-9]+:/.test(strUrl)) return '#';
    return strUrl;
  }
}
function html(strings, ...values) {
  return strings.reduce((result, string, i) => {
    let val = values[i];
    if (i >= values.length) {
      val = '';
    } else if (Array.isArray(val)) {
      val = val.join('');
    } else {
      val = escapeHtml(val);
    }
    return result + string + val;
  }, '');
}
function isSessionExpired() {
  const expiresAt = new Date(localStorage.getItem(AUTH_KEYS.expiresAt) || '').getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}
function clearSession() {
  localStorage.removeItem(AUTH_KEYS.token);
  localStorage.removeItem(AUTH_KEYS.user);
  localStorage.removeItem(AUTH_KEYS.expiresAt);
  localStorage.removeItem(AUTH_KEYS.lastActivityAt);
}
function getLoginPath() {
  return window.location.pathname.includes('/html/') ? '../index.html' : 'index.html';
}
function redirectToLogin() {
  window.location.href = getLoginPath();
}
function ensureSessionOrRedirect() {
  const token = localStorage.getItem(AUTH_KEYS.token);
  if (!token || isSessionExpired()) {
    clearSession();
    redirectToLogin();
    return null;
  }
  return readSessionUser();
}
function getLastActivityAt() {
  const timestamp = Number(localStorage.getItem(AUTH_KEYS.lastActivityAt));
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
}
function requestBackendLogout() {
  const token = localStorage.getItem(AUTH_KEYS.token);
  if (!token) return;
  if (window.SGIGApi?.requestRaw) {
    window.SGIGApi.requestRaw('/logout', { method: 'POST' }).catch(() => {
      // El frontend limpia la sesion aunque el backend no responda.
    });
    return;
  }
  const apiUrl = window.SGI_API_URL || `${window.location.origin}/api`;
  fetch(`${apiUrl}/logout`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  }).catch(() => {
    // El frontend limpia la sesión aunque el backend no responda.
  });
}
async function requestBackend(path, options = {}) {
  const token = localStorage.getItem(AUTH_KEYS.token);
  if (!token) return null;
  if (window.SGIGApi?.request) {
    try {
      return await window.SGIGApi.request(path, options);
    } catch {
      return null;
    }
  }
  const apiUrl = window.SGI_API_URL || `${window.location.origin}/api`;
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) return null;
  return response.json();
}
async function mutateBackend(path, options = {}) {
  if (window.SGIGApi?.request) {
    return window.SGIGApi.request(path, options);
  }
  const result = await requestBackend(path, options);
  if (!result) {
    throw new Error('No se pudo completar la solicitud.');
  }
  return result;
}
function logoutFromInactivity() {
  requestBackendLogout();
  clearSession();
  redirectToLogin();
}
function scheduleInactivityLogout() {
  window.clearTimeout(inactivityTimer);
  const inactiveFor = Date.now() - getLastActivityAt();
  const remaining = INACTIVITY_TIMEOUT_MS - inactiveFor;
  if (remaining <= 0) {
    logoutFromInactivity();
    return;
  }
  inactivityTimer = window.setTimeout(logoutFromInactivity, remaining);
}
function recordActivity() {
  const now = Date.now();
  if (now - lastActivityWrite > 1000) {
    localStorage.setItem(AUTH_KEYS.lastActivityAt, String(now));
    lastActivityWrite = now;
  }
  scheduleInactivityLogout();
}
function startInactivityWatcher() {
  if (!localStorage.getItem(AUTH_KEYS.lastActivityAt)) {
    localStorage.setItem(AUTH_KEYS.lastActivityAt, String(Date.now()));
  }
  ACTIVITY_EVENTS.forEach((eventName) => {
    window.addEventListener(eventName, recordActivity, { passive: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      scheduleInactivityLogout();
    }
  });
  window.addEventListener('storage', (event) => {
    if (event.key === AUTH_KEYS.lastActivityAt) {
      scheduleInactivityLogout();
    }
  });
  scheduleInactivityLogout();
}
function logoutManually() {
  requestBackendLogout();
  clearSession();
  redirectToLogin();
}
function scheduleSessionExpiryLogout() {
  const expiresAt = new Date(localStorage.getItem(AUTH_KEYS.expiresAt) || '').getTime();
  if (!Number.isFinite(expiresAt)) {
    return;
  }
  const delay = expiresAt - Date.now();
  if (delay <= 0) {
    clearSession();
    redirectToLogin();
    return;
  }
  window.setTimeout(() => {
    clearSession();
    redirectToLogin();
  }, delay);
}
async function loadNavbarNotifications(forceRefresh = false) {
  const CACHE_KEY = 'SGI_notifications_cache';
  const CACHE_TTL = 60000;
  if (!forceRefresh) {
    const cachedStr = sessionStorage.getItem(CACHE_KEY);
    if (cachedStr) {
      try {
        const cached = JSON.parse(cachedStr);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
          renderBetterNavbarNotifications(cached.count, cached.items);
          return;
        }
      } catch (e) { }
    }
  }
  try {
    const [countResponse, notificationsResponse] = await Promise.all([
      requestBackend('/notifications/unread/count'),
      requestBackend('/notifications?per_page=5'),
    ]);
    const count = Number(countResponse?.count || 0);
    const notifications = Array.isArray(notificationsResponse?.data) ? notificationsResponse.data : [];
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      count,
      items: notifications
    }));
    renderBetterNavbarNotifications(count, notifications);
  } catch (e) {
    renderBetterNavbarNotifications(0, []);
  }
}
function renderBetterNavbarNotifications(count, notifications) {
  const badge = document.getElementById('navbarNotificationsBadge');
  const header = document.getElementById('navbarNotificationsHeader');
  const list = document.getElementById('navbarNotificationsList');
  if (badge) {
    badge.textContent = String(count);
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }
  if (header) {
    header.textContent = count === 1 ? '1 notificación pendiente' : `${count} notificaciones pendientes`;
  }
  if (!list) return;
  if (!notifications.length) {
    list.innerHTML = html`
      <span class="dropdown-item text-muted">
        <i class="far fa-bell-slash mr-2"></i>Sin notificaciones
      </span>`;
    return;
  }
  list.innerHTML = html`${notifications.map((notification) => `
    <button type="button" class="dropdown-item text-left border-0 bg-transparent js-notification-item" data-notification-id="${escapeHtml(notification.id)}">
      <i class="fas ${escapeHtml(getNotificationIcon(notification.type))} mr-2 ${escapeHtml(getNotificationColor(notification.type))}"></i>
      <span>${escapeHtml(notification.title || notification.message || 'Notificación')}</span>
      <span class="float-right text-muted text-sm">${escapeHtml(formatRelativeTime(notification.created_at || notification.createdAt))}</span>
    </button>
    <div class="dropdown-divider"></div>`)}`;
  if (window.SGIDomUtils?.delegateEvent) {
    window.SGIDomUtils.delegateEvent(list, '.js-notification-item', 'click', async (e, item) => {
      const id = item.dataset.notificationId;
      if (!id) return;
      try {
        await mutateBackend(`/notifications/${id}/read`, { method: 'PATCH' });
        await loadNavbarNotifications(true);
      } catch {
        showLayoutMessage('No se pudo marcar la notificacion como leida.', 'danger');
      }
    });
  }
}
function getNotificationIcon(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('success') || value.includes('resolved')) return 'fa-check-circle';
  if (value.includes('warning')) return 'fa-clock';
  if (value.includes('error') || value.includes('danger')) return 'fa-exclamation-circle';
  return 'fa-info-circle';
}
function getNotificationColor(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('success') || value.includes('resolved')) return 'text-success';
  if (value.includes('warning')) return 'text-warning';
  if (value.includes('error') || value.includes('danger')) return 'text-danger';
  return 'text-info';
}
function formatRelativeTime(value) {
  const timestamp = new Date(value || '').getTime();
  if (!Number.isFinite(timestamp)) return '';
  const minutes = Math.max(Math.floor((Date.now() - timestamp) / 60000), 0);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  return `hace ${Math.floor(hours / 24)}d`;
}
function showLayoutMessage(message, type = 'success') {
  const alert = document.getElementById('alertaGlobal');
  if (!alert) return;
  alert.className = `alert alert-${type} shadow-sm`;
  alert.textContent = message;
  alert.style.display = 'block';
  window.setTimeout(() => {
    alert.style.display = 'none';
  }, 3500);
}
/**
 * Alerta global unificada con icono y botón de cierre.
 * Se expone como window.showGlobalAlert para que backend-client.js y otros módulos la usen.
 */
function showGlobalAlert(message, type = 'success') {
  const target = document.getElementById('alertaGlobal');
  if (!target) {
    console.warn('[SGI] showGlobalAlert: elemento #alertaGlobal no encontrado.');
    return;
  }
  const icons = {
    success: 'check-circle',
    danger: 'times-circle',
    warning: 'exclamation-triangle',
    info: 'info-circle',
  };
  target.className = `alert alert-${type} alert-dismissible fade show`;
  target.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'} mr-2"></i>${escapeHtml(message)}<button type="button" class="close" data-dismiss="alert" aria-label="Cerrar"><span aria-hidden="true">&times;</span></button>`;
  target.style.display = 'block';
  window.setTimeout(() => {
    target.style.display = 'none';
  }, 5000);
}
// Exposición global para que backend-client.js y otros módulos externos puedan usarla
window.showGlobalAlert = showGlobalAlert;


async function renderLayout(activeId = '') {
  const user = ensureSessionOrRedirect();
  if (!user) return;

  if (hasRole('ADMIN') && !user.two_factor_enabled) {
    redirectToLogin();
    return;
  }

  // Block citizen from dashboard/admin routes
  if (hasRole('CIUDADANO') && (activeId === 'dashboard' || activeId === 'user-roles' || activeId === 'role-permissions')) {
    window.location.href = 'incident-create.html';
    return;
  }
  // Ruteo de Accesos por Permisos
  const menuItems = window.SGINavigationStore.getAuthorizedMenu();
  const currentItem = window.SGINavigationStore.menuItems.find(i => i.id === activeId);
  if (currentItem && currentItem.permission && !hasPermission(currentItem.permission)) {
    if (!hasRole('ADMIN')) {
      const defaultPage = getDefaultPageForSession();
      if (!defaultPage) {
        showLayoutMessage('No tienes una pantalla disponible para tu rol.', 'danger');
        return;
      }
      window.location.href = defaultPage;
      return;
    }
  }
  // Navbar
  const userFirstName = user.nombre || user.first_name || 'Usuario';
  const userLastName = user.apellido || user.last_name || '';
  const userFullName = `${userFirstName} ${userLastName}`.trim();
  const userInitial = escapeHtml(userFirstName).charAt(0).toUpperCase();
  const userEmail = user.email || '';
  const userRole = formatUserRoles(user);
  const navbarHtml = `
    <ul class="navbar-nav">
      <li class="nav-item">
        <a class="nav-link" data-widget="pushmenu" href="#" role="button"><i class="fas fa-bars"></i></a>
      </li>
    </ul>
    <ul class="navbar-nav ml-auto">
      <li class="nav-item dropdown" id="notificationsDropdown">
        <a class="nav-link" data-toggle="dropdown" href="#">
          <i class="far fa-bell"></i>
          <span class="badge badge-warning navbar-badge" id="navbarNotificationsBadge" style="display:none;">0</span>
        </a>
        <div class="dropdown-menu dropdown-menu-lg dropdown-menu-right">
          <span class="dropdown-header" id="navbarNotificationsHeader">0 notificaciones</span>
          <div class="dropdown-divider"></div>
          <div id="navbarNotificationsList" style="max-height: 300px; overflow-y: auto;"></div>
          <div class="dropdown-divider"></div>
          <a href="#" id="btnMarkAllRead" class="dropdown-item dropdown-footer text-primary">Marcar todas como leídas</a>
        </div>
      </li>
      <li class="nav-item dropdown user-menu">
        <a href="#" class="nav-link dropdown-toggle d-flex align-items-center sgi-user-toggle" data-toggle="dropdown" aria-label="Menú de usuario">
          <span class="sgi-user-avatar-sm">${userInitial}</span>
          <span class="d-none d-md-inline ml-2 font-weight-semibold">${escapeHtml(userFirstName)}</span>
        </a>
        <div class="dropdown-menu dropdown-menu-right shadow border-0 rounded-lg sgi-user-dropdown">
          <div class="sgi-user-dropdown-header">
            <span class="sgi-user-avatar-lg">${userInitial}</span>
            <div class="sgi-user-dropdown-meta">
              <h6 title="${escapeHtml(userFullName)}">${escapeHtml(userFullName)}</h6>
              <small title="${escapeHtml(userEmail)}">${escapeHtml(userEmail)}</small>
              <span class="badge badge-light mt-2">${escapeHtml(userRole)}</span>
            </div>
          </div>
          <div class="dropdown-divider my-2"></div>
          <a href="profile.html" class="dropdown-item rounded px-3 py-2 text-dark">
            <i class="fas fa-user-circle mr-2 text-primary"></i> Mi perfil
          </a>
          <a href="#" id="btnLogout" class="dropdown-item rounded px-3 py-2 text-danger">
            <i class="fas fa-sign-out-alt mr-2"></i> Cerrar sesión
          </a>
        </div>
      </li>
    </ul>
  `;
  const navEl = document.getElementById('mainNavbar');
  if (navEl) navEl.innerHTML = navbarHtml;
  // Sidebar
  const sidebarHtml = `
    <div class="sidebar">
      <div class="sgi-sidebar-section-label">Navegación</div>
      <nav class="mt-2">
        <ul class="nav nav-pills nav-sidebar flex-column" data-widget="treeview" role="menu" data-accordion="false">
          ${menuItems.map(item => `
            <li class="nav-item">
              <a href="${item.href}" class="nav-link ${item.id === activeId ? 'active' : ''}">
                <i class="nav-icon fas ${item.icon}"></i>
                <p>${item.label}</p>
              </a>
            </li>
          `).join('')}
        </ul>
      </nav>
    </div>
  `;
  const sidebarEl = document.getElementById('mainSidebar');
  if (sidebarEl) {
    sidebarEl.innerHTML = sidebarHtml;
    
    // Interceptor de navegación para prevenir múltiples clics y recargas redundantes
    sidebarEl.addEventListener('click', function(e) {
      const link = e.target.closest('a.nav-link');
      if (!link) return;
      
      const href = link.getAttribute('href');
      if (!href || href === '#' || href.startsWith('javascript:')) return;
      
      e.preventDefault();
      
      // Evitar recargar la misma página si ya estamos en ella
      const currentPath = window.location.pathname.split('/').pop();
      if (href === currentPath) {
        return;
      }
      
      // Evitar múltiples clics si ya se está navegando
      if (window.SGINavigationStore && window.SGINavigationStore.isNavigationInProgress()) {
        return;
      }
      
      if (window.SGINavigationStore) {
        window.SGINavigationStore.startNavigation(href);
      }
      
      // Mostrar el loader global antes de que el navegador cambie de página
      const loader = document.getElementById('pageLoader');
      if (loader) {
        loader.removeAttribute('hidden');
        loader.classList.remove('d-none');
        loader.style.display = 'flex';
      }
      
      // Ejecutar la navegación
      window.location.href = href;
    });
  }
  // Bind events
  document.getElementById('btnLogout')?.addEventListener('click', logoutManually);
  
  // Interceptar clics en el logo de la aplicación
  document.querySelectorAll('.brand-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      
      if (window.SGINavigationStore && window.SGINavigationStore.isNavigationInProgress()) {
        return;
      }

      // Obtener el primer menú disponible según los permisos del usuario
      const availableMenus = getAvailableMenus(user);
      if (!availableMenus || availableMenus.length === 0) {
        return;
      }
      
      const targetHref = availableMenus[0].href;
      
      // Si ya estamos en esa página, no hacer nada
      if (window.location.pathname.endsWith(targetHref)) {
        return;
      }
      
      if (window.SGINavigationStore) {
        window.SGINavigationStore.startNavigation(targetHref);
      }
      
      const loader = document.getElementById('pageLoader');
      if (loader) {
        loader.removeAttribute('hidden');
        loader.classList.remove('d-none');
        loader.style.display = 'flex';
      }
      
      window.location.href = targetHref;
    });
  });

  document.getElementById('btnMarkAllRead')?.addEventListener('click', async () => {
    try {
      await mutateBackend('/notifications/mark-all-read', { method: 'PATCH' });
      await loadNavbarNotifications(true);
    } catch { }
  });
  startInactivityWatcher();
  loadNavbarNotifications(true);
  if (window.SGINavigationStore) {
    window.SGINavigationStore.clearNavigation();
  }
}
window.renderLayout = renderLayout;
