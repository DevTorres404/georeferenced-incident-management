import os

filepath = 'c:/Users/Damian/Documents/Desarrollo Web/georeferenced-incident-management/frontend/app/js/presentation/layout.js'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find where the navbar starts
navbar_start_idx = -1
for i, line in enumerate(lines):
    if '// ---- NAVBAR ----' in line:
        navbar_start_idx = i
        break

if navbar_start_idx == -1:
    print("Navbar start not found")
    exit(1)

# We want to keep everything before the navbar start.
good_lines = lines[:navbar_start_idx]

# Append the good navbar, sidebar, and end logic
good_content = "".join(good_lines) + """  // ---- NAVBAR ----
  const navbar = document.getElementById('mainNavbar');
  if (navbar) {
    navbar.innerHTML = html`
      <ul class="navbar-nav">
        <li class="nav-item">
          <a class="nav-link" data-widget="pushmenu" href="#" role="button">
            <i class="fas fa-bars"></i>
          </a>
        </li>
        <li class="nav-item d-none d-sm-inline-block">
          <span class="nav-link font-weight-bold text-primary">
            <img src="../img/SGI_LOGO.png" alt="SGI Logo" style="max-height: 20px;" class="mr-1"> SGI
          </span>
        </li>
      </ul>
      <ul class="navbar-nav ml-auto">
        <!-- Notificaciones -->
        <li class="nav-item dropdown">
          <a class="nav-link" data-toggle="dropdown" href="#" aria-label="Notificaciones">
            <i class="far fa-bell"></i>
            <span class="badge badge-warning navbar-badge" id="navbarNotificationsBadge" style="display:none;">0</span>
          </a>
          <div class="dropdown-menu dropdown-menu-lg dropdown-menu-right">
            <span class="dropdown-item dropdown-header" id="navbarNotificationsHeader">Notificaciones</span>
            <div class="dropdown-divider"></div>
            <div id="navbarNotificationsList">
              <span class="dropdown-item text-muted">
                <i class="fas fa-spinner fa-spin mr-2"></i>Cargando...
              </span>
            </div>
            <button type="button" class="dropdown-item dropdown-footer border-0 bg-transparent" id="markAllNotificationsRead">
              Marcar todas como leidas
            </button>
          </div>
        </li>
        <!-- Usuario -->
        <li class="nav-item dropdown">
          <a class="nav-link" data-toggle="dropdown" href="#" aria-label="Perfil usuario">
            <i class="fas fa-user-circle fa-lg"></i>
            <span class="d-none d-sm-inline ml-1" data-user-display-name>${displayName}</span>
          </a>
          <div class="dropdown-menu dropdown-menu-right">
            <button type="button" class="dropdown-item" id="open-profile-modal"><i class="fas fa-user mr-2"></i> Ver perfil</button>
            <div class="dropdown-divider"></div>
            <button type="button" class="dropdown-item text-danger" id="logout-link"><i class="fas fa-sign-out-alt mr-2"></i> Salir</button>
          </div>
        </li>
      </ul>`;

    const logoutLink = navbar.querySelector('#logout-link');
    if (logoutLink) {
      logoutLink.addEventListener('click', logoutManually);
    }

    if (window.jQuery) {
      const $ = window.jQuery;
      $('[data-widget="pushmenu"]').PushMenu();
    } else {
      const pushmenuBtn = navbar.querySelector('[data-widget="pushmenu"]');
      if (pushmenuBtn) {
        pushmenuBtn.addEventListener('click', (e) => {
          e.preventDefault();
          document.body.classList.toggle('sidebar-collapse');
          if (window.innerWidth < 992) {
            document.body.classList.toggle('sidebar-open');
          }
        });
      }
    }

    const profileLink = navbar.querySelector('#open-profile-modal');
    if (profileLink) {
      profileLink.addEventListener('click', () => {
        if (window.jQuery) {
          window.jQuery('#profileModal').modal('show');
        }
      });
    }

    const markAllNotificationsRead = navbar.querySelector('#markAllNotificationsRead');
    if (markAllNotificationsRead) {
      markAllNotificationsRead.addEventListener('click', async () => {
        try {
          await mutateBackend('/notifications/mark-all-read', { method: 'POST' });
          await loadNavbarNotifications();
          showLayoutMessage('Notificaciones marcadas como leidas.', 'success');
        } catch {
          showLayoutMessage('No se pudieron actualizar las notificaciones.', 'danger');
        }
      });
    }

    loadNavbarNotifications().catch(() => {
      renderBetterNavbarNotifications(0, []);
    });
  }

  // ---- SIDEBAR ----
  const sidebar = document.getElementById('mainSidebar');
  if (sidebar) {
    const menuItems = window.SGINavigationStore.getAuthorizedMenu();

    sidebar.innerHTML = html`
      <a href="dashboard.html" class="brand-link" style="padding-left:14px; padding-top:14px; padding-bottom:14px; display:flex; align-items:center;">
        <span class="brand-image img-circle elevation-3"
          style="background:linear-gradient(135deg,#0ea5e9,#38bdf8);width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;margin-top:0;">
          <img src="../img/SGI_LOGO.png" alt="SGI Logo" style="max-width: 20px; max-height: 20px;">
        </span>
        <span class="brand-text font-weight-bold ml-2" style="font-size:1.2rem; letter-spacing:0.5px;">SGI</span>
      </a>
      <div class="sidebar">
        <!-- Perfil -->
        <div class="user-panel mt-3 pb-3 mb-3 d-flex">
          <div class="image">
            <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#0ea5e9,#38bdf8);display:flex;align-items:center;justify-content:center;">
              <i class="fas fa-user-shield text-white" style="font-size:1rem;"></i>
            </div>
          </div>
          <div class="info">
            <button type="button" class="btn btn-link d-block font-weight-bold p-0 text-left text-white" id="open-profile-modal-sidebar" data-user-display-name>${displayName}</button>
            <small class="text-muted" data-user-display-role>${displayRole}</small>
          </div>
        </div>
        <!-- Menú principal -->
        <nav class="mt-2">
          <ul class="nav nav-pills nav-sidebar flex-column" data-widget="treeview" role="menu" data-accordion="false">
            ${menuItems.map(item => `
              <li class="nav-item">
                <a href="${safeUrl(item.href)}" class="nav-link ${paginaActiva === item.id ? 'active' : ''}">
                  <i class="nav-icon fas ${escapeHtml(item.icon)}"></i>
                  <p>${escapeHtml(item.label)}</p>
                </a>
              </li>`)}
            <li class="nav-header">INFORMACIÓN</li>
            <li class="nav-item">
              <a href="about.html" class="nav-link ${paginaActiva === 'about' ? 'active' : ''}">
                <i class="nav-icon fas fa-info-circle"></i>
                <p>Acerca de</p>
              </a>
            </li>
          </ul>
        </nav>
      </div>`;

    const sidebarProfileLink = sidebar.querySelector('#open-profile-modal-sidebar');
    if (sidebarProfileLink) {
      sidebarProfileLink.addEventListener('click', () => {
        if (window.jQuery) {
          window.jQuery('#profileModal').modal('show');
        }
      });
    }
  }

  // Limpiar el estado de navegacion al cargar la pagina completamente
  window.SGINavigationStore.clearNavigation();
  document.documentElement.style.visibility = '';

  // Ocultar cualquier loader de navegacion que haya quedado del clic anterior
  (function hideNavLoaderOnLoad() {
    const existingLoader = document.getElementById('pageLoader');
    if (existingLoader) existingLoader.hidden = true;
  })();

  // Helper: mostrar/ocultar loader de navegacion con timeout de seguridad
  let _navLoaderTimer = null;

  function showNavLoader() {
    let loader = document.getElementById('pageLoader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'pageLoader';
      loader.className = 'spinner-overlay';
      loader.setAttribute('role', 'status');
      loader.setAttribute('aria-label', 'Navegando...');
      loader.innerHTML = '<div class="loader-orbit"><i class="fas fa-map-marker-alt"></i></div>';
      document.body.appendChild(loader);
    }
    loader.hidden = false;

    // Timeout de seguridad: máximo 8s para la transicion entre páginas
    clearTimeout(_navLoaderTimer);
    _navLoaderTimer = setTimeout(() => {
      const l = document.getElementById('pageLoader');
      if (l) l.hidden = true;
      window.SGINavigationStore.clearNavigation();
    }, 8000);
  }

  // Prevenir multiples clicks en los enlaces para evitar recargas acumuladas
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link || !link.href || link.target === '_blank' || link.getAttribute('href') === '#') return;

    // Solo interceptar navegacion interna (.html)
    if (link.href.includes('.html')) {
      const targetPath = new URL(link.href).pathname;
      const currentPath = window.location.pathname;

      // Si es la misma pagina, ignorar click (evita llamada a API y recarga)
      if (targetPath === currentPath) {
        e.preventDefault();
        return;
      }

      // Si ya hay navegacion o ya se hizo click, bloquear temporalmente
      if (window.SGINavigationStore.isNavigationInProgress() || link.classList.contains('js-loading-clicked')) {
        e.preventDefault();
        return;
      }

      link.classList.add('js-loading-clicked');
      window.SGINavigationStore.startNavigation(link.href);
      showNavLoader();
    }
  });

  // Asegurar que el loader se oculte cuando la página termine de cargarse completamente
  window.addEventListener('load', () => {
    const loader = document.getElementById('pageLoader');
    if (loader) loader.hidden = true;
    window.SGINavigationStore.clearNavigation();
  });

  // pageshow se dispara cuando el browser restaura la página desde el bfcache
  // (botón Atrás/Adelante). El evento 'load' NO se dispara en ese caso.
  window.addEventListener('pageshow', (e) => {
    const loader = document.getElementById('pageLoader');
    if (loader) loader.hidden = true;
    clearTimeout(_navLoaderTimer);
    window.SGINavigationStore.clearNavigation();

    // Limpiar la clase de carga de todos los enlaces que pudieron quedar marcados
    document.querySelectorAll('a.js-loading-clicked').forEach(link => {
      link.classList.remove('js-loading-clicked');
    });

    // Si la página viene del bfcache y la sesión expiró mientras tanto, redirigir
    if (e.persisted) {
      const token = localStorage.getItem('auth_token');
      const expiresAt = new Date(localStorage.getItem('auth_expires_at') || '').getTime();
      if (!token || (Number.isFinite(expiresAt) && expiresAt <= Date.now())) {
        clearSession();
        redirectToLogin();
      }
    }
  });

  // popstate se dispara cuando el usuario navega con Atrás/Adelante del browser
  window.addEventListener('popstate', () => {
    const loader = document.getElementById('pageLoader');
    if (loader) loader.hidden = true;
    clearTimeout(_navLoaderTimer);
    window.SGINavigationStore.clearNavigation();

    document.querySelectorAll('a.js-loading-clicked').forEach(link => {
      link.classList.remove('js-loading-clicked');
    });
  });
}
"""

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(good_content)

print("Fixed")
