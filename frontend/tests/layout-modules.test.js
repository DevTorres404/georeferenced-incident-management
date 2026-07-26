import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { showMainLoader, hideMainLoader } from '../app/js/layout/loader.js'

vi.mock('../app/js/core/auth-session.js', async importOriginal => ({
  ...await importOriginal(),
  clearSession: vi.fn()
}))

vi.mock('../app/js/layout/sidebar.js', () => ({
  buildSidebarHtml: vi.fn(() => '<nav>sidebar</nav>')
}))

vi.mock('../app/js/layout/topbar.js', () => ({
  buildTopbarHtml: vi.fn(() => '<nav>topbar</nav>')
}))

vi.mock('../app/js/layout/nav-items.js', () => ({
  NAV_ITEMS: [
    {
      id: 'workspace', label: 'Espacio de trabajo', icon: 'fas fa-th', children: [
        { id: 'dashboard', label: 'Dashboard', icon: 'fas fa-chart-pie', route: 'dashboard.html', permission: 'dashboard.view' },
        { id: 'incidents', label: 'Incidencias', icon: 'fas fa-list', route: 'incidents.html', permission: 'incidents.view' }
      ]
    },
    {
      id: 'admin', label: 'Administración', icon: 'fas fa-cog', children: [
        { id: 'users', label: 'Usuarios', icon: 'fas fa-users', route: 'users.html', permission: null }
      ]
    },
    {
      id: 'no-route', label: 'Sin ruta', icon: 'fas fa-ban', children: []
    }
  ],
  PAGE_ACCESS: {
    dashboard: { permission: 'dashboard.view' },
    incidents: { permission: 'incidents.view' },
    profile: { permission: 'profile.view' }
  },
  ROLES: { ADMIN: 'ADMIN' }
}))

vi.mock('../app/js/infrastructure/backend-client.js', () => ({
  request: vi.fn(),
  requestBackend: vi.fn(),
  requestRaw: vi.fn()
}))

vi.mock('../app/js/modules/notifications/application/subscribe-notifications.usecase.js', () => ({
  subscribeToUserNotifications: vi.fn()
}))

// ---------------------------------------------------------------------------
// A. Pure functions from layout.js
// ---------------------------------------------------------------------------
describe('A. layout.js — pure functions', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  // ------- escapeHtml -------
  describe('escapeHtml', () => {
    it('escapes & < > " \'', async () => {
      const { escapeHtml } = await import('../app/js/layout/layout.js')
      expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;')
    })

    it('returns empty string for null/undefined', async () => {
      const { escapeHtml } = await import('../app/js/layout/layout.js')
      expect(escapeHtml(null)).toBe('')
      expect(escapeHtml()).toBe('')
    })

    it('returns empty string for empty string', async () => {
      const { escapeHtml } = await import('../app/js/layout/layout.js')
      expect(escapeHtml('')).toBe('')
    })
  })

  // ------- safeUrl -------
  describe('safeUrl', () => {
    it('returns # for null/undefined/empty', async () => {
      const { safeUrl } = await import('../app/js/layout/layout.js')
      expect(safeUrl(null)).toBe('#')
      expect(safeUrl()).toBe('#')
      expect(safeUrl('')).toBe('#')
    })

    it('returns # for javascript:, data:, vbscript:, file: URLs', async () => {
      const { safeUrl } = await import('../app/js/layout/layout.js')
      expect(safeUrl('javascript:alert(1)')).toBe('#')
      expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBe('#')
      expect(safeUrl('vbscript:msgbox("x")')).toBe('#')
      expect(safeUrl('file:///etc/passwd')).toBe('#')
    })

    it('returns the URL for http/https URLs', async () => {
      const { safeUrl } = await import('../app/js/layout/layout.js')
      expect(safeUrl('http://example.com')).toBe('http://example.com')
      expect(safeUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1')
    })

    it('returns path for relative paths like /dashboard', async () => {
      const { safeUrl } = await import('../app/js/layout/layout.js')
      expect(safeUrl('/dashboard')).toBe('/dashboard')
      expect(safeUrl('/some-page.html')).toBe('/some-page.html')
    })
  })

  // ------- html tagged template -------
  describe('html tagged template', () => {
    it('escapes interpolated values', async () => {
      const { html } = await import('../app/js/layout/layout.js')
      expect(html`<div>${'<script>'}</div>`).toBe('<div>&lt;script&gt;</div>')
    })

    it('joins arrays', async () => {
      const { html } = await import('../app/js/layout/layout.js')
      expect(html`<ul>${['<li>a</li>', '<li>b</li>']}</ul>`).toBe('<ul><li>a</li><li>b</li></ul>')
    })

    it('returns plain string for no interpolation', async () => {
      const { html } = await import('../app/js/layout/layout.js')
      expect(html`<div>static</div>`).toBe('<div>static</div>')
    })

    it('stringifies numbers', async () => {
      const { html } = await import('../app/js/layout/layout.js')
      expect(html`<span>${42}</span>`).toBe('<span>42</span>')
    })
  })

  // ------- normalizeRoleCode -------
  describe('normalizeRoleCode', () => {
    it('handles string value', async () => {
      const { normalizeRoleCode } = await import('../app/js/layout/layout.js')
      expect(normalizeRoleCode(' admin ')).toBe('ADMIN')
    })

    it('handles object with codigo/code/name/nombre', async () => {
      const { normalizeRoleCode } = await import('../app/js/layout/layout.js')
      expect(normalizeRoleCode({ codigo: 'admin' })).toBe('ADMIN')
      expect(normalizeRoleCode({ code: 'user' })).toBe('USER')
      expect(normalizeRoleCode({ name: 'Operador' })).toBe('OPERADOR')
      expect(normalizeRoleCode({ nombre: 'Supervisor' })).toBe('SUPERVISOR')
    })

    it('returns trimmed uppercase', async () => {
      const { normalizeRoleCode } = await import('../app/js/layout/layout.js')
      expect(normalizeRoleCode('  admin  ')).toBe('ADMIN')
    })

    it('handles null/undefined returns empty string', async () => {
      const { normalizeRoleCode } = await import('../app/js/layout/layout.js')
      expect(normalizeRoleCode(null)).toBe('')
      expect(normalizeRoleCode()).toBe('')
    })
  })

  // ------- normalizePermissionCode -------
  describe('normalizePermissionCode', () => {
    it('handles string value', async () => {
      const { normalizePermissionCode } = await import('../app/js/layout/layout.js')
      expect(normalizePermissionCode(' DASHBOARD.VIEW ')).toBe('dashboard.view')
    })

    it('handles object with codigo/code', async () => {
      const { normalizePermissionCode } = await import('../app/js/layout/layout.js')
      expect(normalizePermissionCode({ codigo: 'INCIDENTS.VIEW' })).toBe('incidents.view')
      expect(normalizePermissionCode({ code: 'USERS.MANAGE' })).toBe('users.manage')
    })

    it('returns trimmed lowercase', async () => {
      const { normalizePermissionCode } = await import('../app/js/layout/layout.js')
      expect(normalizePermissionCode('  TEST.PERMISSION  ')).toBe('test.permission')
    })

    it('handles null/undefined returns empty string', async () => {
      const { normalizePermissionCode } = await import('../app/js/layout/layout.js')
      expect(normalizePermissionCode(null)).toBe('')
      expect(normalizePermissionCode()).toBe('')
    })
  })

  // ------- formatRoleLabel -------
  describe('formatRoleLabel', () => {
    it('returns string as-is', async () => {
      const { formatRoleLabel } = await import('../app/js/layout/layout.js')
      expect(formatRoleLabel('Administrador')).toBe('Administrador')
    })

    it('extracts name/nombre/codigo/code from object', async () => {
      const { formatRoleLabel } = await import('../app/js/layout/layout.js')
      expect(formatRoleLabel({ name: 'Admin' })).toBe('Admin')
      expect(formatRoleLabel({ nombre: 'Supervisor' })).toBe('Supervisor')
      expect(formatRoleLabel({ codigo: 'USR' })).toBe('USR')
      expect(formatRoleLabel({ code: 'OP' })).toBe('OP')
    })

    it('returns empty string for null', async () => {
      const { formatRoleLabel } = await import('../app/js/layout/layout.js')
      expect(formatRoleLabel(null)).toBe('')
    })
  })

  // ------- formatUserRoles -------
  describe('formatUserRoles', () => {
    it('maps roles array through formatRoleLabel', async () => {
      const { formatUserRoles } = await import('../app/js/layout/layout.js')
      const user = { roles: [{ name: 'Admin' }, { nombre: 'Supervisor' }] }
      expect(formatUserRoles(user)).toBe('Admin, Supervisor')
    })

    it('returns "Sin rol asignado" for empty roles', async () => {
      const { formatUserRoles } = await import('../app/js/layout/layout.js')
      expect(formatUserRoles({ roles: [] })).toBe('Sin rol asignado')
    })

    it('returns "Sin rol asignado" for null roles', async () => {
      const { formatUserRoles } = await import('../app/js/layout/layout.js')
      expect(formatUserRoles({ roles: null })).toBe('Sin rol asignado')
      expect(formatUserRoles(null)).toBe('Sin rol asignado')
    })
  })

  // ------- formatRelativeTime -------
  describe('formatRelativeTime', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-01-01T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns "ahora" for < 1 minute', async () => {
      const { formatRelativeTime } = await import('../app/js/layout/layout.js')
      expect(formatRelativeTime('2025-01-01T11:59:50Z')).toBe('ahora')
    })

    it('returns "hace Xm" for minutes', async () => {
      const { formatRelativeTime } = await import('../app/js/layout/layout.js')
      expect(formatRelativeTime('2025-01-01T11:55:00Z')).toBe('hace 5m')
      expect(formatRelativeTime('2025-01-01T11:01:00Z')).toBe('hace 59m')
    })

    it('returns "hace Xh" for hours', async () => {
      const { formatRelativeTime } = await import('../app/js/layout/layout.js')
      expect(formatRelativeTime('2025-01-01T10:00:00Z')).toBe('hace 2h')
    })

    it('returns "hace Xd" for days', async () => {
      const { formatRelativeTime } = await import('../app/js/layout/layout.js')
      expect(formatRelativeTime('2024-12-30T12:00:00Z')).toBe('hace 2d')
    })

    it('returns "" for invalid date', async () => {
      const { formatRelativeTime } = await import('../app/js/layout/layout.js')
      expect(formatRelativeTime('not-a-date')).toBe('')
      expect(formatRelativeTime(null)).toBe('')
      expect(formatRelativeTime()).toBe('')
    })
  })

  // ------- getNotificationIconClass -------
  describe('getNotificationIconClass', () => {
    it('returns fa-user-check for assigned/assign types', async () => {
      const { getNotificationIconClass } = await import('../app/js/layout/layout.js')
      expect(getNotificationIconClass('assigned')).toBe('fa-user-check')
      expect(getNotificationIconClass('user_assigned')).toBe('fa-user-check')
      expect(getNotificationIconClass('asignacion')).toBe('fa-user-check')
    })

    it('returns fa-sync-alt for status/cambio types', async () => {
      const { getNotificationIconClass } = await import('../app/js/layout/layout.js')
      expect(getNotificationIconClass('status')).toBe('fa-sync-alt')
      expect(getNotificationIconClass('cambio_estado')).toBe('fa-sync-alt')
    })

    it('returns fa-check-circle for closed/resolved/resuelta types', async () => {
      const { getNotificationIconClass } = await import('../app/js/layout/layout.js')
      expect(getNotificationIconClass('closed')).toBe('fa-check-circle')
      expect(getNotificationIconClass('resolved')).toBe('fa-check-circle')
      expect(getNotificationIconClass('resuelta')).toBe('fa-check-circle')
    })

    it('returns fa-comment-dots for comment/comentario types', async () => {
      const { getNotificationIconClass } = await import('../app/js/layout/layout.js')
      expect(getNotificationIconClass('comment')).toBe('fa-comment-dots')
      expect(getNotificationIconClass('comentario')).toBe('fa-comment-dots')
    })

    it('returns fa-exclamation-triangle for overdue/vencida types', async () => {
      const { getNotificationIconClass } = await import('../app/js/layout/layout.js')
      expect(getNotificationIconClass('overdue')).toBe('fa-exclamation-triangle')
      expect(getNotificationIconClass('vencida')).toBe('fa-exclamation-triangle')
    })

    it('returns fa-clock for warning types', async () => {
      const { getNotificationIconClass } = await import('../app/js/layout/layout.js')
      expect(getNotificationIconClass('warning')).toBe('fa-clock')
    })

    it('returns fa-times-circle for error/danger types', async () => {
      const { getNotificationIconClass } = await import('../app/js/layout/layout.js')
      expect(getNotificationIconClass('error')).toBe('fa-times-circle')
      expect(getNotificationIconClass('danger')).toBe('fa-times-circle')
    })

    it('returns fa-info-circle as default', async () => {
      const { getNotificationIconClass } = await import('../app/js/layout/layout.js')
      expect(getNotificationIconClass('unknown_type')).toBe('fa-info-circle')
    })

    it('is case insensitive', async () => {
      const { getNotificationIconClass } = await import('../app/js/layout/layout.js')
      expect(getNotificationIconClass('ASSIGNED')).toBe('fa-user-check')
      expect(getNotificationIconClass('Status')).toBe('fa-sync-alt')
    })
  })

  // ------- getNotificationTypeClass -------
  describe('getNotificationTypeClass', () => {
    it('returns type-assigned for assigned/asign types', async () => {
      const { getNotificationTypeClass } = await import('../app/js/layout/layout.js')
      expect(getNotificationTypeClass('assigned')).toBe('type-assigned')
      expect(getNotificationTypeClass('asignado')).toBe('type-assigned')
    })

    it('returns type-closed for closed/resolved/resuelta types', async () => {
      const { getNotificationTypeClass } = await import('../app/js/layout/layout.js')
      expect(getNotificationTypeClass('closed')).toBe('type-closed')
      expect(getNotificationTypeClass('resuelta')).toBe('type-closed')
    })

    it('returns type-info for status/cambio/comment/comentario types', async () => {
      const { getNotificationTypeClass } = await import('../app/js/layout/layout.js')
      expect(getNotificationTypeClass('status')).toBe('type-info')
      expect(getNotificationTypeClass('cambio')).toBe('type-info')
      expect(getNotificationTypeClass('comment')).toBe('type-info')
      expect(getNotificationTypeClass('comentario')).toBe('type-info')
    })

    it('returns type-warning for overdue/vencida/warning types', async () => {
      const { getNotificationTypeClass } = await import('../app/js/layout/layout.js')
      expect(getNotificationTypeClass('overdue')).toBe('type-warning')
      expect(getNotificationTypeClass('vencida')).toBe('type-warning')
      expect(getNotificationTypeClass('warning')).toBe('type-warning')
    })

    it('returns type-danger for error/danger types', async () => {
      const { getNotificationTypeClass } = await import('../app/js/layout/layout.js')
      expect(getNotificationTypeClass('error')).toBe('type-danger')
      expect(getNotificationTypeClass('danger')).toBe('type-danger')
    })

    it('returns type-success for success types', async () => {
      const { getNotificationTypeClass } = await import('../app/js/layout/layout.js')
      expect(getNotificationTypeClass('success')).toBe('type-success')
    })

    it('returns type-info as default', async () => {
      const { getNotificationTypeClass } = await import('../app/js/layout/layout.js')
      expect(getNotificationTypeClass('unknown_type')).toBe('type-info')
    })

    it('is case insensitive', async () => {
      const { getNotificationTypeClass } = await import('../app/js/layout/layout.js')
      expect(getNotificationTypeClass('ASSIGNED')).toBe('type-assigned')
      expect(getNotificationTypeClass('Error')).toBe('type-danger')
    })
  })

  // ------- filterAuthorizedMenuItems -------
  describe('filterAuthorizedMenuItems', () => {
    it('filters items by permission', async () => {
      localStorage.setItem('user_data', JSON.stringify({
        permissions: ['dashboard.view'],
        roles: []
      }))

      const { NAV_ITEMS } = await import('../app/js/layout/nav-items.js')
      const { filterAuthorizedMenuItems } = await import('../app/js/layout/layout.js')

      const result = filterAuthorizedMenuItems(NAV_ITEMS)

      expect(result).toHaveLength(2)
      const ws = result.find(i => i.id === 'workspace')
      expect(ws).toBeDefined()
      expect(ws.children).toHaveLength(1)
      expect(ws.children[0].id).toBe('dashboard')

      const admin = result.find(i => i.id === 'admin')
      expect(admin).toBeDefined()
      expect(admin.children).toHaveLength(1)
      expect(admin.children[0].id).toBe('users')
    })

    it('keeps items without permission requirement', async () => {
      localStorage.setItem('user_data', JSON.stringify({
        permissions: [],
        roles: []
      }))

      const { NAV_ITEMS } = await import('../app/js/layout/nav-items.js')
      const { filterAuthorizedMenuItems } = await import('../app/js/layout/layout.js')

      const result = filterAuthorizedMenuItems(NAV_ITEMS)
      const admin = result.find(i => i.id === 'admin')
      expect(admin).toBeDefined()
      expect(admin.children[0].id).toBe('users')
    })

    it('removes children without permission', async () => {
      localStorage.setItem('user_data', JSON.stringify({
        permissions: [],
        roles: []
      }))

      const { NAV_ITEMS } = await import('../app/js/layout/nav-items.js')
      const { filterAuthorizedMenuItems } = await import('../app/js/layout/layout.js')

      const result = filterAuthorizedMenuItems(NAV_ITEMS)
      const ws = result.find(i => i.id === 'workspace')
      expect(ws).toBeUndefined()
    })

    it('removes menu entries that are not enabled for the current role', async () => {
      localStorage.setItem('user_data', JSON.stringify({
        permissions: ['incidents.list', 'incidents.assign'],
        roles: ['ADMIN']
      }))

      const { filterAuthorizedMenuItems } = await import('../app/js/layout/layout.js')
      const result = filterAuthorizedMenuItems([{
        id: 'incident-hub',
        children: [
          { id: 'incidents', route: 'incidents.html', permission: 'incidents.list' },
          {
            id: 'assignment-management',
            route: 'assignment-management.html',
            permission: 'incidents.assign',
            allowedRoles: ['SUPERVISOR']
          }
        ]
      }])

      expect(result[0].children.map(item => item.id)).toEqual(['incidents'])
    })

    it('denies a direct page entry that is reserved for another role', async () => {
      localStorage.setItem('user_data', JSON.stringify({
        permissions: ['incidents.assign'],
        roles: ['ADMIN']
      }))

      const { canAccessItem } = await import('../app/js/layout/layout.js')

      expect(canAccessItem({
        permission: 'incidents.assign',
        allowedRoles: ['SUPERVISOR']
      })).toBe(false)
    })

    it('returns empty array for empty input', async () => {
      const { filterAuthorizedMenuItems } = await import('../app/js/layout/layout.js')
      expect(filterAuthorizedMenuItems([])).toEqual([])
    })
  })

  describe('backend navigation page guard', () => {
    it('denies direct access when a configured screen is absent from the backend menu', async () => {
      const { isNavigationPageDenied } = await import('../app/js/layout/layout.js')
      const configured = [{
        id: 'admin',
        children: [{ id: 'audit-logs', route: 'audit-logs.html' }]
      }]

      expect(isNavigationPageDenied('audit-logs', [], configured, true)).toBe(true)
      expect(isNavigationPageDenied('audit-logs', [], configured, false)).toBe(false)
    })

    it('allows a screen returned by the backend menu', async () => {
      const { isNavigationPageDenied } = await import('../app/js/layout/layout.js')
      const menu = [{ id: 'admin', children: [{ id: 'audit-logs', route: 'audit-logs.html' }] }]

      expect(isNavigationPageDenied('audit-logs', menu, menu, true)).toBe(false)
    })
  })

  // ------- flattenMenuItems -------
  describe('flattenMenuItems', () => {
    it('flattens nested menu structure into flat list', async () => {
      const { NAV_ITEMS } = await import('../app/js/layout/nav-items.js')
      const { flattenMenuItems } = await import('../app/js/layout/layout.js')

      const result = flattenMenuItems(NAV_ITEMS)
      expect(result).toHaveLength(3)
      expect(result[0].id).toBe('dashboard')
      expect(result[1].id).toBe('incidents')
      expect(result[2].id).toBe('users')
    })

    it('returns route items only', async () => {
      const { flattenMenuItems } = await import('../app/js/layout/layout.js')
      const items = [
        { id: 'a', label: 'A', route: 'a.html' },
        { id: 'b', label: 'B' }
      ]
      const result = flattenMenuItems(items)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('a')
    })

    it('handles empty array', async () => {
      const { flattenMenuItems } = await import('../app/js/layout/layout.js')
      expect(flattenMenuItems([])).toEqual([])
    })
  })

  // ------- canAccessItem -------
  describe('canAccessItem', () => {
    it('returns true if no permission required', async () => {
      localStorage.setItem('user_data', JSON.stringify({
        permissions: [],
        roles: []
      }))

      const { canAccessItem } = await import('../app/js/layout/layout.js')
      expect(canAccessItem({ id: 'test', permission: null })).toBe(true)
      expect(canAccessItem({ id: 'test' })).toBe(true)
    })

    it('returns true if user has the permission', async () => {
      localStorage.setItem('user_data', JSON.stringify({
        permissions: ['dashboard.view'],
        roles: []
      }))

      const { canAccessItem } = await import('../app/js/layout/layout.js')
      expect(canAccessItem({ id: 'dashboard', permission: 'dashboard.view' })).toBe(true)
    })

    it('returns false if user lacks permission', async () => {
      localStorage.setItem('user_data', JSON.stringify({
        permissions: ['dashboard.view'],
        roles: []
      }))

      const { canAccessItem } = await import('../app/js/layout/layout.js')
      expect(canAccessItem({ id: 'incidents', permission: 'incidents.view' })).toBe(false)
    })

    it('returns false if no user', async () => {
      const { canAccessItem } = await import('../app/js/layout/layout.js')
      expect(canAccessItem({ id: 'test', permission: null })).toBe(false)
      expect(canAccessItem({ id: 'test', permission: 'anything' })).toBe(false)
    })
  })

  // ------- isSessionExpired -------
  describe('isSessionExpired', () => {
    it('returns true for expired date', async () => {
      localStorage.setItem('auth_expires_at', new Date(Date.now() - 10000).toISOString())
      const { isSessionExpired } = await import('../app/js/layout/layout.js')
      expect(isSessionExpired()).toBe(true)
    })

    it('returns false for future date', async () => {
      localStorage.setItem('auth_expires_at', new Date(Date.now() + 10000).toISOString())
      const { isSessionExpired } = await import('../app/js/layout/layout.js')
      expect(isSessionExpired()).toBe(false)
    })

    it('returns false when no expiry stored', async () => {
      const { isSessionExpired } = await import('../app/js/layout/layout.js')
      expect(isSessionExpired()).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// B. topbar.js (buildTopbarHtml)
// ---------------------------------------------------------------------------
describe('B. topbar.js — buildTopbarHtml', () => {
  it('returns HTML string with user info', async () => {
    const { buildTopbarHtml } = await vi.importActual('../app/js/layout/topbar.js')
    const html = buildTopbarHtml({
      firstName: 'Juan',
      fullName: 'Juan Pérez',
      initial: 'J',
      email: 'juan@test.com',
      role: 'Administrador'
    })

    expect(html).toContain('Juan')
    expect(html).toContain('Juan Pérez')
    expect(html).toContain('J')
    expect(html).toContain('juan@test.com')
    expect(html).toContain('Administrador')
    expect(html.match(/data-profile-avatar/g)).toHaveLength(6)
    expect(html).toContain('data-profile-avatar-image hidden')
  })

  it('shows notifications menu when showNotifications is true', async () => {
    const { buildTopbarHtml } = await vi.importActual('../app/js/layout/topbar.js')
    const html = buildTopbarHtml({
      firstName: 'Test',
      fullName: 'Test',
      initial: 'T',
      showNotifications: true
    })

    expect(html).toContain('notificationsDropdown')
    expect(html).toContain('id=\"navbarNotificationsBadge\"')
  })

  it('hides notifications menu when showNotifications is false', async () => {
    const { buildTopbarHtml } = await vi.importActual('../app/js/layout/topbar.js')
    const html = buildTopbarHtml({
      firstName: 'Test',
      fullName: 'Test',
      initial: 'T',
      showNotifications: false
    })

    expect(html).not.toContain('notificationsDropdown')
  })

  it('shows profile link by default', async () => {
    const { buildTopbarHtml } = await vi.importActual('../app/js/layout/topbar.js')
    const html = buildTopbarHtml({
      firstName: 'Test',
      fullName: 'Test',
      initial: 'T'
    })

    expect(html).toContain('profile.html')
    expect(html).toContain('Mi perfil')
  })

  it('hides profile link when showProfileLink is false', async () => {
    const { buildTopbarHtml } = await vi.importActual('../app/js/layout/topbar.js')
    const html = buildTopbarHtml({
      firstName: 'Test',
      fullName: 'Test',
      initial: 'T',
      showProfileLink: false
    })

    expect(html).not.toContain('profile.html')
    expect(html).not.toContain('Mi perfil')
  })

  it('escapes user data in HTML', async () => {
    const { buildTopbarHtml } = await vi.importActual('../app/js/layout/topbar.js')
    const html = buildTopbarHtml({
      firstName: '<b>',
      fullName: '<script>alert(1)</script>',
      initial: '&',
      email: 'test@test.com',
      role: 'Admin'
    })

    expect(html).toContain('&lt;b&gt;')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&amp;')
  })
})

// ---------------------------------------------------------------------------
// C. loader.js (showMainLoader, hideMainLoader)
// ---------------------------------------------------------------------------
describe('C. loader.js — showMainLoader / hideMainLoader', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="pageLoader" hidden class="d-none" style="display:none"></div>'
  })

  it('showMainLoader removes hidden, d-none, sets display:flex', () => {
    showMainLoader()
    const loader = document.getElementById('pageLoader')
    expect(loader.hasAttribute('hidden')).toBe(false)
    expect(loader.classList.contains('d-none')).toBe(false)
    expect(loader.style.display).toBe('flex')
  })

  it('hideMainLoader adds hidden, d-none, sets display:none', () => {
    const loader = document.getElementById('pageLoader')
    loader.removeAttribute('hidden')
    loader.classList.remove('d-none')
    loader.style.display = 'flex'

    hideMainLoader()
    expect(loader.hasAttribute('hidden')).toBe(true)
    expect(loader.classList.contains('d-none')).toBe(true)
    expect(loader.style.display).toBe('none')
  })

  it('showMainLoader handles missing element gracefully', () => {
    document.body.innerHTML = ''
    expect(() => showMainLoader()).not.toThrow()
  })

  it('hideMainLoader handles missing element gracefully', () => {
    document.body.innerHTML = ''
    expect(() => hideMainLoader()).not.toThrow()
  })
})
