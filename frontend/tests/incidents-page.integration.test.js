import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

vi.mock('../app/js/infrastructure/backend-client.js', () => ({
  request: vi.fn()
}))

vi.mock('../app/js/modules/incidents/application/incidents-service.js', () => ({
  deleteIncident: vi.fn(),
  listStates: vi.fn(),
  listPriorities: vi.fn()
}))

function flushMicrotasks() {
  return new Promise(resolve => globalThis.setTimeout(resolve, 0))
}

function createDtMock() {
  const dt = {
    destroy: vi.fn(), draw: vi.fn(), clear: vi.fn(),
    rows: { add: vi.fn() }, order: vi.fn(),
    search: vi.fn(), page: vi.fn(),
    ajax: { reload: vi.fn() }
  }
  dt.search.mockReturnValue(dt)
  return dt
}

const FIXTURE = `
  <table id="tablaIncidencias">
    <thead><tr>
      <th>Código</th><th>Título</th><th>Categoría</th><th>Prioridad</th>
      <th>Estado</th><th>Territorio</th><th>Fecha</th><th>Acciones</th>
    </tr></thead>
    <tbody id="tablaBody"></tbody>
  </table>
  <input id="incidentSearch" />
  <select id="filterScope"></select>
  <div id="incidentScopeSection">
      <div id="incidentScopeContext"></div>
  </div>
  <select id="filterState">
      <option value="todos">Todos los estados</option>
  </select>
  <select id="filterPriority">
      <option value="todas">Todas</option>
      <option value="critica">Crítica</option>
      <option value="alta">Alta</option>
      <option value="media">Media</option>
      <option value="baja">Baja</option>
  </select>
  <button id="btnLimpiarFiltros"></button>
  <button id="btnCreateIncident" style="display:none"></button>
  <button id="btnViewMap" style="display:none"></button>
  <div id="modalEliminar">
    <span id="codigoEliminar"></span>
    <button id="btnConfirmarEliminar"></button>
  </div>
  <div id="alertaGlobal"></div>
  <div id="pageLoader"></div>
`

const sampleStates = [
  { id: 1, code: 'NUEVA', name: 'Nueva', is_initial_state: true, is_final_state: false },
  { id: 2, code: 'EN_PROGRESO', name: 'En Progreso', is_initial_state: false, is_final_state: false },
  { id: 3, code: 'RESUELTA', name: 'Resuelta', is_initial_state: false, is_final_state: true }
]

const samplePriorities = [
  { id: 1, name: 'Crítica' },
  { id: 2, name: 'Alta' },
  { id: 3, name: 'Media' },
  { id: 4, name: 'Baja' }
]

const sampleDTData = [
  { id: 1, code: 'INC-001', title: 'Fuga de agua', state: 'open', priority: 'high', category: 'Infraestructura', territory: 'Zona Norte', created_at: '2026-07-10' },
  { id: 2, code: 'INC-002', title: 'Bache en calle', state: 'in_progress', priority: 'medium', category: 'Vialidad', territory: 'Zona Sur', created_at: '2026-07-11' },
  { id: 3, code: 'INC-003', title: 'Alcantarilla tapada', state: 'closed', priority: 'low', category: 'Saneamiento', territory: 'Zona Este', created_at: '2026-07-12' }
]

function setupGlobals() {
  const wrapper = {
    on: vi.fn().mockReturnThis(), off: vi.fn().mockReturnThis(),
    val: vi.fn(), text: vi.fn(), html: vi.fn(),
    toggle: vi.fn(), addClass: vi.fn().mockReturnThis(), removeClass: vi.fn().mockReturnThis(),
    hasClass: vi.fn(), find: vi.fn().mockReturnThis(), closest: vi.fn().mockReturnThis(),
    data: vi.fn(), prop: vi.fn(), attr: vi.fn(), trigger: vi.fn(),
    show: vi.fn(), hide: vi.fn(), empty: vi.fn(), append: vi.fn(), remove: vi.fn(),
    fadeIn: vi.fn(), fadeOut: vi.fn(), serializeArray: vi.fn(() => []),
    DataTable: vi.fn(createDtMock),
    modal: vi.fn()
  }

  globalThis.renderLayout = vi.fn()
  globalThis.$ = vi.fn(() => wrapper)
  globalThis.$.fn = { DataTable: vi.fn(createDtMock) }
  globalThis.$.ajax = vi.fn()
  globalThis.jQuery = globalThis.$
}

function teardownGlobals() {
  delete globalThis.renderLayout
  delete globalThis.$
  delete globalThis.jQuery
}

async function initWithDefaults() {
  const { listStates, listPriorities } = await import(
    '../app/js/modules/incidents/application/incidents-service.js'
  )
  listStates.mockResolvedValue({ data: sampleStates })
  listPriorities.mockResolvedValue({ data: samplePriorities })

  localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }], permissions: ['incidents.delete'] }))

  const { initIncidentsPage } = await import('../app/js/modules/incidents/presentation/incidents-page.js')
  await initIncidentsPage()
  await flushMicrotasks()
}

describe('Integration — incidents-page', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    sessionStorage.clear()
    document.body.innerHTML = FIXTURE
    setupGlobals()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    sessionStorage.clear()
    teardownGlobals()
    vi.clearAllMocks()
  })

  // ─── 1. Module exports ──────────────────────────────────────

  describe('1. Module exports', () => {
    it('all exported functions exist', async () => {
      const mod = await import('../app/js/modules/incidents/presentation/incidents-page.js')
      expect(typeof mod.initIncidentsPage).toBe('function')
      expect(typeof mod.buildPriorityLookup).toBe('function')
      expect(typeof mod.normalizePriorityFilter).toBe('function')

      expect(typeof mod.readStoredSearch).toBe('function')
      expect(typeof mod.storeSearch).toBe('function')
      expect(typeof mod.userHasPermission).toBe('function')
    })
  })

  // ─── 2. Init flow ───────────────────────────────────────────

  describe('2. Init flow', () => {
    it('initializes DataTable and renders filters after loading states/priorities', async () => {
      const { listStates, listPriorities } = await import(
        '../app/js/modules/incidents/application/incidents-service.js'
      )
      listStates.mockResolvedValue({ data: sampleStates })
      listPriorities.mockResolvedValue({ data: samplePriorities })

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }], permissions: ['incidents.create'] }))
      const { initIncidentsPage } = await import('../app/js/modules/incidents/presentation/incidents-page.js')
      await initIncidentsPage()
      await flushMicrotasks()

      expect(globalThis.renderLayout).toHaveBeenCalledWith('incidents')
      expect(listStates).toHaveBeenCalled()
      expect(listPriorities).toHaveBeenCalled()

      const scopeFilters = document.getElementById('filterScope')
      expect(scopeFilters.innerHTML).toContain('Todas las incidencias')
      expect(scopeFilters.innerHTML).toContain('Mis reportes')

      expect(globalThis.jQuery).toHaveBeenCalledWith('#tablaIncidencias')
    })

    it('sets up role-based UI for admins', async () => {
      const { listStates, listPriorities } = await import(
        '../app/js/modules/incidents/application/incidents-service.js'
      )
      listStates.mockResolvedValue({ data: sampleStates })
      listPriorities.mockResolvedValue({ data: samplePriorities })
      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }], permissions: ['incidents.create'] }))

      const { initIncidentsPage } = await import('../app/js/modules/incidents/presentation/incidents-page.js')
      await initIncidentsPage()
      await flushMicrotasks()

      expect(document.getElementById('btnCreateIncident').hidden).toBe(false)
      expect(document.getElementById('btnViewMap').style.display).not.toBe('none')

      const scopeFilters = document.getElementById('filterScope')
      expect(scopeFilters.innerHTML).toContain('Todas las incidencias')
    })

    it.each([
      ['CIUDADANO', [{ codigo: 'incidents.create' }], true],
      ['SUPERVISOR', [], false],
      ['OPERADOR', [], false]
    ])('applies create permission to the %s main and empty-state CTAs', async (role, permissions, allowed) => {
      const { listStates, listPriorities } = await import(
        '../app/js/modules/incidents/application/incidents-service.js'
      )
      listStates.mockResolvedValue({ data: sampleStates })
      listPriorities.mockResolvedValue({ data: samplePriorities })
      localStorage.setItem('user_data', JSON.stringify({ id: 2, roles: [{ code: role }], permissions }))

      const { initIncidentsPage } = await import('../app/js/modules/incidents/presentation/incidents-page.js')
      await initIncidentsPage()
      await flushMicrotasks()

      expect(document.getElementById('btnCreateIncident').hidden).toBe(!allowed)
      const config = globalThis.$.mock.results[0].value.DataTable.mock.calls[0][0]
      expect(config.language.sEmptyTable.includes('incident-create.html')).toBe(allowed)
      expect(config.language.sEmptyTable).toContain('No hay incidencias disponibles')
    })

    it('renders error row when listStates fails', async () => {
      const { listStates } = await import(
        '../app/js/modules/incidents/application/incidents-service.js'
      )
      listStates.mockRejectedValue(new Error('Network error'))

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }], permissions: [] }))
      const { initIncidentsPage } = await import('../app/js/modules/incidents/presentation/incidents-page.js')
      await initIncidentsPage()
      await flushMicrotasks()

      const tbody = document.getElementById('tablaBody')
      expect(tbody.innerHTML).toContain('Network error')
      expect(tbody.innerHTML).toContain('fa-exclamation-circle')
    })

    it('registers sgi:notification-created listener', async () => {
      const addEventListenerSpy = vi.spyOn(globalThis, 'addEventListener')

      const { listStates, listPriorities } = await import(
        '../app/js/modules/incidents/application/incidents-service.js'
      )
      listStates.mockResolvedValue({ data: sampleStates })
      listPriorities.mockResolvedValue({ data: samplePriorities })
      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }], permissions: [] }))
      const { initIncidentsPage } = await import('../app/js/modules/incidents/presentation/incidents-page.js')
      await initIncidentsPage()
      await flushMicrotasks()

      expect(addEventListenerSpy).toHaveBeenCalledWith('sgi:notification-created', expect.any(Function))
      addEventListenerSpy.mockRestore()
    })
  })

  // ─── 3. Column rendering ────────────────────────────────────

  describe('3. Column rendering', () => {
    it('code column renders INC-001 in display mode', async () => {
      await initWithDefaults()
      const config = globalThis.$.mock.results[0].value.DataTable.mock.calls[0][0]
      const html = config.columns[0].render('INC-001', 'display', { id: 1, code: 'INC-001' })
      expect(html).toContain('INC-001')
    })

    it('code column returns raw data for sort/type mode', async () => {
      await initWithDefaults()
      const config = globalThis.$.mock.results[0].value.DataTable.mock.calls[0][0]
      expect(config.columns[0].render('INC-001', 'sort', { id: 1 })).toBe('INC-001')
      expect(config.columns[0].render('INC-001', 'type', { id: 1 })).toBe('INC-001')
    })

    it('title column renders escaped text', async () => {
      await initWithDefaults()
      const config = globalThis.$.mock.results[0].value.DataTable.mock.calls[0][0]
      const html = config.columns[1].render('Fuga de agua', 'display')
      expect(html).toContain('Fuga de agua')
      expect(html).toContain('font-weight-bold')
    })

    it('title column escapes HTML', async () => {
      await initWithDefaults()
      const config = globalThis.$.mock.results[0].value.DataTable.mock.calls[0][0]
      const html = config.columns[1].render('<script>alert("xss")</script>', 'display')
      expect(html).not.toContain('<script>')
      expect(html).toContain('&lt;script&gt;')
    })

    it('state column renders badge', async () => {
      await initWithDefaults()
      const config = globalThis.$.mock.results[0].value.DataTable.mock.calls[0][0]
      const html = config.columns[4].render('open', 'display')
      expect(html).toContain('badge')
      expect(html).toContain('shadow-sm')
    })

    it('priority column renders badge', async () => {
      await initWithDefaults()
      const config = globalThis.$.mock.results[0].value.DataTable.mock.calls[0][0]
      const html = config.columns[3].render('high', 'display')
      expect(html).toContain('badge')
      expect(html).toContain('shadow-sm')
    })

    it('actions column renders detail link and delete button', async () => {
      await initWithDefaults()
      const config = globalThis.$.mock.results[0].value.DataTable.mock.calls[0][0]
      const row = { id: 1, code: 'INC-001' }
      const html = config.columns[7].render(null, 'display', row)
      expect(html).toContain('incident-detail.html?id=1')
      expect(html).toContain('js-delete-incident')
      expect(html).toContain('data-id="1"')
      expect(html).toContain('data-code="INC-001"')
    })

    it('actions column omits delete button when user lacks delete permission', async () => {
      const { listStates, listPriorities } = await import(
        '../app/js/modules/incidents/application/incidents-service.js'
      )
      listStates.mockResolvedValue({ data: sampleStates })
      listPriorities.mockResolvedValue({ data: samplePriorities })
      localStorage.setItem('user_data', JSON.stringify({ id: 2, roles: [{ code: 'VIEWER' }], permissions: [] }))

      const { initIncidentsPage } = await import('../app/js/modules/incidents/presentation/incidents-page.js')
      await initIncidentsPage()
      await flushMicrotasks()

      const config = globalThis.$.mock.results[0].value.DataTable.mock.calls[0][0]
      const html = config.columns[7].render(null, 'display', { id: 1, code: 'INC-001' })
      expect(html).toContain('incident-detail.html?id=1')
      expect(html).not.toContain('js-delete-incident')
      expect(html).not.toContain('fa-trash')
    })

    it('territory column renders data with marker icon', async () => {
      await initWithDefaults()
      const config = globalThis.$.mock.results[0].value.DataTable.mock.calls[0][0]
      const html = config.columns[5].render('Zona Norte', 'display')
      expect(html).toContain('Zona Norte')
      expect(html).toContain('fa-map-marker-alt')
    })

    it('created_at column renders formatted date', async () => {
      await initWithDefaults()
      const config = globalThis.$.mock.results[0].value.DataTable.mock.calls[0][0]
      const html = config.columns[6].render('2026-07-10T10:00:00', 'display')
      expect(html).toContain('2026')
    })
  })

  // ─── 4. Search ──────────────────────────────────────────────

  describe('4. Search', () => {
    it('triggers debounced DataTable search on input', async () => {
      await initWithDefaults()
      const dt = globalThis.$.mock.results[0].value.DataTable.mock.results[0].value

      const searchInput = document.getElementById('incidentSearch')
      searchInput.value = 'INC-001'
      searchInput.dispatchEvent(new Event('input'))

      await new Promise(resolve => globalThis.setTimeout(resolve, 350))

      expect(dt.search).toHaveBeenCalledWith('INC-001')
      expect(dt.draw).toHaveBeenCalled()
    })

    it('persists search query to sessionStorage', async () => {
      await initWithDefaults()

      const searchInput = document.getElementById('incidentSearch')
      searchInput.value = 'bache'
      searchInput.dispatchEvent(new Event('input'))

      await new Promise(resolve => globalThis.setTimeout(resolve, 350))

      expect(sessionStorage.getItem('SGI_incidents_search')).toBe('bache')
    })

    it('restores previous search from sessionStorage on init', async () => {
      sessionStorage.setItem('SGI_incidents_search', 'previous query')

      const { listStates, listPriorities } = await import(
        '../app/js/modules/incidents/application/incidents-service.js'
      )
      listStates.mockResolvedValue({ data: sampleStates })
      listPriorities.mockResolvedValue({ data: samplePriorities })
      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }], permissions: [] }))

      const { initIncidentsPage } = await import('../app/js/modules/incidents/presentation/incidents-page.js')
      await initIncidentsPage()
      await flushMicrotasks()

      expect(document.getElementById('incidentSearch').value).toBe('previous query')
    })
  })

  // ─── 5. Filters ─────────────────────────────────────────────

  describe('5. Filters', () => {
    async function initWithRequestMock() {
      const { request } = await import('../app/js/infrastructure/backend-client.js')
      request.mockResolvedValue({ data: { pendiente: 0, en_proceso: 0, resuelta: 0 } })

      await initWithDefaults()
      return globalThis.$.mock.results[0].value.DataTable.mock.results[0].value
    }

    it('state filter change updates active filter and reloads DataTable', async () => {
      const dt = await initWithRequestMock()

      const filterState = document.getElementById('filterState')
      expect(filterState).not.toBeNull()
      filterState.value = '1'
      filterState.dispatchEvent(new Event('change'))
      await flushMicrotasks()

      expect(dt.ajax.reload).toHaveBeenCalled()
    })

    it('priority filter change updates active filter and reloads DataTable', async () => {
      const dt = await initWithRequestMock()

      const filterPriority = document.getElementById('filterPriority')
      expect(filterPriority).not.toBeNull()
      filterPriority.value = 'alta'
      filterPriority.dispatchEvent(new Event('change'))
      await flushMicrotasks()

      expect(dt.ajax.reload).toHaveBeenCalled()
    })

    it('scope filter change updates scope and reloads DataTable', async () => {
      const dt = await initWithRequestMock()

      const filterScope = document.getElementById('filterScope')
      expect(filterScope).not.toBeNull()
      filterScope.value = 'mine'
      filterScope.dispatchEvent(new Event('change'))
      await flushMicrotasks()

      expect(dt.ajax.reload).toHaveBeenCalled()
    })

    it('btnLimpiarFiltros resets to default and reloads DataTable', async () => {
      const dt = await initWithRequestMock()

      const btnLimpiar = document.getElementById('btnLimpiarFiltros')
      expect(btnLimpiar).not.toBeNull()
      btnLimpiar.click()
      await flushMicrotasks()

      expect(dt.ajax.reload).toHaveBeenCalled()
    })

    it('DataTable AJAX function calls request with correct params', async () => {
      const { request } = await import('../app/js/infrastructure/backend-client.js')
      request.mockResolvedValue({ draw: 1, recordsTotal: 2, recordsFiltered: 2, data: sampleDTData })

      await initWithDefaults()

      const config = globalThis.$.mock.results[0].value.DataTable.mock.calls[0][0]

      const callback = vi.fn()
      const dtData = { draw: 1, start: 0, length: 10, search: { value: '', regex: false }, order: [{ column: 6, dir: 'desc' }] }
      config.ajax(dtData, callback, {})
      await flushMicrotasks()

      const dtCall = request.mock.calls.find(c => c[0].includes('/incidents/datatable'))
      expect(dtCall).toBeTruthy()
      expect(dtCall[0]).toContain('draw=1')
      expect(dtCall[0]).toContain('start=0')
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        draw: 1, recordsTotal: 2, recordsFiltered: 2
      }))
    })
  })

  // ─── 6. Delete flow ─────────────────────────────────────────

  describe('6. Delete flow', () => {
    async function initWithDelete() {
      const { request } = await import('../app/js/infrastructure/backend-client.js')
      request.mockResolvedValue({ data: { pendiente: 0, en_proceso: 0, resuelta: 0 } })

      await initWithDefaults()
      const config = globalThis.$.mock.results[0].value.DataTable.mock.calls[0][0]

      const tbody = document.getElementById('tablaBody')
      const deleteBtn = document.createElement('button')
      deleteBtn.className = 'js-delete-incident'
      deleteBtn.dataset.id = '42'
      deleteBtn.dataset.code = 'INC-042'
      tbody.appendChild(deleteBtn)

      config.drawCallback()
      return deleteBtn
    }

    it('confirm delete calls deleteIncident and reloads DataTable', async () => {
      const { deleteIncident } = await import(
        '../app/js/modules/incidents/application/incidents-service.js'
      )
      deleteIncident.mockResolvedValue({})

      const deleteBtn = await initWithDelete()
      deleteBtn.click()

      expect(document.getElementById('codigoEliminar').textContent).toBe('INC-042')
      expect(globalThis.$.mock.results[0].value.modal).toHaveBeenCalledWith('show')

      document.getElementById('btnConfirmarEliminar').click()
      await flushMicrotasks()

      expect(deleteIncident).toHaveBeenCalledWith('42')
    })

    it('shows error alert when delete fails', async () => {
      const { deleteIncident } = await import(
        '../app/js/modules/incidents/application/incidents-service.js'
      )
      deleteIncident.mockRejectedValue(new Error('No tienes permiso'))

      const deleteBtn = await initWithDelete()
      deleteBtn.click()
      document.getElementById('btnConfirmarEliminar').click()
      await flushMicrotasks()

      expect(document.getElementById('alertaGlobal').innerHTML).toContain('No tienes permiso')
    })
  })

  // ─── 7. DataTable configuration ─────────────────────────────

  describe('7. DataTable configuration', () => {
    it('sets serverSide, pageLength, ordering, and language', async () => {
      await initWithDefaults()

      const config = globalThis.$.mock.results[0].value.DataTable.mock.calls[0][0]

      expect(config.serverSide).toBe(true)
      expect(config.responsive).toBe(true)
      expect(config.pageLength).toBe(10)
      expect(config.order).toEqual([[6, 'desc']])
      expect(config.lengthMenu).toEqual([[10, 25, 50, 100], [10, 25, 50, 100]])
      expect(config.language.sProcessing).toBe('Procesando...')
      expect(config.language.sZeroRecords).toBe('No se encontraron resultados')
    })

    it('initComplete fades the table in', async () => {
      await initWithDefaults()

      const config = globalThis.$.mock.results[0].value.DataTable.mock.calls[0][0]

      const tableEl = document.getElementById('tablaIncidencias')
      tableEl.style.opacity = '0'

      config.initComplete()

      expect(tableEl.style.transition).toBe('opacity 0.25s ease')
      expect(tableEl.style.opacity).toBe('1')
    })
  })

  // ─── 8. Pure functions (smoke-tested via dynamic import) ─────

  describe('8. Pure function smoke tests', () => {
    it('normalizePriorityFilter removes accents and lowercases', async () => {
      const { normalizePriorityFilter } = await import('../app/js/modules/incidents/presentation/incidents-page.js')
      expect(normalizePriorityFilter('CRÍTICA')).toBe('critica')
      expect(normalizePriorityFilter('Alta')).toBe('alta')
    })

    it('buildPriorityLookup builds normalized map', async () => {
      const { buildPriorityLookup } = await import('../app/js/modules/incidents/presentation/incidents-page.js')
      expect(buildPriorityLookup([{ name: 'Crítica', id: 1 }])).toEqual({ critica: 1 })
    })

    it('storeSearch / readStoredSearch round-trips', async () => {
      const { storeSearch, readStoredSearch } = await import('../app/js/modules/incidents/presentation/incidents-page.js')
      storeSearch('test')
      expect(readStoredSearch()).toBe('test')
    })

    it('userHasPermission checks direct and role permissions', async () => {
      const { userHasPermission } = await import('../app/js/modules/incidents/presentation/incidents-page.js')
      expect(userHasPermission({ permissions: ['incidents.delete'] }, 'incidents.delete')).toBe(true)
      expect(userHasPermission({ roles: [{ permissions: [{ codigo: 'incidents.delete' }] }] }, 'incidents.delete')).toBe(true)
      expect(userHasPermission({ roles: [{ code: 'ADMIN' }] }, 'incidents.delete')).toBe(false)
      expect(userHasPermission({ permissions: [] }, 'incidents.delete')).toBe(false)
    })
  })
})
