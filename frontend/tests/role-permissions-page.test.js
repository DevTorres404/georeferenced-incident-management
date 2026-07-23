import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../app/js/modules/roles/application/access-control-service.js', () => ({
  getAccessControlOverview: vi.fn(),
  updateRolePermissions: vi.fn()
}))

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn()
}))

vi.mock('../app/js/shared/validators/validation-utils.js', () => ({
  handleBackendErrors: vi.fn(),
  setFormAlert: vi.fn()
}))

describe('role-permissions-page.js — pure functions', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe('getRoleDescription', () => {
    it('returns description for known code', async () => {
      const { getRoleDescription } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(getRoleDescription('ADMIN')).toBe('Administracion completa')
      expect(getRoleDescription('CIUDADANO')).toBe('Registro y seguimiento')
    })

    it('returns fallback for unknown code', async () => {
      const { getRoleDescription } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(getRoleDescription('UNKNOWN')).toBe('Rol del sistema')
    })
  })

  describe('selectedRole', () => {
    it('finds role by selectedRoleCode', async () => {
      const { selectedRole } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const state = {
        roles: [{ code: 'ADMIN', name: 'Admin' }, { code: 'USER', name: 'User' }],
        selectedRoleCode: 'ADMIN'
      }
      expect(selectedRole(state).name).toBe('Admin')
    })

    it('returns null when no match', async () => {
      const { selectedRole } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const state = { roles: [], selectedRoleCode: 'ADMIN' }
      expect(selectedRole(state)).toBeNull()
    })
  })

  describe('escapeHtml', () => {
    it('escapes special characters', async () => {
      const { escapeHtml } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(escapeHtml('<>&"\'').includes('&lt;')).toBe(true)
    })
  })

  describe('escapeAttr', () => {
    it('escapes double quotes', async () => {
      const { escapeAttr } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(escapeAttr('he"llo')).toContain('&quot;')
    })
  })

  describe('emptyState', () => {
    it('returns HTML with message', async () => {
      const { emptyState } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const html = emptyState('No data')
      expect(html).toContain('No data')
      expect(html).toContain('fa-inbox')
    })
  })

  describe('humanizeCode', () => {
    it('converts snake_case to Title Case', async () => {
      const { humanizeCode } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(humanizeCode('view_incidents')).toBe('View Incidents')
    })
  })

  describe('normalizeSearchTerm', () => {
    it('removes accents and lowercases', async () => {
      const { normalizeSearchTerm } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(normalizeSearchTerm('CRÍTICA')).toBe('critica')
    })
  })

  describe('formatModuleLabel', () => {
    it('maps known keys', async () => {
      const { formatModuleLabel } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(formatModuleLabel('incidents')).toBe('Incidencias')
      expect(formatModuleLabel('dashboard')).toBe('Panel principal')
    })

    it('falls back to humanized version', async () => {
      const { formatModuleLabel } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(formatModuleLabel('custom_module')).toBe('Custom Module')
    })
  })

  describe('formatPermissionLabel', () => {
    it('returns permission name when available', async () => {
      const { formatPermissionLabel } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(formatPermissionLabel({ name: 'View Incidents', code: 'view_incidents' })).toBe('View Incidents')
    })

    it('humanizes code when name missing', async () => {
      const { formatPermissionLabel } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(formatPermissionLabel({ code: 'view_incidents' })).toBe('View Incidents')
    })
  })

  describe('flattenNavigationItems', () => {
    it('flattens nested items', async () => {
      const { flattenNavigationItems } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const items = [
        { label: 'A', children: [{ label: 'B' }, { label: 'C' }] },
        { label: 'D' }
      ]
      const flattened = flattenNavigationItems(items)
      expect(flattened).toHaveLength(4)
    })
  })

  describe('canShowNavigationItem', () => {
    it('returns true when no permission required', async () => {
      const { canShowNavigationItem } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(canShowNavigationItem({}, new Set())).toBe(true)
    })

    it('returns false when permission not in set', async () => {
      const { canShowNavigationItem } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(canShowNavigationItem({ permission: 'admin' }, new Set())).toBe(false)
    })

    it('returns true when permission is in set', async () => {
      const { canShowNavigationItem } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(canShowNavigationItem({ permission: 'admin' }, new Set(['admin']))).toBe(true)
    })
  })

  describe('buildAuthorizedNavigationPreview', () => {
    it('filters items without permission', async () => {
      const { buildAuthorizedNavigationPreview } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const items = [
        { label: 'Dashboard', permission: 'view_dashboard' },
        { label: 'Admin', permission: 'view_admin' }
      ]
      const result = buildAuthorizedNavigationPreview(items, new Set(['view_dashboard']))
      expect(result).toHaveLength(1)
      expect(result[0].label).toBe('Dashboard')
    })
  })

  describe('countNavigationPermissions', () => {
    it('counts items with routes', async () => {
      const { countNavigationPermissions } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const items = [
        { label: 'Dashboard', permission: 'view_dashboard', route: '/dashboard' },
        { label: 'Users', permission: 'view_users', route: '/users' }
      ]
      expect(countNavigationPermissions(items, new Set(['view_dashboard']))).toBe(1)
    })
  })

  describe('buildNavigationPermissionIndex', () => {
    it('builds map of permission to navigation entries', async () => {
      const { buildNavigationPermissionIndex } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const items = [
        { label: 'Dashboard', permission: 'view_dashboard', route: '/dashboard' },
        {
          label: 'Settings',
          children: [
            { label: 'Users', permission: 'view_users', route: '/settings/users' }
          ]
        }
      ]
      const index = buildNavigationPermissionIndex(items)
      expect(index.get('view_dashboard')).toHaveLength(1)
      expect(index.get('view_users')).toHaveLength(1)
      expect(index.get('view_users')[0].label).toContain('Settings')
    })
  })

  describe('filterPermissionModules', () => {
    it('filters by showNavigationOnly', async () => {
      const { filterPermissionModules } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const modules = { incidents: [{ code: 'view', name: 'View' }] }
      const navIndex = new Map([['view', [{ label: 'Incidents', route: '/incidents' }]]])
      const state = { showNavigationOnly: true, permissionSearchTerm: '' }
      const result = filterPermissionModules(modules, navIndex, state)
      expect(result).toHaveLength(1)
    })

    it('excludes modules with no navigation when showNavigationOnly', async () => {
      const { filterPermissionModules } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const modules = { reports: [{ code: 'export', name: 'Export' }] }
      const navIndex = new Map()
      const state = { showNavigationOnly: true, permissionSearchTerm: '' }
      expect(filterPermissionModules(modules, navIndex, state)).toHaveLength(0)
    })
  })

  describe('cssEscape', () => {
    it('escapes backslash and double-quote', async () => {
      const { cssEscape } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(cssEscape('test"value\\')).toContain('\\"')
    })
  })

  describe('renderRoleOverview', () => {
    it('generates role overview HTML', async () => {
      const { renderRoleOverview } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const role = { code: 'ADMIN', name: 'Administrador' }
      const selected = new Set(['perm1', 'perm2'])
      const preview = [{ label: 'Dashboard', icon: 'fa-dashboard', children: [{ label: 'Home', route: '/' }] }]
      const html = renderRoleOverview(role, selected, preview, 1)
      expect(html).toContain('Administrador')
      expect(html).toContain('2')
      expect(html).toContain('Dashboard')
    })
  })

  describe('renderPermissionToolbar', () => {
    it('builds toolbar with search and checkbox', async () => {
      const { renderPermissionToolbar } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const state = { permissionSearchTerm: 'test', showNavigationOnly: true }
      const html = renderPermissionToolbar(state)
      expect(html).toContain('permission-search')
      expect(html).toContain('checked')
      expect(html).toContain('test')
    })
  })
})
