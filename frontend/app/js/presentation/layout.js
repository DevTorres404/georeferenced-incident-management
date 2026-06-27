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
function renderProfileModal(sessionUser) {
  const existing = document.getElementById('profileModal');
  if (existing) existing.remove();
  const firstName = sessionUser.nombre || sessionUser.first_name || '';
  const lastName = sessionUser.apellido || sessionUser.last_name || '';
  const username = sessionUser.username || '';
  const email = sessionUser.email || '';
  const roles = formatUserRoles(sessionUser);
  const has2FA = sessionUser.two_factor_enabled;
  const require2FA = hasRole('ADMIN') && !has2FA;
  const modalHtml = `
    <div class="modal fade" id="profileModal" tabindex="-1" role="dialog" ${require2FA ? 'data-backdrop="static" data-keyboard="false"' : ''}>
      <div class="modal-dialog" role="document">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title"><i class="fas fa-user-circle mr-2"></i>Mi Perfil</h5>
            ${require2FA ? '' : '<button type="button" class="close text-white" data-dismiss="modal" aria-label="Cerrar"><span aria-hidden="true">&times;</span></button>'}
          </div>
          <div class="modal-body p-0">
            ${require2FA ? `
              <div class="alert alert-warning m-3">
                <i class="fas fa-exclamation-triangle mr-2"></i>Por tu nivel de acceso, es obligatorio configurar la Autenticación en 2 Pasos para continuar.
              </div>
            ` : ''}
            <ul class="nav nav-tabs px-3 pt-3" id="profileTabs" role="tablist">
              <li class="nav-item">
                <a class="nav-link active" id="datos-tab" data-toggle="tab" href="#datos" role="tab">Datos Personales</a>
              </li>
              <li class="nav-item">
                <a class="nav-link" id="seguridad-tab" data-toggle="tab" href="#seguridad" role="tab">Seguridad</a>
              </li>
            </ul>
            <div class="tab-content p-3" id="profileTabsContent">
              <div class="tab-pane fade show active" id="datos" role="tabpanel">
                <form id="profileForm">
                  <div class="form-group">
                    <label>Nombre(s)</label>
                    <input type="text" class="form-control" value="${escapeHtml(firstName)}" readonly>
                  </div>
                  <div class="form-group">
                    <label>Apellidos</label>
                    <input type="text" class="form-control" value="${escapeHtml(lastName)}" readonly>
                  </div>
                  <div class="form-group">
                    <label>Correo Electrónico</label>
                    <input type="email" class="form-control" value="${escapeHtml(email)}" readonly>
                  </div>
                  <div class="form-group">
                    <label>Roles Asignados</label>
                    <input type="text" class="form-control" value="${escapeHtml(roles)}" readonly>
                  </div>
                </form>
              </div>
              <div class="tab-pane fade" id="seguridad" role="tabpanel">
                <div class="text-center" id="securityContainer">
                  ${has2FA
      ? `<div class="alert alert-success"><i class="fas fa-shield-alt mr-2"></i>Autenticación en 2 Pasos activa</div>`
      : `
                    <p class="text-muted">Protege tu cuenta con verificación de dos pasos usando Google Authenticator u otra app similar.</p>
                    <div id="tfaStep1">
                      <button type="button" class="btn btn-primary" id="btnSetup2fa">
                        <i class="fas fa-qrcode mr-2"></i>Configurar 2FA
                      </button>
                    </div>
                    <div id="tfaStep2" class="d-none mt-3">
                      <p>Escanea este código QR con tu aplicación autenticadora:</p>
                      <div id="qrcode-container" class="d-inline-block bg-white p-2 border rounded"></div>
                      <div class="mt-3 text-left">
                        <label>Ingresa el código generado:</label>
                        <input type="text" id="tfaCodeInput" class="form-control form-control-lg text-center" maxlength="6" placeholder="000000">
                      </div>
                      <button type="button" class="btn btn-success mt-3" id="btnConfirm2fa">Verificar y Activar</button>
                    </div>
                    <div id="tfaAlert" class="mt-3 text-left"></div>
                  `}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const btnSetup2fa = document.getElementById('btnSetup2fa');
  const btnConfirm2fa = document.getElementById('btnConfirm2fa');
  if (btnSetup2fa) btnSetup2fa.addEventListener('click', initSetup2FA);
  if (btnConfirm2fa) btnConfirm2fa.addEventListener('click', confirmSetup2FA);
  if (require2FA && window.jQuery) {
    window.jQuery('#profileModal').modal('show');
    window.jQuery('#seguridad-tab').tab('show');
  }
}
async function initSetup2FA() {
  const btn = document.getElementById('btnSetup2fa');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generando QR...';
  try {
    const data = await mutateBackend('/auth/2fa/enable', { method: 'POST' });
    await ensureQrCodeLibrary();
    document.getElementById('tfaStep1').classList.add('d-none');
    document.getElementById('tfaStep2').classList.remove('d-none');
    const qrContainer = document.getElementById('qrcode-container');
    qrContainer.innerHTML = '';
    if (window.QRCode) {
      new QRCode(qrContainer, {
        text: data.qr_url,
        width: 200,
        height: 200
      });
    } else {
      qrContainer.innerHTML = '<span class="text-danger">Error: Librería QR no encontrada.</span>';
    }
  } catch (error) {
    const alert = document.getElementById('tfaAlert');
    alert.innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message || 'Error al generar QR')}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-qrcode mr-2"></i>Configurar 2FA';
  }
}
function ensureQrCodeLibrary() {
  if (window.QRCode) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-sgig-qrcode]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    script.async = true;
    script.dataset.sgigQrcode = 'true';
    script.onload = resolve;
    script.onerror = () => reject(new Error('No se pudo cargar la libreria para generar el codigo QR.'));
    document.head.appendChild(script);
  });
}
async function confirmSetup2FA() {
  const btn = document.getElementById('btnConfirm2fa');
  const code = document.getElementById('tfaCodeInput').value.trim();
  if (!code || code.length !== 6) {
    document.getElementById('tfaAlert').innerHTML = `<div class="alert alert-warning">El código debe tener 6 dígitos.</div>`;
    return;
  }
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Verificando...';
  try {
    await mutateBackend('/auth/2fa/confirm', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
    document.getElementById('tfaAlert').innerHTML = `<div class="alert alert-success">¡Autenticación activada con éxito!</div>`;
    const user = readSessionUser();
    if (user) {
      user.two_factor_enabled = true;
      localStorage.setItem(AUTH_KEYS.user, JSON.stringify(user));
    }
    setTimeout(() => {
      if (window.jQuery) {
        window.jQuery('#profileModal').modal('hide');
      }
      window.location.reload();
    }, 1500);
  } catch (error) {
    document.getElementById('tfaAlert').innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message || 'Código inválido')}</div>`;
    btn.disabled = false;
    btn.innerHTML = 'Verificar y Activar';
  }
}
async function renderLayout(activeId = '') {
  const user = ensureSessionOrRedirect();
  if (!user) return;
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
        <a href="#" class="nav-link dropdown-toggle" data-toggle="dropdown">
          <div class="bg-primary text-white rounded-circle d-inline-flex align-items-center justify-content-center" style="width: 30px; height: 30px; vertical-align: middle;">
            ${escapeHtml(user.nombre || user.first_name || 'U').charAt(0).toUpperCase()}
          </div>
          <span class="d-none d-md-inline ml-1">${escapeHtml(user.nombre || user.first_name || 'Usuario')}</span>
        </a>
        <ul class="dropdown-menu dropdown-menu-lg dropdown-menu-right">
          <li class="user-header bg-primary">
            <div class="bg-white text-primary rounded-circle d-flex align-items-center justify-content-center mx-auto mb-2 shadow-sm" style="width: 70px; height: 70px; font-size: 28px; font-weight: bold;">
              ${escapeHtml(user.nombre || user.first_name || 'U').charAt(0).toUpperCase()}
            </div>
            <p>
              ${escapeHtml(user.nombre || user.first_name || '')} ${escapeHtml(user.apellido || user.last_name || '')}
              <small>${escapeHtml(user.email || '')}</small>
            </p>
          </li>
          <li class="user-footer">
            <a href="#" id="btnProfile" class="btn btn-default btn-flat">Perfil</a>
            <a href="#" id="btnLogout" class="btn btn-default btn-flat float-right text-danger"><i class="fas fa-sign-out-alt mr-1"></i>Salir</a>
          </li>
        </ul>
      </li>
    </ul>
  `;
  const navEl = document.getElementById('mainNavbar');
  if (navEl) navEl.innerHTML = navbarHtml;
  // Sidebar
  const sidebarHtml = `
    <div class="sidebar">
      <div class="user-panel mt-3 pb-3 mb-3 d-flex">
        <div class="image d-flex align-items-center">
          <div class="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center" style="width: 34px; height: 34px; font-weight: bold;">
            ${escapeHtml(user.nombre || user.first_name || 'U').charAt(0).toUpperCase()}
          </div>
        </div>
        <div class="info">
          <a href="#" id="btnSidebarProfile" class="d-block text-wrap">${escapeHtml(user.nombre || user.first_name || 'Usuario')}</a>
        </div>
      </div>
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
  // Render Modal & Bind events
  renderProfileModal(user);
  document.getElementById('btnLogout')?.addEventListener('click', logoutManually);
  document.getElementById('btnProfile')?.addEventListener('click', () => {
    if (window.jQuery) window.jQuery('#profileModal').modal('show');
  });
  
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
  document.getElementById('btnSidebarProfile')?.addEventListener('click', () => {
    if (window.jQuery) window.jQuery('#profileModal').modal('show');
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
