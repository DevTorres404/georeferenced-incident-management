(function protectPageBeforeRender() {
  const AUTH_KEYS = ['auth_token', 'user_data', 'auth_expires_at', 'auth_last_activity_at'];
  const root = document.documentElement;
  // Eliminado root.style.visibility = 'hidden' para evitar el pantallazo blanco


  function loginPath() {
    return globalThis.location.pathname.includes('/html/') ? '../index.html' : 'index.html';
  }

  function clearLocalSession() {
    AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith('SGI_API_CACHE_') || key === 'SGI_notifications_cache' || key === 'SGI_nav_state')
      .forEach((key) => sessionStorage.removeItem(key));
  }

  function hasValidLocalSession() {
    const token = localStorage.getItem('auth_token');
    const expiresAt = new Date(localStorage.getItem('auth_expires_at') || '').getTime();
    let user = null;

    try {
      user = JSON.parse(localStorage.getItem('user_data') || 'null');
    } catch {
      user = null;
    }

    return Boolean(token) && Boolean(user) && Number.isFinite(expiresAt) && expiresAt > Date.now();
  }

  function redirectToLogin() {
    clearLocalSession();
    globalThis.location.replace(loginPath());
  }

  function verifyOrRedirect() {
    if (hasValidLocalSession()) return true;
    redirectToLogin();
    return false;
  }

  globalThis.SGIProtectedPageGuard = {
    reveal() {
      root.style.visibility = '';
    },
    verifyOrRedirect,
  };

  globalThis.addEventListener('pageshow', (event) => {
    if (!verifyOrRedirect()) return;
    if (event.persisted) globalThis.dispatchEvent(new Event('sgi:validate-session'));
  });

  globalThis.addEventListener('storage', (event) => {
    if (event.key === 'auth_token' && !event.newValue) redirectToLogin();
  });

  verifyOrRedirect();
})();
