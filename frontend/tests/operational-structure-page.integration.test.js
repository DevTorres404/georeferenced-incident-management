import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  escapeHtml: v => String(v ?? ''),
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn()
}))

vi.mock('../app/js/modules/operations/application/operational-structure-service.js', () => ({
  listOperationalZones: vi.fn(),
  listOperationalSupervisors: vi.fn(),
  listOperationalOperators: vi.fn(),
  getOperationalZonesGeoJson: vi.fn(),
  updateOperationalOperatorProfile: vi.fn(),
  assignOperationalZoneSupervisor: vi.fn(),
  releaseOperationalZoneSupervisor: vi.fn(),
  replaceOperationalZoneOperator: vi.fn()
}))

vi.mock('../app/js/core/config.js', () => ({
  MAP_DEFAULT_CENTER: [-78.5, -1.5],
  MAP_DEFAULT_ZOOM: 6,
  MAP_ECUADOR_BOUNDS: [[-92.2, -5.25], [-75, 1.85]],
  MAP_STYLE_URL: 'mapbox://styles/mapbox/streets-v11'
}))

const PAGE_FIXTURE = `
  <span id="opsTotalZones"></span>
  <span id="opsCoveredProvinces"></span>
  <span id="opsActiveIncidents"></span>
  <span id="opsNationalWorkload"></span>

  <table><tbody id="supervisorsTableBody"></tbody></table>
  <table><tbody id="operatorsTableBody"></tbody></table>

  <div id="operationalZoneLegend"></div>

  <div id="selectedZoneDetailWrapper" class="d-none">
    <div id="selectedZoneDetailPanel"></div>
  </div>

  <div id="operationalCoverageMap"></div>

  <div id="operatorProfileModal">
    <form id="operatorProfileForm">
      <input id="operatorProfileUserId" />
      <input id="operatorProfileName" />
      <input id="operatorMaxActiveIncidents" />
      <input id="operatorMaxWorkloadPoints" />
      <input id="operatorProfileActive" type="checkbox" />
    </form>
  </div>

  <div id="zoneManagersModal">
    <div id="zoneManagersModalBody"></div>
    <div id="zoneManagersModalSubtitle"></div>
  </div>

  <form id="changeSupervisorForm">
    <select id="supervisorSelect"></select>
    <button id="btnSaveSupervisor"></button>
    <button id="btnReleaseSupervisor" type="button"></button>
  </form>

  <form id="replaceOperatorForm">
    <select id="currentOperatorSelect"></select>
    <select id="replacementOperatorSelect"></select>
    <button id="btnReplaceOperator"></button>
  </form>

  <div id="operationalStructureAlert" class="alert d-none"></div>

  <div id="zoneTitle"></div>
  <div id="supervisorInfoContainer"></div>
  <div id="operatorsListContainer"></div>
`

const sampleZones = [
  {
    zone: { id: 1, name: 'Zona Norte', code: 'Z1' },
    supervisor: { id: 10, first_name: 'Carlos', last_name: 'Mendez', email: 'carlos@test.com' },
    provinces_covered: [{ name: 'Pichincha' }, { name: 'Imbabura' }],
    active_incidents: 5,
    average_workload_points: 8.5
  },
  {
    zone: { id: 2, name: 'Zona Centro', code: 'Z2' },
    supervisor: { id: 11, first_name: 'Ana', last_name: 'Lopez', email: 'ana@test.com' },
    provinces_covered: [{ name: 'Guayas' }],
    active_incidents: 3,
    average_workload_points: 6.2
  }
]

const sampleSupervisors = [
  {
    supervisor: { id: 10, first_name: 'Carlos', last_name: 'Mendez', email: 'carlos@test.com', operational_zone: { name: 'Zona Norte' }, territory: { full_path: 'Pichincha' } },
    active_operators_count: 3,
    max_operators: 5,
    operators: [
      { first_name: 'Pedro', last_name: 'Ramirez' },
      { first_name: 'Luis', last_name: 'Gomez' }
    ]
  },
  {
    supervisor: { id: 12, first_name: 'Sofia', last_name: 'Libre', email: 'sofia@test.com', operational_zone: null, territory: null },
    active_operators_count: 0,
    max_operators: 5,
    operators: []
  }
]

const sampleOperators = [
  {
    operator: { id: 20, first_name: 'Pedro', last_name: 'Ramirez', email: 'pedro@test.com', operational_zone: { id: 1, name: 'Zona Norte' }, territory: { full_path: 'Pichincha > Quito' } },
    supervisor: { id: 10, first_name: 'Carlos', last_name: 'Mendez' },
    current_active_incidents: 2,
    max_active_incidents: 5,
    current_workload_points: 10,
    max_workload_points: 20,
    active: true,
    coverage_type: 'Principal'
  },
  {
    operator: { id: 21, first_name: 'Maria', last_name: 'Diaz', email: 'maria@test.com', operational_zone: { id: 2, name: 'Zona Centro' }, territory: { full_path: 'Guayas > Guayaquil' } },
    supervisor: { id: 11, first_name: 'Ana', last_name: 'Lopez' },
    current_active_incidents: 1,
    max_active_incidents: 4,
    current_workload_points: 5,
    max_workload_points: 20,
    active: true,
    coverage_type: 'Secundario'
  }
]

const sampleGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[-78.5, -0.2], [-78.3, -0.2], [-78.3, -0.4], [-78.5, -0.4], [-78.5, -0.2]]] },
      properties: { province_name: 'Pichincha' }
    }
  ]
}

function flushMicrotasks() {
  return new Promise(resolve => globalThis.setTimeout(resolve, 0))
}

describe('Integration — operational-structure-page', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    document.body.innerHTML = PAGE_FIXTURE

    globalThis.renderLayout = vi.fn()
    const $mockReturn = { modal: vi.fn(), on: vi.fn().mockReturnThis() }
    globalThis.$ = vi.fn(() => $mockReturn)

    globalThis.maplibregl = {
      Map: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        getSource: vi.fn(() => ({ setData: vi.fn() })),
        addSource: vi.fn(),
        addLayer: vi.fn(),
        removeLayer: vi.fn(),
        removeSource: vi.fn(),
        getLayer: vi.fn(() => null),
        isStyleLoaded: vi.fn(() => true),
        getCanvas: vi.fn(() => ({ style: { cursor: '' } })),
        setFeatureState: vi.fn(),
        setFilter: vi.fn(),
        fitBounds: vi.fn(),
        addControl: vi.fn(),
        queryRenderedFeatures: vi.fn(() => [])
      })),
      Popup: vi.fn(() => ({
        setLngLat: vi.fn().mockReturnThis(),
        setHTML: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn()
      })),
      NavigationControl: vi.fn(),
      LngLatBounds: vi.fn(() => ({
        extend: vi.fn(),
        isEmpty: vi.fn(() => true)
      }))
    }
  })

  afterEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    delete globalThis.renderLayout
    delete globalThis.maplibregl
    delete globalThis.$
    vi.clearAllMocks()
  })

  // ─── 1. Exports ────────────────────────────────────────────

  describe('1. Exports', () => {
    it('all key functions are exported', async () => {
      const mod = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      expect(typeof mod.initOperationalStructurePage).toBe('function')
      expect(typeof mod.refreshPageData).toBe('function')
      expect(typeof mod.bindEvents).toBe('function')
      expect(typeof mod.applyAccessMode).toBe('function')
      expect(typeof mod.renderSummary).toBe('function')
      expect(typeof mod.renderSupervisors).toBe('function')
      expect(typeof mod.renderOperators).toBe('function')
      expect(typeof mod.renderSelectedZoneDetail).toBe('function')
      expect(typeof mod.openZoneManagersModal).toBe('function')
      expect(typeof mod.openOperatorProfileModal).toBe('function')
      expect(typeof mod.submitOperatorProfileForm).toBe('function')
      expect(typeof mod.selectZone).toBe('function')
      expect(typeof mod.clearSelectedZone).toBe('function')
      expect(typeof mod.submitChangeSupervisorForm).toBe('function')
      expect(typeof mod.submitReplaceOperatorForm).toBe('function')
    })
  })

  // ─── 2. DOMContentLoaded init flow ──────────────────────────

  describe('2. DOMContentLoaded init flow', () => {
    it('calls services and renders data on DOMContentLoaded', async () => {
      const services = await import('../app/js/modules/operations/application/operational-structure-service.js')
      services.listOperationalZones.mockResolvedValue(sampleZones)
      services.listOperationalSupervisors.mockResolvedValue(sampleSupervisors)
      services.listOperationalOperators.mockResolvedValue(sampleOperators)
      services.getOperationalZonesGeoJson.mockResolvedValue(sampleGeoJson)

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }] }))

      await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      document.dispatchEvent(new Event('DOMContentLoaded'))

      await vi.waitFor(() => {
        expect(services.listOperationalZones).toHaveBeenCalled()
        expect(services.listOperationalSupervisors).toHaveBeenCalled()
        expect(services.listOperationalOperators).toHaveBeenCalled()
        expect(services.getOperationalZonesGeoJson).toHaveBeenCalled()
      })
    })

    it('renders summary values after init', async () => {
      const services = await import('../app/js/modules/operations/application/operational-structure-service.js')
      services.listOperationalZones.mockResolvedValue(sampleZones)
      services.listOperationalSupervisors.mockResolvedValue(sampleSupervisors)
      services.listOperationalOperators.mockResolvedValue(sampleOperators)
      services.getOperationalZonesGeoJson.mockResolvedValue(sampleGeoJson)

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }] }))

      await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      document.dispatchEvent(new Event('DOMContentLoaded'))

      await vi.waitFor(() => {
        expect(document.getElementById('opsTotalZones').textContent).toBe('2')
        expect(document.getElementById('opsCoveredProvinces').textContent).toBe('3')
        expect(document.getElementById('opsActiveIncidents').textContent).toBe('8')
      })
    })

    it('renders supervisors and operators tables after init', async () => {
      const services = await import('../app/js/modules/operations/application/operational-structure-service.js')
      services.listOperationalZones.mockResolvedValue(sampleZones)
      services.listOperationalSupervisors.mockResolvedValue(sampleSupervisors)
      services.listOperationalOperators.mockResolvedValue(sampleOperators)
      services.getOperationalZonesGeoJson.mockResolvedValue(sampleGeoJson)

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }] }))

      await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      document.dispatchEvent(new Event('DOMContentLoaded'))

      await vi.waitFor(() => {
        expect(document.getElementById('supervisorsTableBody').innerHTML).toContain('Carlos Mendez')
        expect(document.getElementById('supervisorsTableBody').innerHTML).toContain('Sofia Libre')
        expect(document.getElementById('supervisorsTableBody').innerHTML).toContain('Asignado · Zona Norte')
        expect(document.getElementById('supervisorsTableBody').innerHTML).toContain('Libre')
        expect(document.getElementById('operatorsTableBody').innerHTML).toContain('Pedro Ramirez')
        expect(document.getElementById('operatorsTableBody').innerHTML).toContain('Maria Diaz')
      })
    })

    it('renders error when services fail', async () => {
      const services = await import('../app/js/modules/operations/application/operational-structure-service.js')
      services.listOperationalZones.mockRejectedValue(new Error('Network error'))

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }] }))

      await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      document.dispatchEvent(new Event('DOMContentLoaded'))

      await vi.waitFor(() => {
        const alert = document.getElementById('operationalStructureAlert')
        expect(alert.textContent).toContain('Network error')
        expect(alert.classList.contains('alert-danger')).toBe(true)
      })
    })

    it('initializes maplibregl.Map when available', async () => {
      const services = await import('../app/js/modules/operations/application/operational-structure-service.js')
      services.listOperationalZones.mockResolvedValue(sampleZones)
      services.listOperationalSupervisors.mockResolvedValue(sampleSupervisors)
      services.listOperationalOperators.mockResolvedValue(sampleOperators)
      services.getOperationalZonesGeoJson.mockResolvedValue(sampleGeoJson)

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }] }))

      await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      document.dispatchEvent(new Event('DOMContentLoaded'))

      await vi.waitFor(() => {
        expect(globalThis.maplibregl.Map).toHaveBeenCalled()
        const mapCall = globalThis.maplibregl.Map.mock.calls[0][0]
        expect(mapCall.container).toBe('operationalCoverageMap')
      })
    })
  })

  // ─── 3. applyAccessMode ─────────────────────────────────────

  describe('3. applyAccessMode', () => {
    it('shows admin text and keeps forms visible for ADMIN', async () => {
      const services = await import('../app/js/modules/operations/application/operational-structure-service.js')
      services.listOperationalZones.mockResolvedValue(sampleZones)
      services.listOperationalSupervisors.mockResolvedValue(sampleSupervisors)
      services.listOperationalOperators.mockResolvedValue(sampleOperators)
      services.getOperationalZonesGeoJson.mockResolvedValue(sampleGeoJson)

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }] }))
      const mod = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      await mod.initOperationalStructurePage()
      await flushMicrotasks()

      const subtitle = document.getElementById('zoneManagersModalSubtitle')
      expect(subtitle.textContent).toContain('ajusta')
      expect(document.getElementById('changeSupervisorForm').classList.contains('d-none')).toBe(false)
      expect(document.getElementById('replaceOperatorForm').classList.contains('d-none')).toBe(false)
    })

    it('shows read-only text and hides forms for non-admin', async () => {
      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'OPERATOR' }] }))
      const mod = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      mod.applyAccessMode()

      const subtitle = document.getElementById('zoneManagersModalSubtitle')
      expect(subtitle.textContent).toContain('Consulta')
      expect(subtitle.textContent).not.toContain('ajusta')
      expect(document.getElementById('changeSupervisorForm').classList.contains('d-none')).toBe(true)
      expect(document.getElementById('replaceOperatorForm').classList.contains('d-none')).toBe(true)
    })
  })

  // ─── 4. Zone selection ─────────────────────────────────────

  describe('4. Zone selection', () => {
    it('selectZone renders detail panel for a valid zone', async () => {
      const mod = await import('../app/js/modules/operations/presentation/operational-structure-page.js')

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }] }))
      const services = await import('../app/js/modules/operations/application/operational-structure-service.js')
      services.listOperationalZones.mockResolvedValue(sampleZones)
      services.listOperationalSupervisors.mockResolvedValue(sampleSupervisors)
      services.listOperationalOperators.mockResolvedValue(sampleOperators)
      services.getOperationalZonesGeoJson.mockResolvedValue(sampleGeoJson)

      await mod.refreshPageData()
      await flushMicrotasks()

      mod.selectZone(1, { fit: false })

      const wrapper = document.getElementById('selectedZoneDetailWrapper')
      expect(wrapper.classList.contains('d-none')).toBe(false)
      expect(document.getElementById('selectedZoneDetailPanel').innerHTML).toContain('Zona Norte')
      expect(document.getElementById('selectedZoneDetailPanel').innerHTML).toContain('Z1')
    })

    it('clearSelectedZone hides the detail panel', async () => {
      const mod = await import('../app/js/modules/operations/presentation/operational-structure-page.js')

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }] }))
      const services = await import('../app/js/modules/operations/application/operational-structure-service.js')
      services.listOperationalZones.mockResolvedValue(sampleZones)
      services.listOperationalSupervisors.mockResolvedValue(sampleSupervisors)
      services.listOperationalOperators.mockResolvedValue(sampleOperators)
      services.getOperationalZonesGeoJson.mockResolvedValue(sampleGeoJson)

      await mod.refreshPageData()
      await flushMicrotasks()

      mod.selectZone(1, { fit: false })
      mod.clearSelectedZone()

      const wrapper = document.getElementById('selectedZoneDetailWrapper')
      expect(wrapper.classList.contains('d-none')).toBe(true)
      expect(document.getElementById('selectedZoneDetailPanel').innerHTML).toBe('')
    })

    it('selectZone renders team management tab', async () => {
      const mod = await import('../app/js/modules/operations/presentation/operational-structure-page.js')

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }] }))
      const services = await import('../app/js/modules/operations/application/operational-structure-service.js')
      services.listOperationalZones.mockResolvedValue(sampleZones)
      services.listOperationalSupervisors.mockResolvedValue(sampleSupervisors)
      services.listOperationalOperators.mockResolvedValue(sampleOperators)
      services.getOperationalZonesGeoJson.mockResolvedValue(sampleGeoJson)

      await mod.refreshPageData()
      await flushMicrotasks()

      mod.selectZone(1, { fit: false })

      expect(document.getElementById('zoneTitle').innerHTML).toContain('Zona Norte')
      expect(document.getElementById('supervisorInfoContainer').innerHTML).toContain('Carlos Mendez')
      expect(document.getElementById('supervisorSelect').textContent).toContain('Carlos Mendez — Actual · Zona Norte')
      expect(document.getElementById('supervisorSelect').textContent).toContain('Sofia Libre — Libre')
      expect(document.getElementById('replacementOperatorSelect').textContent).toContain('Maria Diaz — Actualmente en Zona Centro')
      expect(document.getElementById('btnReleaseSupervisor').disabled).toBe(false)
    })

    it('click on [data-action="close-zone-detail"] clears selection', async () => {
      const mod = await import('../app/js/modules/operations/presentation/operational-structure-page.js')

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }] }))
      const services = await import('../app/js/modules/operations/application/operational-structure-service.js')
      services.listOperationalZones.mockResolvedValue(sampleZones)
      services.listOperationalSupervisors.mockResolvedValue(sampleSupervisors)
      services.listOperationalOperators.mockResolvedValue(sampleOperators)
      services.getOperationalZonesGeoJson.mockResolvedValue(sampleGeoJson)

      await mod.refreshPageData()
      await flushMicrotasks()
      mod.selectZone(1, { fit: false })

      const closeBtn = document.querySelector('[data-action="close-zone-detail"]')
      closeBtn.dispatchEvent(new Event('click', { bubbles: true }))

      expect(document.getElementById('selectedZoneDetailWrapper').classList.contains('d-none')).toBe(true)
    })
  })

  // ─── 5. openZoneManagersModal ──────────────────────────────

  describe('5. openZoneManagersModal', () => {
    it('populates modal body and shows it', async () => {
      const mod = await import('../app/js/modules/operations/presentation/operational-structure-page.js')

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }] }))
      const services = await import('../app/js/modules/operations/application/operational-structure-service.js')
      services.listOperationalZones.mockResolvedValue(sampleZones)
      services.listOperationalSupervisors.mockResolvedValue(sampleSupervisors)
      services.listOperationalOperators.mockResolvedValue(sampleOperators)
      services.getOperationalZonesGeoJson.mockResolvedValue(sampleGeoJson)

      await mod.refreshPageData()
      await flushMicrotasks()

      mod.openZoneManagersModal(1)

      const modalBody = document.getElementById('zoneManagersModalBody')
      expect(modalBody.innerHTML).toContain('Carlos Mendez')
      expect(modalBody.innerHTML).toContain('Pedro Ramirez')
      expect(modalBody.innerHTML).toContain('carlos@test.com')
      expect(document.getElementById('zoneManagersModalSubtitle').textContent).toContain('Zona Norte')
    })
  })

  // ─── 6. openOperatorProfileModal ───────────────────────────

  describe('6. openOperatorProfileModal', () => {
    it('fills form fields and shows modal', async () => {
      const mod = await import('../app/js/modules/operations/presentation/operational-structure-page.js')

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }] }))
      const services = await import('../app/js/modules/operations/application/operational-structure-service.js')
      services.listOperationalZones.mockResolvedValue(sampleZones)
      services.listOperationalSupervisors.mockResolvedValue(sampleSupervisors)
      services.listOperationalOperators.mockResolvedValue(sampleOperators)
      services.getOperationalZonesGeoJson.mockResolvedValue(sampleGeoJson)

      mod.bindEvents()
      await mod.refreshPageData()
      await flushMicrotasks()

      const button = document.createElement('button')
      button.dataset.operatorId = '20'
      mod.openOperatorProfileModal(button)

      expect(document.getElementById('operatorProfileUserId').value).toBe('20')
      expect(document.getElementById('operatorProfileName').value).toBe('Pedro Ramirez')
      expect(document.getElementById('operatorMaxActiveIncidents').value).toBe('5')
      expect(document.getElementById('operatorMaxWorkloadPoints').value).toBe('20')
      expect(document.getElementById('operatorProfileActive').checked).toBe(true)
      expect(globalThis.$().modal).toHaveBeenCalledWith('show')
    })

    it('shows modal via jQuery .modal("show")', async () => {
      const mod = await import('../app/js/modules/operations/presentation/operational-structure-page.js')

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }] }))
      const services = await import('../app/js/modules/operations/application/operational-structure-service.js')
      services.listOperationalZones.mockResolvedValue(sampleZones)
      services.listOperationalSupervisors.mockResolvedValue(sampleSupervisors)
      services.listOperationalOperators.mockResolvedValue(sampleOperators)
      services.getOperationalZonesGeoJson.mockResolvedValue(sampleGeoJson)

      mod.bindEvents()
      await mod.refreshPageData()
      await flushMicrotasks()

      const button = document.createElement('button')
      button.dataset.operatorId = '20'
      mod.openOperatorProfileModal(button)
      expect(globalThis.$().modal).toHaveBeenCalledWith('show')
    })
  })

  // ─── 7. submitOperatorProfileForm ──────────────────────────

  describe('7. submitOperatorProfileForm', () => {
    it('calls service and refreshes page on valid submission', async () => {
      const mod = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      const services = await import('../app/js/modules/operations/application/operational-structure-service.js')

      services.listOperationalZones.mockResolvedValue(sampleZones)
      services.listOperationalSupervisors.mockResolvedValue(sampleSupervisors)
      services.listOperationalOperators.mockResolvedValue(sampleOperators)
      services.getOperationalZonesGeoJson.mockResolvedValue(sampleGeoJson)
      services.updateOperationalOperatorProfile.mockResolvedValue({})

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }] }))

      // init so state is populated
      mod.bindEvents()
      await mod.refreshPageData()
      await flushMicrotasks()

      // set form values
      document.getElementById('operatorProfileUserId').value = '20'
      document.getElementById('operatorMaxActiveIncidents').value = '8'
      document.getElementById('operatorMaxWorkloadPoints').value = '25'
      document.getElementById('operatorProfileActive').checked = true

      await mod.submitOperatorProfileForm({ preventDefault: vi.fn() })
      await flushMicrotasks()

      expect(services.updateOperationalOperatorProfile).toHaveBeenCalledWith(
        20,
        { max_active_incidents: 8, max_workload_points: 25, active: true }
      )
      // verify modal hidden
      expect(globalThis.$().modal).toHaveBeenCalledWith('hide')
    })

    it('shows validation error for missing required fields', async () => {
      const mod = await import('../app/js/modules/operations/presentation/operational-structure-page.js')

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }] }))

      // empty form
      document.getElementById('operatorProfileUserId').value = '0'
      document.getElementById('operatorMaxActiveIncidents').value = '0'
      document.getElementById('operatorMaxWorkloadPoints').value = '0'

      await mod.submitOperatorProfileForm({ preventDefault: vi.fn() })

      const alert = document.getElementById('operationalStructureAlert')
      expect(alert.textContent).toContain('Completa correctamente')
      expect(alert.classList.contains('alert-danger')).toBe(true)
    })

    it('handles service error gracefully', async () => {
      const mod = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      const services = await import('../app/js/modules/operations/application/operational-structure-service.js')

      services.updateOperationalOperatorProfile.mockRejectedValue(new Error('API error'))

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }] }))

      mod.bindEvents()
      await mod.refreshPageData()
      await flushMicrotasks()

      document.getElementById('operatorProfileUserId').value = '20'
      document.getElementById('operatorMaxActiveIncidents').value = '5'
      document.getElementById('operatorMaxWorkloadPoints').value = '20'

      await mod.submitOperatorProfileForm({ preventDefault: vi.fn() })

      const alert = document.getElementById('operationalStructureAlert')
      expect(alert.textContent).toContain('API error')
    })
  })

  // ─── 8. submitChangeSupervisorForm ─────────────────────────

  describe('8. submitChangeSupervisorForm', () => {
    it('calls service and refreshes on valid submission', async () => {
      const mod = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      const services = await import('../app/js/modules/operations/application/operational-structure-service.js')

      services.listOperationalZones.mockResolvedValue(sampleZones)
      services.listOperationalSupervisors.mockResolvedValue(sampleSupervisors)
      services.listOperationalOperators.mockResolvedValue(sampleOperators)
      services.getOperationalZonesGeoJson.mockResolvedValue(sampleGeoJson)
      services.assignOperationalZoneSupervisor.mockResolvedValue({})

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }] }))

      await mod.refreshPageData()
      await flushMicrotasks()
      mod.selectZone(1, { fit: false })

      document.getElementById('supervisorSelect').value = '10'
      await mod.submitChangeSupervisorForm({ preventDefault: vi.fn() })
      await flushMicrotasks()

      expect(services.assignOperationalZoneSupervisor).toHaveBeenCalledWith(
        1,
        { supervisor_user_id: 10 }
      )
      const alert = document.getElementById('operationalStructureAlert')
      expect(alert.textContent).toContain('Cambio de supervisor aplicado correctamente')
    })

    it('validates supervisor is selected', async () => {
      const mod = await import('../app/js/modules/operations/presentation/operational-structure-page.js')

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }] }))
      const services = await import('../app/js/modules/operations/application/operational-structure-service.js')
      services.listOperationalZones.mockResolvedValue(sampleZones)
      services.listOperationalSupervisors.mockResolvedValue(sampleSupervisors)
      services.listOperationalOperators.mockResolvedValue(sampleOperators)
      services.getOperationalZonesGeoJson.mockResolvedValue(sampleGeoJson)

      await mod.refreshPageData()
      await flushMicrotasks()
      mod.selectZone(1, { fit: false })

      document.getElementById('supervisorSelect').value = ''
      await mod.submitChangeSupervisorForm({ preventDefault: vi.fn() })

      const alert = document.getElementById('operationalStructureAlert')
      expect(alert.textContent).toContain('Selecciona un supervisor')
    })
  })

  // ─── 9. submitReplaceOperatorForm ──────────────────────────

  describe('9. submitReplaceOperatorForm', () => {
    it('calls service and refreshes on valid submission', async () => {
      const mod = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      const services = await import('../app/js/modules/operations/application/operational-structure-service.js')

      services.listOperationalZones.mockResolvedValue(sampleZones)
      services.listOperationalSupervisors.mockResolvedValue(sampleSupervisors)
      services.listOperationalOperators.mockResolvedValue(sampleOperators)
      services.getOperationalZonesGeoJson.mockResolvedValue(sampleGeoJson)
      services.replaceOperationalZoneOperator.mockResolvedValue({})

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }] }))

      await mod.refreshPageData()
      await flushMicrotasks()
      mod.selectZone(1, { fit: false })

      document.getElementById('currentOperatorSelect').value = '20'
      document.getElementById('replacementOperatorSelect').value = '21'
      await mod.submitReplaceOperatorForm({ preventDefault: vi.fn() })
      await flushMicrotasks()

      expect(services.replaceOperationalZoneOperator).toHaveBeenCalledWith(
        20,
        { replacement_operator_user_id: 21 }
      )
      const alert = document.getElementById('operationalStructureAlert')
      expect(alert.textContent).toContain('Cambio de operadores completado')
    })

    it('validates both selects have values', async () => {
      const mod = await import('../app/js/modules/operations/presentation/operational-structure-page.js')

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }] }))
      const services = await import('../app/js/modules/operations/application/operational-structure-service.js')
      services.listOperationalZones.mockResolvedValue(sampleZones)
      services.listOperationalSupervisors.mockResolvedValue(sampleSupervisors)
      services.listOperationalOperators.mockResolvedValue(sampleOperators)
      services.getOperationalZonesGeoJson.mockResolvedValue(sampleGeoJson)

      await mod.refreshPageData()
      await flushMicrotasks()
      mod.selectZone(1, { fit: false })

      document.getElementById('currentOperatorSelect').value = ''
      document.getElementById('replacementOperatorSelect').value = ''
      await mod.submitReplaceOperatorForm({ preventDefault: vi.fn() })

      const alert = document.getElementById('operationalStructureAlert')
      expect(alert.textContent).toContain('Selecciona el operador actual')
    })
  })

  describe('10. releaseSelectedZoneSupervisor', () => {
    it('releases the current supervisor and refreshes the selected zone', async () => {
      const mod = await import('../app/js/modules/operations/presentation/operational-structure-page.js')
      const services = await import('../app/js/modules/operations/application/operational-structure-service.js')

      services.listOperationalZones.mockResolvedValue(sampleZones)
      services.listOperationalSupervisors.mockResolvedValue(sampleSupervisors)
      services.listOperationalOperators.mockResolvedValue(sampleOperators)
      services.getOperationalZonesGeoJson.mockResolvedValue(sampleGeoJson)
      services.releaseOperationalZoneSupervisor.mockResolvedValue({})

      localStorage.setItem('user_data', JSON.stringify({ id: 1, roles: [{ code: 'ADMIN' }] }))

      await mod.refreshPageData()
      await flushMicrotasks()
      mod.selectZone(1, { fit: false })

      await mod.releaseSelectedZoneSupervisor()
      await flushMicrotasks()

      expect(services.releaseOperationalZoneSupervisor).toHaveBeenCalledWith(1)
      expect(document.getElementById('operationalStructureAlert').textContent).toContain('Supervisor liberado correctamente')
    })
  })
})
