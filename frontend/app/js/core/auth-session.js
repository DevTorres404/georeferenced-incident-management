const STORAGE_KEYS = {
  token: 'auth_token',
  user: 'user_data',
  expiresAt: 'auth_expires_at'
}

function clearSessionScopedCache() {
  Object.keys(sessionStorage)
    .filter(key => key.startsWith('SGI_API_CACHE_') || key === 'SGI_notifications_cache' || key === 'SGI_nav_state')
    .forEach(key => sessionStorage.removeItem(key))

  globalThis.SGIGApi?.clearApiCache?.()
}

function readUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.user)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function normalizePermissionCode(value) {
  const raw = typeof value === 'string' ? value : value?.code || value?.codigo || ''
  return String(raw).trim().toLowerCase()
}

function userHasPermission(user, permissionCode) {
  const expected = normalizePermissionCode(permissionCode)
  if (!user || !expected) {
    return false
  }

  if (Array.isArray(user.permissions) &&
    user.permissions.some(permission => normalizePermissionCode(permission) === expected)) {
    return true
  }

  return Array.isArray(user.roles) && user.roles.some(role => (
    Array.isArray(role?.permissions) &&
      role.permissions.some(permission => normalizePermissionCode(permission) === expected)
  ))
}

function hasPermission(permissionCode) {
  return userHasPermission(readUser(), permissionCode)
}

function writeSession(data) {
  if (!data) {
    clearSession()
    return null
  }

  if (data.access_token) {
    clearSessionScopedCache()
    localStorage.setItem(STORAGE_KEYS.token, data.access_token)
  }

  if (data.user) {
    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(data.user))
  }

  if (data.expires_at) {
    localStorage.setItem(STORAGE_KEYS.expiresAt, data.expires_at)
  } else if (data.expires_in) {
    localStorage.setItem(STORAGE_KEYS.expiresAt, new Date(Date.now() + data.expires_in * 1000).toISOString())
  }

  return getSession()
}

function getSession() {
  return {
    token: localStorage.getItem(STORAGE_KEYS.token),
    user: readUser(),
    expiresAt: localStorage.getItem(STORAGE_KEYS.expiresAt)
  }
}

function hasValidSession() {
  const session = getSession()
  if (!session.token || !session.expiresAt) {
    return false
  }

  const expiresAt = new Date(session.expiresAt).getTime()
  return Number.isFinite(expiresAt) && expiresAt > Date.now()
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.token)
  localStorage.removeItem(STORAGE_KEYS.user)
  localStorage.removeItem(STORAGE_KEYS.expiresAt)
  clearSessionScopedCache()
}

function formatExpiry(expiresAt = localStorage.getItem(STORAGE_KEYS.expiresAt)) {
  const date = new Date(expiresAt || '')
  if (Number.isNaN(date.getTime())) {
    return 'No definida'
  }

  return date.toLocaleTimeString('es-EC', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function suggestUsername(user) {
  const base = (user?.email || user?.nombre || 'usuario').split('@')[0]
  return base.toLowerCase().replace(/[^\d._a-z-]/g, '').slice(0, 50) || 'usuario'
}

function updateUser(user) {
  if (!user) {
    return null
  }

  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user))
  return user
}

function isSessionExpired() {
  const expiresAt = new Date(localStorage.getItem(STORAGE_KEYS.expiresAt) || '').getTime()
  return Number.isFinite(expiresAt) && expiresAt <= Date.now()
}

function isEmailVerified(user) {
  return Boolean(user?.email_verificado_at || user?.email_verified_at)
}

const api = {
  STORAGE_KEYS,
  clearSessionScopedCache,
  readUser,
  writeSession,
  getSession,
  hasValidSession,
  clearSession,
  formatExpiry,
  hasPermission,
  suggestUsername,
  normalizePermissionCode,
  updateUser,
  userHasPermission,
  isSessionExpired,
  isEmailVerified
}

globalThis.SGIGSession = api

export {
  STORAGE_KEYS,
  clearSession,
  clearSessionScopedCache,
  formatExpiry,
  getSession,
  hasPermission,
  hasValidSession,
  isEmailVerified,
  isSessionExpired,
  normalizePermissionCode,
  readUser,
  suggestUsername,
  updateUser,
  userHasPermission,
  writeSession
}
