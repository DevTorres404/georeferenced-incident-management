import { escapeHtml } from '../shared/sanitizer.js?v=20';

export function buildTopbarHtml(user) {
  const firstName = escapeHtml(user.firstName || 'Usuario');
  const fullName = escapeHtml(user.fullName || 'Usuario');
  const initial = escapeHtml(user.initial || 'U');
  const email = escapeHtml(user.email || '');
  const role = escapeHtml(user.role || 'Sin rol asignado');
  const profileLink = user.showProfileLink === false ? '' : `
          <a href="profile.html" class="dropdown-item rounded px-3 py-2 text-dark">
            <i class="fas fa-user-circle mr-2 text-primary"></i> Mi perfil
          </a>`;
  const notificationsMenu = user.showNotifications === false ? '' : `
      <li class="nav-item dropdown" id="notificationsDropdown">
        <a class="nav-link sgi-notif-bell" data-toggle="dropdown" href="#" aria-label="Notificaciones">
          <i class="far fa-bell"></i>
          <span class="sgi-notif-badge" id="navbarNotificationsBadge" style="display:none;">0</span>
        </a>
        <div class="dropdown-menu dropdown-menu-right sgi-notif-dropdown">
          <div class="sgi-notif-dropdown-header">
            <h6><i class="far fa-bell"></i>Notificaciones</h6>
            <span class="badge" id="navbarNotificationsBadgeCount" style="display:none;">0</span>
          </div>
          <div id="navbarNotificationsList" class="sgi-notif-dropdown-list"></div>
          <button type="button" id="btnMarkAllRead" class="sgi-notif-dropdown-footer" style="display:none;">
            <i class="fas fa-check-double mr-1"></i>Marcar todas como leidas
          </button>
        </div>
      </li>`;

  return `
    <ul class="navbar-nav">
      <li class="nav-item">
        <a class="nav-link" data-widget="pushmenu" href="#" role="button"><i class="fas fa-bars"></i></a>
      </li>
    </ul>
    <ul class="navbar-nav ml-auto">
      <li class="nav-item">
        <button id="btnDarkModeToggle" class="nav-link btn border-0 bg-transparent shadow-none" type="button" aria-label="Alternar modo oscuro" title="Modo oscuro">
          <i class="fas fa-moon"></i>
        </button>
      </li>
      ${notificationsMenu}
      <li class="nav-item dropdown user-menu">
        <a href="#" class="nav-link dropdown-toggle d-flex align-items-center sgi-user-toggle" data-toggle="dropdown" aria-label="Menu de usuario">
          <span class="sgi-user-avatar-sm">${initial}</span>
          <span class="d-none d-md-inline ml-2 font-weight-semibold">${firstName}</span>
        </a>
        <div class="dropdown-menu dropdown-menu-right shadow border-0 rounded-lg sgi-user-dropdown">
          <div class="sgi-user-dropdown-header">
            <span class="sgi-user-avatar-lg">${initial}</span>
            <div class="sgi-user-dropdown-meta">
              <h6 title="${fullName}">${fullName}</h6>
              <small title="${email}">${email}</small>
              <span class="badge badge-light mt-2">${role}</span>
            </div>
          </div>
          <div class="dropdown-divider my-2"></div>
          ${profileLink}
          <a href="#" id="btnLogout" class="dropdown-item rounded px-3 py-2 text-danger">
            <i class="fas fa-sign-out-alt mr-2"></i> Cerrar sesión
          </a>
        </div>
      </li>
    </ul>
  `;
}
