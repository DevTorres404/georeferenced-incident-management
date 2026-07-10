import { buildSidebarHtml } from './sidebar.js?v=24';
import { NAV_ITEMS, PAGE_ACCESS, ROLES } from './nav-items.js?v=4';
import { buildTopbarHtml } from './topbar.js?v=20';
import { requestBackend as apiRequestBackend, requestRaw as apiRequestRaw } from '../core/api-client.js?v=20';
import { subscribeToUserNotifications } from '../modules/notifications/application/subscribe-notifications.usecase.js?v=20';

/**
 * ============================================================
 * LAYOUT COMPARTIDO: Navbar + Sidebar
 * Inyectado dinámicamente para mantener DRY
 * ============================================================
 */
window.SGIDomUtils = {
  delegateEvent(parent, selector, eventType, handler) {
    parent.addEventListener(eventType, function (e) {
      const target = e.target.closest(selector);
      if (target && parent.contains(target)) {
        handler.call(target, e, target);
      }
    });
  }
};
window.SGINavigationStore = {
  NAV_STATE_KEY: 'SGI_nav_state',
  menuItems: NAV_ITEMS,
  pageAccess: PAGE_ACCESS,
  authorizedMenuItems: null,
  getAuthorizedMenu: function () {
    return this.authorizedMenuItems || filterAuthorizedMenuItems(this.menuItems);
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
  const expected = normalizePermissionCode(code);
  const user = readSessionUser();
  if (!user || !expected) return false;
  // 1. Verificar permisos a nivel de usuario (estructura de la API)
  if (Array.isArray(user.permissions)) {
    if (user.permissions.some(p => normalizePermissionCode(p) === expected)) {
      return true;
    }
  }
  // 2. Fallback (por si los permisos vienen anidados en los roles)
  if (Array.isArray(user.roles)) {
    for (const role of user.roles) {
      if (Array.isArray(role.permissions)) {
        if (role.permissions.some(p => normalizePermissionCode(p) === expected)) {
          return true;
        }
      }
    }
  }
  return false;
}
function hasRole(roleCode, sessionUser = readSessionUser()) {
  const user = sessionUser;
  if (!user || !Array.isArray(user.roles)) return false;
  const expected = normalizeRoleCode(roleCode);
  return user.roles.some((role) => normalizeRoleCode(role) === expected);
}
function normalizeRoleCode(value) {
  const raw = typeof value === 'string' ? value : value?.codigo || value?.code || value?.name || value?.nombre || '';
  return String(raw || '').trim().toUpperCase();
}
function normalizePermissionCode(value) {
  const raw = typeof value === 'string' ? value : value?.codigo || value?.code || '';
  return String(raw || '').trim().toLowerCase();
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
  return flattenMenuItems(window.SGINavigationStore.getAuthorizedMenu());
}
function getPagePermission(activeId) {
  return window.SGINavigationStore.pageAccess?.[activeId]?.permission || null;
}
function getDefaultPageForSession() {
  // Orden de candidatos: se retorna la primera página que el usuario puede ver.
  // Si ningún permiso coincide, se retorna null para mostrar acceso denegado.
  const firstMenu = getAvailableMenus().find((item) => item.route || item.href);
  return firstMenu?.route || firstMenu?.href || null;
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
  apiRequestRaw('/logout', { method: 'POST' }).catch(() => {
    // El frontend limpia la sesion aunque el backend no responda.
  });
}
async function requestBackend(path, options = {}) {
  const token = localStorage.getItem(AUTH_KEYS.token);
  if (!token) return null;
  try {
    return await apiRequestBackend(path, options);
  } catch {
    return null;
  }
}
function updateSessionUser(user) {
  if (!user) return null;
  localStorage.setItem(AUTH_KEYS.user, JSON.stringify(user));
  return user;
}
async function refreshSessionUserOrRedirect() {
  const response = await requestBackend('/me');
  if (!response?.user) {
    clearSession();
    redirectToLogin();
    return null;
  }

  return updateSessionUser(response.user);
}
function normalizeNavigationItems(items = []) {
  return items
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: item.id || item.code,
      code: item.code || item.id,
      label: item.label,
      icon: item.icon,
      route: item.route || item.href || null,
      href: item.href || item.route || null,
      permission: item.permission || item.permission_code || null,
      children: Array.isArray(item.children) ? normalizeNavigationItems(item.children) : [],
    }))
    .filter((item) => item.id && item.label);
}
async function loadAuthorizedNavigation() {
  const fallbackMenu = filterAuthorizedMenuItems(window.SGINavigationStore.menuItems);

  try {
    const response = await requestBackend('/navigation/menu', { noCache: true });
    const items = normalizeNavigationItems(Array.isArray(response?.data) ? response.data : []);

    if (items.length) {
      window.SGINavigationStore.authorizedMenuItems = items;
      return items;
    }
  } catch {
    // Si el endpoint aún no está migrado, mantenemos la navegación local filtrada.
  }

  window.SGINavigationStore.authorizedMenuItems = fallbackMenu;
  return fallbackMenu;
}
async function mutateBackend(path, options = {}) {
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

function startRealtimeNotifications(user) {
  subscribeToUserNotifications(user, async (notification) => {
    sessionStorage.removeItem('SGI_notifications_cache');
    await loadNavbarNotifications(true);
    if (notification?.title && window.showGlobalAlert) {
      window.showGlobalAlert(notification.title, 'info');
    }
  }).catch(() => {
    // Si el WebSocket no está disponible, la API REST sigue funcionando como respaldo.
  });
}

function renderBetterNavbarNotifications(count, notifications) {
  const badge = document.getElementById('navbarNotificationsBadge');
  const badgeCount = document.getElementById('navbarNotificationsBadgeCount');
  const list = document.getElementById('navbarNotificationsList');
  const btnMarkAll = document.getElementById('btnMarkAllRead');

  if (badge) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }
  if (badgeCount) {
    badgeCount.textContent = String(count);
    badgeCount.style.display = count > 0 ? 'inline-block' : 'none';
  }
  if (btnMarkAll) {
    btnMarkAll.style.display = count > 0 ? 'block' : 'none';
  }

  if (!list) return;

  if (!notifications.length) {
    list.innerHTML = `
      <div class="sgi-notif-empty">
        <i class="far fa-bell-slash"></i>
        <span>Sin notificaciones nuevas</span>
      </div>`;
    return;
  }

  list.innerHTML = notifications.map((notification) => {
    const isUnread = !notification.is_read && !notification.isRead;
    const iconClass = getNotificationIconClass(notification.type);
    const typeClass = getNotificationTypeClass(notification.type);
    const time = formatRelativeTime(notification.created_at || notification.createdAt);

    return `
      <button type="button" class="sgi-notif-item ${isUnread ? 'is-unread' : ''} js-notification-item"
              data-notification-id="${escapeHtml(String(notification.id))}"
              data-incident-id="${escapeHtml(String(notification.incident_id ?? notification.incidentId ?? ''))}">
        <div class="sgi-notif-icon ${typeClass}">
          <i class="fas ${iconClass}"></i>
        </div>
        <div class="sgi-notif-body">
          <span class="sgi-notif-title">${escapeHtml(notification.title || 'Notificación')}</span>
          <span class="sgi-notif-message">${escapeHtml(notification.message || '')}</span>
        </div>
        <span class="sgi-notif-time">${escapeHtml(time)}</span>
      </button>`;
  }).join('');

  if (window.SGIDomUtils?.delegateEvent) {
    window.SGIDomUtils.delegateEvent(list, '.js-notification-item', 'click', async (e, item) => {
      const id = item.dataset.notificationId;
      const incidentId = item.dataset.incidentId;
      if (!id) return;
      try {
        await mutateBackend(`/notifications/${id}/read`, { method: 'PATCH' });
        item.style.transition = 'opacity 0.25s ease, max-height 0.25s ease, padding 0.25s ease';
        item.style.opacity = '0';
        item.style.maxHeight = '0';
        item.style.paddingTop = '0';
        item.style.paddingBottom = '0';
        item.style.overflow = 'hidden';
        setTimeout(() => item.remove(), 260);
        const currentCount = Math.max((parseInt(badge?.textContent || '0', 10) || 1) - 1, 0);
        if (badge) {
          badge.textContent = currentCount > 99 ? '99+' : String(currentCount);
          badge.style.display = currentCount > 0 ? 'inline-block' : 'none';
        }
        if (badgeCount) {
          badgeCount.textContent = String(currentCount);
          badgeCount.style.display = currentCount > 0 ? 'inline-block' : 'none';
        }
        if (btnMarkAll) {
          btnMarkAll.style.display = currentCount > 0 ? 'block' : 'none';
        }
        if (currentCount === 0 && list) {
          list.innerHTML = `
            <div class="sgi-notif-empty">
              <i class="far fa-bell-slash"></i>
              <span>Sin notificaciones nuevas</span>
            </div>`;
        }
        if (incidentId) {
          window.location.href = `/html/incident-detail.html?id=${incidentId}`;
        }
      } catch {
        if (window.showGlobalAlert) {
          window.showGlobalAlert('No se pudo marcar la notificación como leída.', 'danger');
        }
      }
    });
  }
}
function getNotificationIconClass(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('assigned') || value.includes('asign')) return 'fa-user-check';
  if (value.includes('status') || value.includes('cambio')) return 'fa-sync-alt';
  if (value.includes('closed') || value.includes('resolved') || value.includes('resuelta')) return 'fa-check-circle';
  if (value.includes('comment') || value.includes('comentario')) return 'fa-comment-dots';
  if (value.includes('overdue') || value.includes('vencida')) return 'fa-exclamation-triangle';
  if (value.includes('warning')) return 'fa-clock';
  if (value.includes('error') || value.includes('danger')) return 'fa-times-circle';
  return 'fa-info-circle';
}

function getNotificationTypeClass(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('assigned') || value.includes('asign')) return 'type-assigned';
  if (value.includes('closed') || value.includes('resolved') || value.includes('resuelta')) return 'type-closed';
  if (value.includes('status') || value.includes('cambio')) return 'type-info';
  if (value.includes('comment') || value.includes('comentario')) return 'type-info';
  if (value.includes('overdue') || value.includes('vencida')) return 'type-warning';
  if (value.includes('warning')) return 'type-warning';
  if (value.includes('error') || value.includes('danger')) return 'type-danger';
  if (value.includes('success')) return 'type-success';
  return 'type-info';
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
 * Toast premium unificado con icono, barra de progreso y cierre.
 * Se expone como window.showGlobalAlert para que backend-client.js y otros modulos la usen.
 */
function showGlobalAlert(message, type = 'success', title = '') {
  let stack = document.querySelector('.sgi-toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'sgi-toast-stack';
    document.body.appendChild(stack);
  }

  const icons = {
    success: 'fa-check-circle',
    danger: 'fa-times-circle',
    warning: 'fa-exclamation-triangle',
    info: 'fa-info-circle',
  };

  const titles = {
    success: 'Operación exitosa',
    danger: 'Error',
    warning: 'Atención',
    info: 'Notificación',
  };

  const toast = document.createElement('div');
  toast.className = 'sgi-toast';
  toast.innerHTML = `
    <div class="sgi-toast-icon toast-${type}">
      <i class="fas ${icons[type] || 'fa-info-circle'}"></i>
    </div>
    <div class="sgi-toast-body">
      <span class="sgi-toast-title">${escapeHtml(title || titles[type] || 'Notificación')}</span>
      <span class="sgi-toast-message">${escapeHtml(message)}</span>
    </div>
    <button type="button" class="sgi-toast-close" aria-label="Cerrar">
      <i class="fas fa-times"></i>
    </button>
    <div class="sgi-toast-progress">
      <div class="sgi-toast-progress-fill" style="width:100%;"></div>
    </div>
  `;

  stack.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add('is-visible');
    });
  });

  const duration = 5000;
  const progressFill = toast.querySelector('.sgi-toast-progress-fill');
  if (progressFill) {
    progressFill.style.transitionDuration = `${duration}ms`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        progressFill.style.width = '0%';
      });
    });
  }

  const dismiss = () => {
    toast.classList.remove('is-visible');
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 400);
  };

  toast.querySelector('.sgi-toast-close')?.addEventListener('click', dismiss);
  setTimeout(dismiss, duration);
}
// Exposicion global para que backend-client.js y otros modulos externos puedan usarla
window.showGlobalAlert = showGlobalAlert;
window.requestBackend = requestBackend;
window.mutateBackend = mutateBackend;


async function renderLayout(activeId = '') {
  let user = ensureSessionOrRedirect();
  if (!user) return;

  user = await refreshSessionUserOrRedirect();
  if (!user) return;

  if (hasRole(ROLES.ADMIN, user) && !user.two_factor_enabled) {
    redirectToLogin();
    return;
  }

  // Ruteo de accesos por rol y permiso.
  const menuItems = await loadAuthorizedNavigation();
  const currentItem = flattenMenuItems(menuItems).find(i => i.id === activeId)
    || flattenMenuItems(window.SGINavigationStore.menuItems).find(i => i.id === activeId);
  if (activeId === 'territorial-units') {
    window.location.href = 'operational-structure.html';
    return;
  }
  const pageAccess = currentItem || window.SGINavigationStore.pageAccess?.[activeId] || null;
  if (pageAccess && !canAccessItem(pageAccess)) {
    const defaultPage = getDefaultPageForSession();
    if (!defaultPage) {
      showLayoutMessage('No tienes una pantalla disponible para tu rol.', 'danger');
      return;
    }
    window.location.href = defaultPage;
    return;
  }
  // Navbar
  const userFirstName = user.nombre || user.first_name || user.name || user.username || 'Usuario';
  const userLastName = user.apellido || user.last_name || '';
  const userFullName = `${userFirstName} ${userLastName}`.trim();
  const userInitial = escapeHtml(userFirstName).charAt(0).toUpperCase();
  const userEmail = user.email || '';
  const userRole = formatUserRoles(user);
  const navbarHtml = buildTopbarHtml({
    firstName: userFirstName,
    fullName: userFullName,
    initial: userInitial,
    email: userEmail,
    role: userRole,
    showProfileLink: canAccessItem(window.SGINavigationStore.pageAccess?.profile || {}),
  });
  const navEl = document.getElementById('mainNavbar');
  if (navEl) navEl.innerHTML = navbarHtml;
  // Sidebar
  const sidebarHtml = buildSidebarHtml(menuItems, activeId);
  const sidebarEl = document.getElementById('mainSidebar');
  if (sidebarEl) {
    sidebarEl.innerHTML = sidebarHtml;

    // Interceptor de navegación para prevenir múltiples clics y recargas redundantes
    sidebarEl.addEventListener('click', function (e) {
      const link = e.target.closest('a.nav-link');
      if (!link) return;

      const navItem = link.closest('.nav-item.has-treeview');
      const href = link.getAttribute('href');
      if (!href || href.startsWith('javascript:')) return;

      if (link.dataset.menuToggle === 'true' || href === '#') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (navItem) {
          const isOpen = navItem.classList.contains('menu-open');
          const siblingItems = Array.from(navItem.parentElement?.children || [])
            .filter((item) => item !== navItem && item.classList?.contains('has-treeview'));

          siblingItems.forEach((item) => {
            const siblingLink = Array.from(item.children || []).find((child) => child.classList?.contains('nav-link'));
            item.classList.remove('menu-open');
            siblingLink?.classList.remove('active');
            siblingLink?.setAttribute('aria-expanded', 'false');
          });

          navItem.classList.toggle('menu-open', !isOpen);
          link.classList.toggle('active', !isOpen);
          link.setAttribute('aria-expanded', String(!isOpen));
        }

        return;
      }

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

      const targetHref = availableMenus[0].route || availableMenus[0].href;

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

  if (window.SGIDomUtils?.delegateEvent) {
    window.SGIDomUtils.delegateEvent(document.body, '#btnMarkAllRead', 'click', async (e) => {
      e.preventDefault();
      try {
        await mutateBackend('/notifications/mark-all-read', { method: 'PATCH' });
        await loadNavbarNotifications(true);
        if (window.showGlobalAlert) {
          window.showGlobalAlert('Todas las notificaciones han sido marcadas como leídas.', 'success');
        }
      } catch { 
        if (window.showGlobalAlert) {
          window.showGlobalAlert('No se pudieron marcar las notificaciones.', 'danger');
        }
      }
    });
  } else {
    document.getElementById('btnMarkAllRead')?.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await mutateBackend('/notifications/mark-all-read', { method: 'PATCH' });
        await loadNavbarNotifications(true);
      } catch { }
    });
  }
  
  startInactivityWatcher();
  loadNavbarNotifications(true);
  startRealtimeNotifications(user);
  if (window.SGINavigationStore) {
    window.SGINavigationStore.clearNavigation();
  }
}
window.renderLayout = renderLayout;

function filterAuthorizedMenuItems(items = []) {
  return items.reduce((result, item) => {
    const hasChildren = Array.isArray(item.children) && item.children.length > 0;
    const children = Array.isArray(item.children) ? filterAuthorizedMenuItems(item.children) : [];
    const canViewItem = canAccessItem(item);
    const hasRoute = Boolean(item.route || item.href);

    if (hasChildren) {
      if (canViewItem && children.length) {
        result.push({ ...item, children });
      }
      return result;
    }

    if (hasRoute && canViewItem) {
      result.push({ ...item, children });
      return result;
    }

    return result;
  }, []);
}

function flattenMenuItems(items = []) {
  return items.flatMap((item) => {
    const children = Array.isArray(item.children) ? flattenMenuItems(item.children) : [];
    return (item.route || item.href) ? [{ ...item, children: undefined }, ...children] : children;
  });
}

function canAccessItem(item = {}) {
  const user = readSessionUser();
  if (!user) return false;

  return !item.permission || hasPermission(item.permission);
}
