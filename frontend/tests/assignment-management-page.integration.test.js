import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Mock transport layer so no real HTTP calls are made
vi.mock('../app/js/infrastructure/backend-client.js', () => ({
  request: vi.fn(),
  requestAfter: vi.fn(),
  clearApiCache: vi.fn()
}))

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  escapeHtml: v => String(v ?? ''),
  formatCatalogLabel: v => {
    if (!v) {
      return '-'
    }

    const m = {
      EN_REVISION: 'En revisión', EN_PROGRESO: 'En progreso',
      NUEVA: 'Nueva', PENDIENTE: 'Pendiente',
      RESUELTA: 'Resuelta', CERRADA: 'Resuelta', RECHAZADA: 'Rechazada'
    }
    return m[String(v).toUpperCase().trim()] || String(v).replace(/_/g, ' ').trim()
  },
  formatShortDate: v => {
    if (!v) {
      return '-'
    }

    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
  },
  getPriorityBadgeClass: () => 'badge-info',
  getStateBadgeClass: () => 'badge-info',
  getStateHexColor: vi.fn(() => '#000000'),
  getPriorityHexColor: vi.fn(() => '#000000'),
  showGlobalAlert: vi.fn(msg => console.log('showGlobalAlert called with:', msg)),
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn()
}))

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const OPERATORS = [
  { user_id: 10, full_name: 'Juan Pérez', email: 'juan@test.com', available: true, active_incidents: 3, max_active_incidents: 10, workload_points: 15, max_workload_points: 50 },
  { user_id: 11, full_name: 'Ana Gómez', email: 'ana@test.com', available: true, active_incidents: 5, max_active_incidents: 10, workload_points: 25, max_workload_points: 50 },
  { user_id: 12, full_name: 'Carlos Ruiz', email: 'carlos@test.com', available: false, active_incidents: 10, max_active_incidents: 10, workload_points: 50, max_workload_points: 50 }
]

const INCIDENT_WITH_ASSIGNMENTS = {
  id: 1,
  code: 'INC-001',
  title: 'Fuga de agua principal',
  priority_id: 3,
  priority: { id: 3, name: 'Crítica' },
  state_id: 3,
  state: { id: 3, name: 'En Progreso' },
  category: { name: 'Hidráulica' },
  zone_name: 'Zona Norte',
  territorial_unit: { full_path: 'Provincia > Cantón > Parroquia' },
  created_at: '2024-01-15T10:00:00Z',
  due_date: '2024-01-20T10:00:00Z',
  assignee_user_id: 10,
  assignments: [
    { user_id: 10, full_name: 'Juan Pérez', assignment_role: 'primary' },
    { user_id: 11, full_name: 'Ana Gómez', assignment_role: 'support' }
  ]
}

const INCIDENT_UNASSIGNED = {
  id: 2,
  code: 'INC-002',
  title: 'Bache en calle',
  priority_id: 2,
  priority: { id: 2, name: 'Alta' },
  state_id: 3,
  state: { id: 3, name: 'En Progreso' },
  category: { name: 'Vialidad' },
  zone_name: 'Zona Sur',
  territorial_unit: { full_path: 'Provincia > Cantón' },
  created_at: '2024-02-01T08:00:00Z',
  due_date: null,
  assignee_user_id: null,
  assignments: []
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const flush = () => new Promise(r => setTimeout(r, 0))

function insertPageFixtures() {
  document.body.innerHTML = `
    <a id="assignmentBackLink"><span id="assignmentBackLinkLabel"></span></a>
    <input id="filterSearch">
    <select id="filterPriority"><option value="">Todos</option></select>
    <select id="filterState"><option value="">Todos</option></select>
    <select id="filterCategory"><option value="">Todos</option></select>
    <div id="territoryFilterGroup">
      <select id="filterTerritory"><option value="">Todos</option></select>
    </div>
    <select id="filterOperator"><option value="">Todos</option></select>
    <button id="btnResetFilters"></button>
    <div id="assignmentKpis"></div>
    <div id="zoneBannerWrapper" style="display:none"><span id="zoneBannerName"></span></div>
    <div id="assignmentSubtitle"></div>
    <table><tbody id="assignmentTableBody"></tbody></table>
    <div id="assignmentModal">
      <div id="assignmentModalSummary"></div>
      <select id="primaryOperatorSelect"></select>
      <div id="supportOperatorsList"></div>
      <button id="btnSaveAssignment"></button>
    </div>
  `
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------
describe('assignment-management-page.js — integration', () => {
  let mod
  let backendClient

  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: ['ADMIN'], permissions: ['incidents.list', 'incidents.assign'] }))
    globalThis.renderLayout = vi.fn()
    globalThis.$ = vi.fn(() => ({
      DataTable: vi.fn(() => ({ clear: vi.fn().mockReturnThis(), destroy: vi.fn().mockReturnThis() }))
    }))
    globalThis.$.fn = { DataTable: { isDataTable: vi.fn(() => true) } }

    insertPageFixtures()

    mod = await import('../app/js/modules/incidents/presentation/assignment-management-page.js')
    backendClient = await import('../app/js/infrastructure/backend-client.js')
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    delete globalThis.renderLayout
  })

  // ====================================================================
  // 1. Module exports
  // ====================================================================
  describe('Module exports', () => {
    it('exports all expected functions', () => {
      const expected = [
        'fillSelect',
        'applyFilters',
        'renderKpis',
        'renderTable',
        'renderError',
        'uniqueValues',
        'readSessionUser',
        'userHasRole',
        'includesNormalized',
        'isResolvedState',
        'buildOperatorOptionLabel',
        'buildOperatorCapacityLabel',
        'initAssignmentManagementPage',
        'submitAssignment',
        'configureAssignmentBackLink'
      ]
      expected.forEach(name => {
        expect(mod[name]).toBeTypeOf('function')
      })
    })
  })

  // ====================================================================
  // 2. DOMContentLoaded init
  // ====================================================================
  describe('DOMContentLoaded init', () => {
    it('returns assignment-only supervisors to the dashboard', () => {
      mod.configureAssignmentBackLink({
        roles: ['SUPERVISOR'],
        permissions: ['incidents.assign']
      })

      expect(document.getElementById('assignmentBackLink').getAttribute('href')).toBe('dashboard.html')
      expect(document.getElementById('assignmentBackLinkLabel').textContent).toBe('Volver al panel')
    })

    it('loads incidents and operators, renders table and KPIs', async () => {
      backendClient.request.mockImplementation(url => {
        if (String(url).includes('assignment-operators')) {
          return Promise.resolve({ data: OPERATORS })
        }

        return Promise.resolve({ data: [INCIDENT_WITH_ASSIGNMENTS, INCIDENT_UNASSIGNED] })
      })

      await mod.initAssignmentManagementPage()
      await flush()

      // Two GET calls: /incidents?per_page=100 and /incidents/assignment-operators
      expect(backendClient.request).toHaveBeenCalledTimes(2)
      const { calls } = backendClient.request.mock
      expect(calls[0][0]).toContain('/incidents')
      expect(calls[1][0]).toContain('/incidents/assignment-operators')

      const tableHtml = document.getElementById('assignmentTableBody').innerHTML
      expect(tableHtml).toContain('INC-001')
      expect(tableHtml).toContain('INC-002')
      expect(tableHtml).toContain('Juan Pérez')
      expect(tableHtml).toContain('Ana Gómez')
      expect(tableHtml).toContain('Principal')
      expect(tableHtml).toContain('Apoyo')
      expect(tableHtml).toContain('Sin asignación')
      expect(tableHtml.match(/data-label=/g)).toHaveLength(18)
      expect(tableHtml).toContain('data-label="Operadores"')
      expect(tableHtml).toContain('data-label="Acciones"')
      expect(tableHtml).toContain('assignment-actions-buttons')

      const kpisHtml = document.getElementById('assignmentKpis').innerHTML
      expect(kpisHtml).toContain('Sin asignar')
      expect(kpisHtml).toContain('Criticas')
      expect(kpisHtml).toContain('Altas')
    })

    it('renders error when services fail', async () => {
      backendClient.request.mockRejectedValue(new Error('Network error'))

      await mod.initAssignmentManagementPage()
      await flush()

      const tableHtml = document.getElementById('assignmentTableBody').innerHTML
      expect(tableHtml).toContain('Network error')
      expect(tableHtml).toContain('text-danger')
    })

    it('handles missing data fields gracefully', async () => {
      backendClient.request.mockImplementation(url => {
        if (String(url).includes('assignment-operators')) {
          return Promise.resolve({ data: [] })
        }

        return Promise.resolve({ data: [{ id: 99 }] })
      })

      await mod.initAssignmentManagementPage()
      await flush()

      const tableHtml = document.getElementById('assignmentTableBody').innerHTML
      expect(tableHtml).toContain('#99')
      expect(tableHtml).toContain('Sin asignación')
    })
  })

  // ====================================================================
  // 3. Assignment table rendering
  // ====================================================================
  describe('renderTable integration', () => {
    it('renders full row with assignments', () => {
      mod.renderTable({
        filteredIncidents: [INCIDENT_WITH_ASSIGNMENTS]
      })

      const html = document.getElementById('assignmentTableBody').innerHTML
      expect(html).toContain('INC-001')
      expect(html).toContain('Fuga de agua principal')
      expect(html).toContain('Juan Pérez')
      expect(html).toContain('Ana Gómez')
      expect(html).toContain('Principal')
      expect(html).toContain('Apoyo')
      expect(html).toContain('Zona Norte')
      expect(html).toContain('data-open-assignment="1"')
      expect(html).toContain('Reasignar')
    })

    it('renders unassigned badge when incident has no operator', () => {
      mod.renderTable({
        filteredIncidents: [INCIDENT_UNASSIGNED]
      })

      const html = document.getElementById('assignmentTableBody').innerHTML
      expect(html).toContain('INC-002')
      expect(html).toContain('Sin asignación')
      expect(html).toContain('Asignar')
    })

    it('renders empty state when list is empty', () => {
      mod.renderTable({ filteredIncidents: [] })

      const html = document.getElementById('assignmentTableBody').innerHTML
      expect(html).toContain('No hay incidencias')
      expect(html).toContain('text-muted')
    })

    it('safely handles missing tbody element', () => {
      document.getElementById('assignmentTableBody').remove()
      expect(() => mod.renderTable({ filteredIncidents: [INCIDENT_WITH_ASSIGNMENTS] })).not.toThrow()
    })
  })

  // ====================================================================
  // 4. Submit assignment
  // ====================================================================
  describe('submitAssignment', () => {
    it('submits primary operator and support operators', async () => {
      const state = {
        selectedIncident: { id: 1, code: 'INC-001', title: 'Test' },
        incidents: [INCIDENT_WITH_ASSIGNMENTS],
        filteredIncidents: [INCIDENT_WITH_ASSIGNMENTS],
        operators: OPERATORS
      }
      document.getElementById('primaryOperatorSelect').innerHTML = OPERATORS.map(
        o => `<option value="${o.user_id}">${o.full_name}</option>`
      ).join('')
      document.getElementById('primaryOperatorSelect').value = '10'
      document.getElementById('supportOperatorsList').innerHTML = `
        <label><input type="checkbox" value="11" checked></label>
        <label><input type="checkbox" value="12"></label>
      `

      backendClient.request.mockResolvedValue({ data: [] })

      await mod.submitAssignment(state)
      await flush()

      expect(backendClient.request).toHaveBeenCalledWith(
        '/incidents/1/assignments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            primary_user_id: 10,
            support_user_ids: [11]
          })
        })
      )

      // After submit it re-fetches incidents
      const reloadCall = backendClient.request.mock.calls.find(
        c => c[0] === '/incidents?per_page=100'
      )
      expect(reloadCall).toBeTruthy()
    })

    it('shows warning when no primary operator is selected', async () => {
      const state = {
        selectedIncident: { id: 1, code: 'INC-001' },
        incidents: [],
        filteredIncidents: [],
        operators: []
      }
      document.getElementById('primaryOperatorSelect').innerHTML = '<option value="0">Seleccionar</option>'
      document.getElementById('primaryOperatorSelect').value = '0'

      await mod.submitAssignment(state)

      const { showGlobalAlert } = await import('../app/js/modules/incidents/presentation/incidents-ui.js')
      expect(showGlobalAlert).toHaveBeenCalledWith(expect.stringContaining('operador principal'), 'warning')
    })

    it('returns early when no selectedIncident', async () => {
      await mod.submitAssignment({ selectedIncident: null })

      expect(backendClient.request).not.toHaveBeenCalled()
    })

    it('shows error alert when assign fails', async () => {
      const state = {
        selectedIncident: { id: 1 },
        incidents: [],
        filteredIncidents: [],
        operators: []
      }
      document.getElementById('primaryOperatorSelect').innerHTML = '<option value="10">Juan</option>'
      document.getElementById('primaryOperatorSelect').value = '10'

      backendClient.request.mockRejectedValue(new Error('Server error'))

      await mod.submitAssignment(state)
      await flush()

      const { showGlobalAlert } = await import('../app/js/modules/incidents/presentation/incidents-ui.js')
      expect(showGlobalAlert).toHaveBeenCalledWith('Server error', 'danger')
    })
  })

  // ====================================================================
  // 5. Assignment modal lifecycle (full click-through)
  // ====================================================================
  describe('Assignment modal click-through', () => {
    it('opens modal, renders operators, and submits assignment', async () => {
      // Mock backend for init
      backendClient.request.mockImplementation((path, options) => {
        if (path.startsWith('/incidents?per_page')) {
          return Promise.resolve({ data: [INCIDENT_WITH_ASSIGNMENTS, INCIDENT_UNASSIGNED] })
        }

        if (path === '/incidents/assignment-operators') {
          return Promise.resolve({ data: OPERATORS })
        }

        if (path === '/incidents/1') {
          return Promise.resolve({ data: INCIDENT_WITH_ASSIGNMENTS })
        }

        if (path === '/incidents/1/assignments') {
          return Promise.resolve({})
        }

        return Promise.resolve({ data: [] })
      })

      await mod.initAssignmentManagementPage()
      await flush()

      const assignBtn = document.querySelector('[data-open-assignment="1"]')
      expect(assignBtn).toBeTruthy()
      assignBtn.removeAttribute('disabled')
      assignBtn.click()
      await flush()

      const summary = document.getElementById('assignmentModalSummary')
      expect(summary.innerHTML).toContain('INC-001')
      expect(summary.innerHTML).toContain('Fuga de agua principal')

      const primarySelect = document.getElementById('primaryOperatorSelect')
      expect(primarySelect.options.length).toBe(OPERATORS.length + 1)

      const checkboxes = document.querySelectorAll('#supportOperatorsList input[type="checkbox"]')
      expect(checkboxes.length).toBe(OPERATORS.length - 1)

      primarySelect.value = '10'
      const saveBtn = document.getElementById('btnSaveAssignment')
      saveBtn.removeAttribute('disabled')
      saveBtn.click()
      await flush()

      expect(backendClient.request).toHaveBeenCalledWith(
        '/incidents/1/assignments',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  // ====================================================================
  // 6. Search and filter
  // ====================================================================
  describe('Search and filter', () => {
    const ALL = [INCIDENT_WITH_ASSIGNMENTS, INCIDENT_UNASSIGNED]

    beforeEach(() => {
      mod.renderKpis(ALL, OPERATORS)
    })

    it('filters by search term matching code or title', () => {
      document.getElementById('filterSearch').value = 'INC-001'
      const state = { incidents: ALL, filteredIncidents: [...ALL], operators: OPERATORS }
      mod.applyFilters(state)
      expect(state.filteredIncidents).toHaveLength(1)
      expect(state.filteredIncidents[0].code).toBe('INC-001')
    })

    it('filters by priority', () => {
      document.getElementById('filterPriority').innerHTML = '<option value="">Todos</option><option value="crítica">Crítica</option>'
      document.getElementById('filterPriority').value = 'crítica'
      const state = { incidents: ALL, filteredIncidents: [...ALL], operators: OPERATORS }
      mod.applyFilters(state)
      expect(state.filteredIncidents).toHaveLength(1)
      expect(state.filteredIncidents[0].priority.name).toBe('Crítica')
    })

    it('filters by state', () => {
      document.getElementById('filterState').innerHTML = '<option value="">Todos</option><option value="En Progreso">En Progreso</option>'
      document.getElementById('filterState').value = 'En Progreso'

      const state = { incidents: ALL, filteredIncidents: [...ALL], operators: [] }
      mod.applyFilters(state)
      expect(state.filteredIncidents).toHaveLength(2) // Both are En Progreso now
      expect(state.filteredIncidents[0].state.name).toBe('En Progreso')
    })

    it('filters by territory', () => {
      document.getElementById('filterTerritory').innerHTML = '<option value="">Todos</option><option value="zona norte">Zona Norte</option>'
      document.getElementById('filterTerritory').value = 'zona norte'
      const state = { incidents: ALL, filteredIncidents: [...ALL], operators: OPERATORS }
      mod.applyFilters(state)
      expect(state.filteredIncidents).toHaveLength(1)
      expect(state.filteredIncidents[0].zone_name).toBe('Zona Norte')
    })

    it('filters by operator', () => {
      document.getElementById('filterOperator').innerHTML = OPERATORS.map(
        o => `<option value="${o.user_id}">${o.full_name}</option>`
      ).join('')
      document.getElementById('filterOperator').value = '10'
      const state = { incidents: ALL, filteredIncidents: [...ALL], operators: OPERATORS }
      mod.applyFilters(state)
      expect(state.filteredIncidents).toHaveLength(1)
      expect(state.filteredIncidents[0].id).toBe(1)
    })

    it('shows all when no operator assigned (filterOperator empty)', () => {
      document.getElementById('filterOperator').innerHTML = '<option value="">Todos</option>'
      document.getElementById('filterOperator').value = ''
      const state = { incidents: ALL, filteredIncidents: [...ALL], operators: OPERATORS }
      mod.applyFilters(state)
      expect(state.filteredIncidents).toHaveLength(2)
    })

    it('combines multiple filters', () => {
      document.getElementById('filterSearch').value = 'INC-002'
      document.getElementById('filterState').innerHTML = '<option value="">Todos</option><option value="en progreso">En Progreso</option>'
      document.getElementById('filterState').value = 'en progreso'
      const state = { incidents: ALL, filteredIncidents: [...ALL], operators: OPERATORS }
      mod.applyFilters(state)
      expect(state.filteredIncidents).toHaveLength(1)
      expect(state.filteredIncidents[0].code).toBe('INC-002')
    })

    it('resets all filters returns full list', () => {
      document.getElementById('filterSearch').value = 'INC-001'
      document.getElementById('filterPriority').innerHTML = '<option value="">Todos</option><option value="crítica">Crítica</option>'
      document.getElementById('filterPriority').value = 'crítica'
      const state = { incidents: ALL, filteredIncidents: [...ALL], operators: OPERATORS }
      mod.applyFilters(state)
      expect(state.filteredIncidents).toHaveLength(1)

      document.getElementById('filterSearch').value = ''
      document.getElementById('filterPriority').value = ''
      mod.applyFilters(state)
      expect(state.filteredIncidents).toHaveLength(2)
    })
  })

  // ====================================================================
  // 7. renderKpis integration
  // ====================================================================
  describe('renderKpis integration', () => {
    it('renders correct KPI values', () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString()
      const incidents = [
        { id: 1, assignee_user_id: null, priority: { name: 'Crítica' }, due_date: null, state: { name: 'Pendiente' } },
        { id: 2, assignee_user_id: 5, priority: { name: 'Alta' }, due_date: pastDate, state: { name: 'Pendiente' } },
        { id: 3, assignee_user_id: null, priority: { name: 'Alta' }, due_date: null, state: {} }
      ]

      mod.renderKpis(incidents, OPERATORS)
      const html = document.getElementById('assignmentKpis').innerHTML

      expect(html).toContain('Sin asignar')
      expect(html).toContain('Criticas')
      expect(html).toContain('Altas')
      expect(html).toContain('Vencidas')
      expect(html).toContain('Operadores disponibles')
    })

    it('counts only non-resolved overdue incidents as vencidas', () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString()
      const incidents = [
        { id: 1, due_date: pastDate, state: { name: 'Resuelta' }, assignee_user_id: 5, priority: {} },
        { id: 2, due_date: pastDate, state: { name: 'Pendiente' }, assignee_user_id: 5, priority: {} }
      ]

      mod.renderKpis(incidents, OPERATORS)
      const html = document.getElementById('assignmentKpis').innerHTML
      const match = html.match(/Vencidas[\S\s]*?<strong>(\d+)<\/strong>/)
      expect(match).toBeTruthy()
      expect(match[1]).toBe('1')
    })

    it('counts available operators', () => {
      const incidents = []
      mod.renderKpis(incidents, OPERATORS)
      const html = document.getElementById('assignmentKpis').innerHTML
      const match = html.match(/Operadores disponibles[\S\s]*?<strong>(\d+)<\/strong>/)
      expect(match).toBeTruthy()
      expect(match[1]).toBe('2')
    })
  })

  // ====================================================================
  // 8. renderError integration
  // ====================================================================
  describe('renderError integration', () => {
    it('shows error message in table body', () => {
      mod.renderError('Algo salió mal')
      const html = document.getElementById('assignmentTableBody').innerHTML
      expect(html).toContain('Algo salió mal')
      expect(html).toContain('text-danger')
      expect(html).toContain('fa-exclamation-circle')
    })

    it('safely handles missing tbody', () => {
      document.getElementById('assignmentTableBody').remove()
      expect(() => mod.renderError('error')).not.toThrow()
    })
  })

  // ====================================================================
  // 9. fillSelect integration
  // ====================================================================
  describe('fillSelect integration', () => {
    it('preserves first option and appends values', () => {
      mod.fillSelect('filterPriority', ['Crítica', 'Alta', 'Media'])
      const select = document.getElementById('filterPriority')
      expect(select.options.length).toBe(4)
      expect(select.options[0].value).toBe('')
      expect(select.options[1].value).toBe('Crítica')
      expect(select.options[2].value).toBe('Alta')
      expect(select.options[3].value).toBe('Media')
    })
  })

  // ====================================================================
  // 10. Territory / Supervisor integration
  // ====================================================================
  describe('Territory and supervisor integration', () => {
    it('fills territory select with unique zone names', async () => {
      backendClient.request.mockImplementation(path => {
        if (path.startsWith('/incidents?per_page')) {
          return Promise.resolve({ data: [INCIDENT_WITH_ASSIGNMENTS, INCIDENT_UNASSIGNED] })
        }

        if (path === '/incidents/assignment-operators') {
          return Promise.resolve({ data: OPERATORS })
        }

        return Promise.resolve({ data: [] })
      })

      await mod.initAssignmentManagementPage()
      await flush()

      const territorySelect = document.getElementById('filterTerritory')
      expect(territorySelect.disabled).toBe(false)
      expect(territorySelect.innerHTML).toContain('Zona Norte')
      expect(territorySelect.innerHTML).toContain('Zona Sur')
    })

    it('disables territory select and shows banner for supervisor-only users', async () => {
      // Re-import with supervisor role
      localStorage.setItem('user_data', JSON.stringify({ id: 2, roles: ['SUPERVISOR'] }))

      vi.resetModules()
      document.body.innerHTML = ''
      insertPageFixtures()

      backendClient = await import('../app/js/infrastructure/backend-client.js')
      backendClient.request.mockImplementation(path => {
        if (path.startsWith('/incidents?per_page')) {
          return Promise.resolve({ data: [INCIDENT_WITH_ASSIGNMENTS, INCIDENT_UNASSIGNED] })
        }

        if (path === '/incidents/assignment-operators') {
          return Promise.resolve({ data: OPERATORS })
        }

        return Promise.resolve({ data: [] })
      })

      mod = await import('../app/js/modules/incidents/presentation/assignment-management-page.js')
      await mod.initAssignmentManagementPage()
      await flush()

      const territorySelect = document.getElementById('filterTerritory')
      expect(territorySelect.disabled).toBe(true)

      const zoneBanner = document.getElementById('zoneBannerWrapper')
      expect(zoneBanner.style.display).not.toBe('none')

      const subtitle = document.getElementById('assignmentSubtitle')
      expect(subtitle.textContent).toContain('Zona Norte')
    })
  })
})
