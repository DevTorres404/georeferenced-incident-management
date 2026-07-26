import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../app/js/modules/roles/application/access-control-service.js', () => ({
  getAccessControlOverview: vi.fn(),
  updateRoleAccess: vi.fn()
}))

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn()
}))

vi.mock('../app/js/shared/validators/validation-utils.js', () => ({
  handleBackendErrors: vi.fn(),
  setFormAlert: vi.fn()
}))

import { getAccessControlOverview, updateRoleAccess } from '../app/js/modules/roles/application/access-control-service.js'
import { hidePageLoading, showPageLoading } from '../app/js/modules/incidents/presentation/incidents-ui.js'
import { handleBackendErrors, setFormAlert } from '../app/js/shared/validators/validation-utils.js'

const MOCK_PERMISSIONS = {
  incidents: [
    { code: 'view_incidents', name: 'Ver incidencias', description: 'Listado de incidencias', module: 'incidents' },
    { code: 'create_incidents', name: 'Crear incidencias', description: 'Crear nuevas', module: 'incidents' }
  ],
  users: [
    { code: 'view_users', name: 'Ver usuarios', description: 'Listado de usuarios', module: 'users' }
  ],
  dashboard: [
    { code: 'view_dashboard', name: 'Ver dashboard', module: 'dashboard' }
  ]
}

const MOCK_NAV_ITEMS = [
  { code: 'dashboard', label: 'Dashboard', icon: 'fa-dashboard', route: '/dashboard', permission: 'view_dashboard', children: [] },
  {
    code: 'incident-hub', label: 'Incidencias', icon: 'fa-list', route: '',
    children: [
      { code: 'incidents', label: 'Todas', route: '/incidents', permission: 'view_incidents', children: [] }
    ]
  }
]

const MOCK_ROLES = [
  {
    id: 1, code: 'ADMIN', name: 'Administrador', description: 'Acceso completo',
    permissions: [
      { code: 'view_incidents' },
      { code: 'create_incidents' },
      { code: 'view_users' },
      { code: 'view_dashboard' }
    ]
  },
  {
    id: 2, code: 'OPERADOR', name: 'Operador', description: 'Atención operativa',
    permissions: [{ code: 'view_incidents' }]
  }
]

const MOCK_OVERVIEW = { roles: MOCK_ROLES, permissionsByModule: MOCK_PERMISSIONS, navigationItems: MOCK_NAV_ITEMS }

const DOM_FIXTURE = `
<div id="access-alert" class="d-none"></div>
<div id="role-list"></div>
<div id="permission-matrix"></div>
<button id="save-role-permissions-btn" type="button" class="btn btn-primary">
  <i class="fas fa-save mr-1"></i> Guardar Permisos
</button>
`

const BASE_STATE = {
  roles: [],
  permissionsByModule: {},
  navigationItems: [],
  selectedRoleCode: null,
  permissionSearchTerm: '',
  showNavigationOnly: false,
  searchRenderTimer: null,
  keepSearchFocus: false
}

describe('role-permissions-page — integration', () => {
  let domListeners

  beforeEach(() => {
    domListeners = []
    const origAdd = document.addEventListener.bind(document)
    vi.spyOn(document, 'addEventListener').mockImplementation((type, handler, ...rest) => {
      domListeners.push({ type, handler })
      return origAdd(type, handler, ...rest)
    })

    vi.resetModules()
    document.body.innerHTML = DOM_FIXTURE
    localStorage.clear()

    globalThis.renderLayout = vi.fn()

    vi.mocked(getAccessControlOverview).mockReset()
    vi.mocked(updateRoleAccess).mockReset()
    vi.mocked(showPageLoading).mockReset()
    vi.mocked(hidePageLoading).mockReset()
    vi.mocked(handleBackendErrors).mockReset()
    vi.mocked(setFormAlert).mockReset()
  })

  afterEach(() => {
    domListeners.forEach(({ type, handler }) => {
      document.removeEventListener(type, handler)
    })
    domListeners = []

    document.body.innerHTML = ''
    delete globalThis.renderLayout
    vi.restoreAllMocks()
  })

  describe('module exports', () => {
    it('exports all public functions', async () => {
      const mod = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(mod.initRolePermissionsPage).toBeTypeOf('function')
      expect(mod.renderRoles).toBeTypeOf('function')
      expect(mod.renderPermissions).toBeTypeOf('function')
      expect(mod.saveRolePermissions).toBeTypeOf('function')
      expect(mod.renderRoleOverview).toBeTypeOf('function')
      expect(mod.renderPermissionToolbar).toBeTypeOf('function')
      expect(mod.selectedRole).toBeTypeOf('function')
      expect(mod.emptyState).toBeTypeOf('function')
      expect(mod.escapeHtml).toBeTypeOf('function')
      expect(mod.getRoleDescription).toBeTypeOf('function')
      expect(mod.humanizeCode).toBeTypeOf('function')
      expect(mod.normalizeSearchTerm).toBeTypeOf('function')
      expect(mod.filterPermissionModules).toBeTypeOf('function')
      expect(mod.buildAuthorizedNavigationPreview).toBeTypeOf('function')
      expect(mod.flattenNavigationItems).toBeTypeOf('function')
      expect(mod.buildNavigationPermissionIndex).toBeTypeOf('function')
      expect(mod.canShowNavigationItem).toBeTypeOf('function')
      expect(mod.countNavigationPermissions).toBeTypeOf('function')
      expect(mod.formatModuleLabel).toBeTypeOf('function')
      expect(mod.formatPermissionLabel).toBeTypeOf('function')
      expect(mod.cssEscape).toBeTypeOf('function')
      expect(mod.escapeAttr).toBeTypeOf('function')
    })
  })

  describe('DOMContentLoaded init', () => {
    it('fetches overview, renders roles and permissions, calls renderLayout', async () => {
      vi.mocked(getAccessControlOverview).mockResolvedValue(MOCK_OVERVIEW)

      await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      document.dispatchEvent(new Event('DOMContentLoaded'))

      await vi.waitFor(() => {
        expect(globalThis.renderLayout).toHaveBeenCalledWith('role-permissions')
      })

      expect(getAccessControlOverview).toHaveBeenCalledOnce()
      expect(showPageLoading).toHaveBeenCalledWith('Cargando accesos', 'Consultando roles y permisos...')

      const roleList = document.getElementById('role-list')
      expect(roleList.innerHTML).toContain('Administrador')
      expect(roleList.innerHTML).toContain('Operador')

      const permMatrix = document.getElementById('permission-matrix')
      expect(permMatrix.innerHTML).toContain('Incidencias')
      expect(permMatrix.innerHTML).toContain('Ver incidencias')
      expect(permMatrix.innerHTML).toContain('Ver usuarios')
      expect(permMatrix.innerHTML).toContain('Panel principal')

      expect(hidePageLoading).toHaveBeenCalled()
    })

    it('calls handleBackendErrors on fetch failure', async () => {
      const apiError = new Error('Network error')
      vi.mocked(getAccessControlOverview).mockRejectedValue(apiError)

      await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      document.dispatchEvent(new Event('DOMContentLoaded'))

      await vi.waitFor(() => {
        expect(handleBackendErrors).toHaveBeenCalledWith(
          apiError,
          null,
          document.getElementById('access-alert')
        )
      })

      expect(hidePageLoading).toHaveBeenCalled()
    })

    it('does not crash when permission-matrix is missing from DOM', async () => {
      document.body.innerHTML = '<div id="role-list"></div>'
      vi.mocked(getAccessControlOverview).mockResolvedValue(MOCK_OVERVIEW)

      await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(() =>
        document.dispatchEvent(new Event('DOMContentLoaded'))
      ).not.toThrow()

      await vi.waitFor(() => {
        expect(hidePageLoading).toHaveBeenCalled()
      })
    })
  })

  describe('role list rendering', () => {
    it('renders role buttons with name, description and permission count', async () => {
      const { renderRoles } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      renderRoles({ roles: MOCK_ROLES, selectedRoleCode: 'ADMIN' })

      const buttons = document.querySelectorAll('[data-role-code]')
      expect(buttons).toHaveLength(2)
      expect(buttons[0].textContent).toContain('Administrador')
      expect(buttons[0].textContent).toContain('Administracion completa')
      expect(buttons[0].textContent).toContain('4')
      expect(buttons[1].textContent).toContain('Operador')
    })

    it('marks selected role as active', async () => {
      const { renderRoles } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      renderRoles({ roles: MOCK_ROLES, selectedRoleCode: 'OPERADOR' })

      const buttons = document.querySelectorAll('[data-role-code]')
      expect(buttons[0].classList.contains('active')).toBe(false)
      expect(buttons[1].classList.contains('active')).toBe(true)
    })

    it('renders empty container when no roles', async () => {
      const { renderRoles } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      renderRoles({ roles: [], selectedRoleCode: null })

      expect(document.getElementById('role-list').innerHTML).toBe('')
    })

    it('does nothing when role-list container is missing from DOM', async () => {
      document.body.innerHTML = DOM_FIXTURE
      document.getElementById('role-list').remove()

      const { renderRoles } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(() => renderRoles({ roles: MOCK_ROLES, selectedRoleCode: 'ADMIN' })).not.toThrow()
    })

    it('updates selectedRoleCode and re-renders on click', async () => {
      const mod = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const state = {
        ...BASE_STATE,
        roles: MOCK_ROLES,
        selectedRoleCode: 'ADMIN',
        permissionsByModule: MOCK_PERMISSIONS,
        navigationItems: MOCK_NAV_ITEMS
      }

      mod.renderRoles(state)
      mod.renderPermissions(state)

      expect(document.querySelectorAll('[data-role-code].active')).toHaveLength(1)
      expect(document.querySelector('[data-role-code="ADMIN"].active')).toBeTruthy()

      document.querySelector('[data-role-code="OPERADOR"]').click()

      expect(state.selectedRoleCode).toBe('OPERADOR')

      const buttons = document.querySelectorAll('[data-role-code]')
      expect(buttons[0].classList.contains('active')).toBe(false)
      expect(buttons[1].classList.contains('active')).toBe(true)
    })
  })

  describe('permissions matrix', () => {
    async function setupPermissions(roleIndex = 0) {
      const mod = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const state = {
        ...BASE_STATE,
        roles: [MOCK_ROLES[roleIndex]],
        permissionsByModule: MOCK_PERMISSIONS,
        navigationItems: MOCK_NAV_ITEMS,
        selectedRoleCode: MOCK_ROLES[roleIndex].code
      }
      mod.renderPermissions(state)
      return { mod, state }
    }

    it('renders checkboxes grouped by module', async () => {
      await setupPermissions()

      const checkboxes = document.querySelectorAll('.permission-checkbox')
      expect(checkboxes).toHaveLength(4)

      const modules = document.querySelectorAll('.permission-module')
      expect(modules).toHaveLength(3)
    })

    it('checks checkboxes matching role permissions', async () => {
      await setupPermissions()

      const checked = document.querySelectorAll('.permission-checkbox:checked')
      expect(checked).toHaveLength(4)
    })

    it('adds is-enabled class to permission cards for checked permissions', async () => {
      await setupPermissions()

      const cards = document.querySelectorAll('.permission-card')
      expect(cards).toHaveLength(4)
      cards.forEach(card => {
        expect(card.classList.contains('is-enabled')).toBe(true)
      })
    })

    it('renders all checkboxes unchecked when role has no permissions', async () => {
      const mod = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const state = {
        ...BASE_STATE,
        roles: [{ id: 3, code: 'ROL_SIN_PERMISOS', name: 'Sin Permisos', permissions: [] }],
        permissionsByModule: MOCK_PERMISSIONS,
        navigationItems: MOCK_NAV_ITEMS,
        selectedRoleCode: 'ROL_SIN_PERMISOS'
      }
      mod.renderPermissions(state)

      const checked = document.querySelectorAll('.permission-checkbox:checked')
      expect(checked).toHaveLength(0)

      const checkboxes = document.querySelectorAll('.permission-checkbox')
      expect(checkboxes).toHaveLength(4)
    })

    it('renders toggle buttons per module', async () => {
      await setupPermissions()

      const toggles = document.querySelectorAll('.js-toggle-module')
      expect(toggles).toHaveLength(3)
    })

    it('toggle button unchecks all checkboxes in its module then re-checks them', async () => {
      await setupPermissions()

      const toggleBtn = document.querySelector('.js-toggle-module[data-module="incidents"]')
      toggleBtn.click()

      const incidentsBoxes = document.querySelectorAll('.permission-checkbox[data-module="incidents"]')
      incidentsBoxes.forEach(cb => expect(cb.checked).toBe(false))

      toggleBtn.click()
      incidentsBoxes.forEach(cb => expect(cb.checked).toBe(true))
    })

    it('toggle button handles mixed state (some checked, some unchecked)', async () => {
      await setupPermissions()

      const incidentsBoxes = document.querySelectorAll('.permission-checkbox[data-module="incidents"]')

      incidentsBoxes[0].checked = false

      const toggleBtn = document.querySelector('.js-toggle-module[data-module="incidents"]')
      toggleBtn.click()

      incidentsBoxes.forEach(cb => expect(cb.checked).toBe(true))

      toggleBtn.click()
      incidentsBoxes.forEach(cb => expect(cb.checked).toBe(false))
    })

    it('shows empty state when no role selected', async () => {
      const mod = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const state = { ...BASE_STATE, permissionsByModule: MOCK_PERMISSIONS, navigationItems: MOCK_NAV_ITEMS }
      mod.renderPermissions(state)

      expect(document.getElementById('permission-matrix').innerHTML).toContain('No hay roles disponibles.')
    })

    it('shows empty state when permissionsByModule is empty', async () => {
      const mod = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const state = {
        ...BASE_STATE,
        roles: [MOCK_ROLES[0]],
        permissionsByModule: {},
        navigationItems: MOCK_NAV_ITEMS,
        selectedRoleCode: 'ADMIN'
      }
      mod.renderPermissions(state)

      expect(document.getElementById('permission-matrix').innerHTML).toContain('No hay permisos')
    })
  })

  describe('role selection updates permissions', () => {
    it('renders permissions matching the newly selected role', async () => {
      const mod = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const state = {
        ...BASE_STATE,
        roles: MOCK_ROLES,
        permissionsByModule: MOCK_PERMISSIONS,
        navigationItems: MOCK_NAV_ITEMS,
        selectedRoleCode: 'ADMIN'
      }

      mod.renderRoles(state)
      mod.renderPermissions(state)

      expect(document.querySelectorAll('.permission-checkbox:checked')).toHaveLength(4)

      document.querySelector('[data-role-code="OPERADOR"]').click()

      expect(state.selectedRoleCode).toBe('OPERADOR')

      const checkedAfter = document.querySelectorAll('.permission-checkbox:checked')
      expect(checkedAfter).toHaveLength(1)
      expect(checkedAfter[0].value).toBe('view_incidents')
    })
  })

  describe('save permissions', () => {
    async function initFullPage() {
      vi.mocked(getAccessControlOverview).mockResolvedValue(MOCK_OVERVIEW)
      vi.mocked(updateRoleAccess).mockResolvedValue({
        message: 'Accesos actualizados correctamente.',
        data: {
          role: MOCK_ROLES[0],
          navigationItems: MOCK_NAV_ITEMS
        }
      })

      await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      document.dispatchEvent(new Event('DOMContentLoaded'))

      await vi.waitFor(() => {
        expect(getAccessControlOverview).toHaveBeenCalled()
      })
    }

    it('saves checked permissions and visible screens together', async () => {
      await initFullPage()

      document.getElementById('save-role-permissions-btn').click()

      await vi.waitFor(() => {
        expect(updateRoleAccess).toHaveBeenCalledWith(
          1,
          ['view_incidents', 'create_incidents', 'view_users', 'view_dashboard', 'users.manage_roles'],
          ['dashboard', 'incidents', 'role-permissions']
        )
      })
    })

    it('shows success alert after save', async () => {
      await initFullPage()

      document.getElementById('save-role-permissions-btn').click()

      await vi.waitFor(() => {
        expect(setFormAlert).toHaveBeenCalledWith(
          document.getElementById('access-alert'),
          expect.stringContaining('actualizados'),
          'success'
        )
      })
    })

    it('shows loading state and hides it after save', async () => {
      await initFullPage()

      document.getElementById('save-role-permissions-btn').click()

      await vi.waitFor(() => {
        expect(showPageLoading).toHaveBeenCalledWith(
          'Guardando accesos',
          'Actualizando permisos y pantallas del rol...'
        )
      })

      await vi.waitFor(() => {
        expect(hidePageLoading).toHaveBeenCalled()
      })
    })

    it('calls handleBackendErrors on save failure', async () => {
      vi.mocked(getAccessControlOverview).mockResolvedValue(MOCK_OVERVIEW)
      const apiError = new Error('Validation error')
      apiError.status = 422
      vi.mocked(updateRoleAccess).mockRejectedValue(apiError)

      await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      document.dispatchEvent(new Event('DOMContentLoaded'))

      await vi.waitFor(() => {
        expect(getAccessControlOverview).toHaveBeenCalled()
      })

      document.getElementById('save-role-permissions-btn').click()

      await vi.waitFor(() => {
        expect(handleBackendErrors).toHaveBeenCalledWith(
          apiError,
          null,
          document.getElementById('access-alert')
        )
      })
    })

    it('is a no-op when no role is selected', async () => {
      const { saveRolePermissions } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      await saveRolePermissions({ roles: [], selectedRoleCode: null })

      expect(updateRoleAccess).not.toHaveBeenCalled()
      expect(showPageLoading).not.toHaveBeenCalled()
    })
  })

  describe('permission search filter', () => {
    it('updates permissionSearchTerm on input and triggers debounced re-render', async () => {
      const mod = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const state = {
        ...BASE_STATE,
        roles: [MOCK_ROLES[0]],
        permissionsByModule: MOCK_PERMISSIONS,
        navigationItems: MOCK_NAV_ITEMS,
        selectedRoleCode: 'ADMIN'
      }

      mod.renderPermissions(state)

      const searchInput = document.getElementById('permission-search-input')
      searchInput.value = 'usuarios'
      searchInput.dispatchEvent(new Event('input'))

      expect(state.permissionSearchTerm).toBe('usuarios')
      expect(state.keepSearchFocus).toBe(true)

      await vi.waitFor(() => {
        expect(state.keepSearchFocus).toBe(false)
      }, { timeout: 500 })
    })

    it('filters permission modules by search term matching permission name', async () => {
      const { filterPermissionModules } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const navIndex = new Map()
      const state = { showNavigationOnly: false, permissionSearchTerm: 'usuarios' }

      const result = filterPermissionModules(MOCK_PERMISSIONS, navIndex, state)
      expect(result).toHaveLength(1)
      expect(result[0][0]).toBe('users')
    })

    it('filters permission modules by search term matching module name', async () => {
      const { filterPermissionModules } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const navIndex = new Map()
      const state = { showNavigationOnly: false, permissionSearchTerm: 'dashboard' }

      const result = filterPermissionModules(MOCK_PERMISSIONS, navIndex, state)
      expect(result).toHaveLength(1)
      expect(result[0][0]).toBe('dashboard')
    })

    it('filters permission modules by search term matching navigation label', async () => {
      const { filterPermissionModules } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const navIndex = new Map([['view_incidents', [{ label: 'Incidencias / Todas', route: '/incidents' }]]])
      const state = { showNavigationOnly: false, permissionSearchTerm: 'Incidencias' }

      const result = filterPermissionModules(MOCK_PERMISSIONS, navIndex, state)
      expect(result).toHaveLength(1)
      expect(result[0][0]).toBe('incidents')
    })
  })

  describe('navigation-only filter', () => {
    it('toggles showNavigationOnly on checkbox change and re-renders', async () => {
      const mod = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const state = {
        ...BASE_STATE,
        roles: [MOCK_ROLES[0]],
        permissionsByModule: MOCK_PERMISSIONS,
        navigationItems: MOCK_NAV_ITEMS,
        selectedRoleCode: 'ADMIN'
      }

      mod.renderPermissions(state)

      const navCheckbox = document.getElementById('permission-navigation-only')
      expect(state.showNavigationOnly).toBe(false)

      navCheckbox.checked = true
      navCheckbox.dispatchEvent(new Event('change'))

      expect(state.showNavigationOnly).toBe(true)
    })

    it('excludes modules where no permission has navigation entries', async () => {
      const { filterPermissionModules } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const navIndex = new Map([['view_incidents', [{ label: 'Incidencias', route: '/incidents' }]]])
      const state = { showNavigationOnly: true, permissionSearchTerm: '' }

      const result = filterPermissionModules(MOCK_PERMISSIONS, navIndex, state)
      expect(result).toHaveLength(1)
      expect(result[0][0]).toBe('incidents')
    })
  })

  describe('renderRoleOverview edge cases', () => {
    it('shows empty state message when navigation preview is empty', async () => {
      const { renderRoleOverview } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const role = { code: 'SIN_ACCESO', name: 'Sin Acceso' }
      const html = renderRoleOverview(role, new Set(), [], 0)

      expect(html).toContain('Sin Acceso')
      expect(html).toContain('no tiene pantallas visibles')
    })

    it('renders navigation preview with grouped items', async () => {
      const { renderRoleOverview } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const role = { code: 'ADMIN', name: 'Administrador' }
      const selected = new Set(['view_dashboard', 'view_incidents'])
      const preview = [
        {
          label: 'Dashboard', icon: 'fa-dashboard',
          children: [{ label: 'Inicio', route: '/dashboard' }]
        },
        {
          label: 'Incidencias', icon: 'fa-list',
          children: [
            { label: 'Todas', route: '/incidents' },
            { label: 'Nueva', route: '/incidents/create' }
          ]
        }
      ]
      const html = renderRoleOverview(role, selected, preview, 6)

      expect(html).toContain('Dashboard')
      expect(html).toContain('Incidencias')
      expect(html).toContain('Todas / Nueva')
      expect(html).toContain('fa-dashboard')
      expect(html).toContain('fa-list')
    })
  })

  describe('renderPermissionToolbar edge cases', () => {
    it('renders toolbar without search term and unchecked filter', async () => {
      const { renderPermissionToolbar } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const state = { permissionSearchTerm: '', showNavigationOnly: false }
      const html = renderPermissionToolbar(state)

      expect(html).toContain('permission-search')
      expect(html).not.toContain('checked')
    })
  })

  describe('buildAuthorizedNavigationPreview', () => {
    it('handles deeply nested items with mixed permissions', async () => {
      const { buildAuthorizedNavigationPreview } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const items = [
        {
          label: 'Settings',
          children: [
            { label: 'Users', permission: 'view_users', children: [] },
            { label: 'Roles', permission: 'view_roles', children: [] }
          ]
        }
      ]
      const result = buildAuthorizedNavigationPreview(items, new Set(['view_users']))
      expect(result).toHaveLength(1)
      expect(result[0].label).toBe('Settings')
      expect(result[0].children).toHaveLength(1)
      expect(result[0].children[0].label).toBe('Users')
    })

    it('filters out parent when no children are authorized', async () => {
      const { buildAuthorizedNavigationPreview } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const items = [
        {
          label: 'Admin',
          children: [
            { label: 'Users', permission: 'view_users', children: [] }
          ]
        }
      ]
      const result = buildAuthorizedNavigationPreview(items, new Set())
      expect(result).toHaveLength(0)
    })
  })

  describe('countNavigationPermissions', () => {
    it('returns 0 for empty items', async () => {
      const { countNavigationPermissions } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(countNavigationPermissions([], new Set())).toBe(0)
    })
  })

  describe('flattenNavigationItems', () => {
    it('returns empty array for empty input', async () => {
      const { flattenNavigationItems } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(flattenNavigationItems([])).toEqual([])
    })
  })

  describe('buildNavigationPermissionIndex', () => {
    it('skips items without permission', async () => {
      const { buildNavigationPermissionIndex } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const items = [
        { label: 'Public', route: '/public' }
      ]
      const index = buildNavigationPermissionIndex(items)
      expect(index.size).toBe(0)
    })

    it('indexes deeply nested children with permission', async () => {
      const { buildNavigationPermissionIndex } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const items = [
        {
          label: 'Settings',
          children: [
            { label: 'Security', children: [
              { label: 'Users', permission: 'view_users', route: '/settings/users' }
            ] }
          ]
        }
      ]
      const index = buildNavigationPermissionIndex(items)
      expect(index.get('view_users')).toHaveLength(1)
      expect(index.get('view_users')[0].label).toBe('Settings / Security / Users')
    })
  })

  describe('utility functions', () => {
    it('escapeHtml handles null and undefined', async () => {
      const { escapeHtml } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(escapeHtml(null)).toBe('')
      expect(escapeHtml()).toBe('')
    })

    it('escapeAttr escapes double-quotes and handles null', async () => {
      const { escapeAttr } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(escapeAttr('test"value')).toContain('&quot;')
      expect(escapeAttr(null)).toBe('')
    })

    it('normalizeSearchTerm handles null, undefined and empty', async () => {
      const { normalizeSearchTerm } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(normalizeSearchTerm(null)).toBe('')
      expect(normalizeSearchTerm()).toBe('')
      expect(normalizeSearchTerm('')).toBe('')
    })

    it('formatModuleLabel handles null and undefined', async () => {
      const { formatModuleLabel } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(formatModuleLabel(null)).toBe('')
      expect(formatModuleLabel()).toBe('')
    })

    it('cssEscape escapes quotes and backslash', async () => {
      const { cssEscape } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      const result = cssEscape('test"value\\')
      expect(result).toContain('\\"')
      expect(result).toContain('\\\\')
    })

    it('selectedRole returns null for empty roles array', async () => {
      const { selectedRole } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(selectedRole({ roles: [], selectedRoleCode: 'ADMIN' })).toBeNull()
    })

    it('getRoleDescription returns fallback for unknown codes', async () => {
      const { getRoleDescription } = await import('../app/js/modules/roles/presentation/role-permissions-page.js')
      expect(getRoleDescription('UNKNOWN')).toBe('Rol del sistema')
      expect(getRoleDescription(null)).toBe('Rol del sistema')
      expect(getRoleDescription()).toBe('Rol del sistema')
    })
  })
})
