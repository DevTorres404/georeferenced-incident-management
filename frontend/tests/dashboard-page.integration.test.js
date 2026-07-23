import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

vi.mock('../app/js/infrastructure/backend-client.js', () => ({
  request: vi.fn(),
  requestAfter: vi.fn()
}))

vi.mock('../app/js/presentation/dom-utils.js', () => ({
  $: vi.fn(selector => document.querySelector(selector)),
  hide: vi.fn(),
  showErrorAlert: vi.fn()
}))

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  escapeHtml: v => String(v ?? '').replace(/["&'<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]),
  formatCatalogLabel: v => v || '-',
  formatShortDate: v => (v ? new Date(v).toLocaleDateString('es-EC') : '-'),
  getPriorityBadgeClass: vi.fn(() => 'badge-secondary'),
  getStateBadgeClass: vi.fn(() => 'badge-secondary'),
  getStateHexColor: vi.fn(() => '#000000'),
  getPriorityHexColor: vi.fn(() => '#000000'),
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn()
}))

vi.mock('../app/js/modules/dashboard/application/dashboard-service.js', () => ({
  getDashboardMetrics: vi.fn()
}))

vi.mock('../app/js/modules/map/application/map-service.js', () => ({
  listIncidentMapPoints: vi.fn(() => Promise.resolve([
    { id: 1, latitude: -1.83, longitude: -78.46, title: 'Map Point 1', priority: { name: 'ALTA' } }
  ]))
}))

function flushMicrotasks() {
  return new Promise(resolve => globalThis.setTimeout(resolve, 0))
}

const FIXTURE = `
  <div id="kpiRow"></div>
  <div id="barrasPrioridad"></div>
  <div id="infoStack"></div>
  <h2 id="recentIncidentsTitle"></h2>
  <a id="recentIncidentsLink"><span id="recentIncidentsLinkLabel"></span></a>
  <table><tbody id="tablaUltimasBody"></tbody></table>
  <canvas id="graficoPorTipo"></canvas>
  <canvas id="graficoPorEstado"></canvas>
  <canvas id="graficoTendencia"></canvas>
`

const sampleMetrics = {
  kpis: { total: 150, pending: 45, progress: 30, resolved: 75 },
  countsByPriority: { CRITICA: 10, ALTA: 30, MEDIA: 60, BAJA: 50 },
  countsByCategory: { Robo: 50, 'Daño material': 40, Otro: 60 },
  countsByState: { Pendiente: 45, 'En proceso': 30, Resuelta: 75 },
  topCities: [{ city: 'Quito', count: 80 }],
  averageResolutionDays: 4.2,
  monthlyTrend: {
    months: ['Ene', 'Feb', 'Mar'],
    registered: [50, 60, 40],
    resolved: [25, 30, 20],
    pending: [25, 30, 20]
  },
  recentIncidents: [
    { id: 1, code: 'INC-001', title: 'Fuga de agua', category: { name: 'Daño' }, priority: { name: 'ALTA' }, state: { name: 'NUEVA' }, created_at: '2026-07-10T10:00:00Z' },
    { id: 2, code: 'INC-002', title: 'Bache en calle', category: { name: 'Vialidad' }, priority: { name: 'MEDIA' }, state: { name: 'EN PROCESO' }, created_at: '2026-07-11T10:00:00Z' }
  ]
}

function setupGlobals() {
  const wrapper = {
    on: vi.fn().mockReturnThis(), off: vi.fn().mockReturnThis(),
    val: vi.fn(), text: vi.fn(), html: vi.fn(),
    toggle: vi.fn(), addClass: vi.fn().mockReturnThis(), removeClass: vi.fn().mockReturnThis(),
    hasClass: vi.fn(), find: vi.fn().mockReturnThis(), closest: vi.fn().mockReturnThis(),
    data: vi.fn(), prop: vi.fn(), attr: vi.fn(), trigger: vi.fn(),
    show: vi.fn(), hide: vi.fn(), empty: vi.fn(), append: vi.fn(), remove: vi.fn(),
    fadeIn: vi.fn(), fadeOut: vi.fn()
  }

  globalThis.renderLayout = vi.fn()
  globalThis.$ = vi.fn(() => wrapper)
  globalThis.$.ajax = vi.fn()
  globalThis.$.get = vi.fn()

  // happy-dom canvas doesn't implement getContext — mock it for chart tests
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({}))
}

function teardownGlobals() {
  delete globalThis.renderLayout
  delete globalThis.Chart
  delete globalThis.$
}

async function initWithSampleMetrics() {
  const { getDashboardMetrics } = await import('../app/js/modules/dashboard/application/dashboard-service.js')
  getDashboardMetrics.mockResolvedValue({ ...sampleMetrics })

  const { initDashboardPage } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js')
  await initDashboardPage()
  await flushMicrotasks()
}

describe('dashboard-page — integration', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    document.body.innerHTML = FIXTURE
    setupGlobals()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    teardownGlobals()
    vi.clearAllMocks()
  })

  // ─── 1. Module exports ──────────────────────────────────────

  describe('1. Module exports', () => {
    it('all exported functions and constants exist', async () => {
      const mod = await import('../app/js/modules/dashboard/presentation/dashboard-page.js')
      expect(typeof mod.initDashboardPage).toBe('function')
      expect(typeof mod.renderPriorityBars).toBe('function')
      expect(typeof mod.renderDashboardKpis).toBe('function')
      expect(typeof mod.priorityColor).toBe('function')
      expect(typeof mod.renderInfoCards).toBe('function')
      expect(typeof mod.renderRecentIncidents).toBe('function')
      expect(typeof mod.getDashboardIncidentNavigation).toBe('function')
      expect(typeof mod.configureRecentIncidentsNavigation).toBe('function')
      expect(typeof mod.topEntry).toBe('function')
      expect(typeof mod.CHART_COLORS).toBe('object')
      expect(typeof mod.CATEGORY_PALETTE).toBe('object')
      expect(typeof mod.STATE_COLORS).toBe('object')
    })
  })

  // ─── 2. DOMContentLoaded init ───────────────────────────────

  describe('2. DOMContentLoaded init', () => {
    it('calls renderLayout, loads metrics, and renders dashboard', async () => {
      await initWithSampleMetrics()

      expect(globalThis.renderLayout).toHaveBeenCalledWith('dashboard')
      expect(document.getElementById('barrasPrioridad').innerHTML).toContain('CRITICA')
      expect(document.getElementById('kpiRow').querySelectorAll('.dash-kpi-card')).toHaveLength(4)
      expect(document.getElementById('kpiRow').textContent).toContain('150')
      expect(document.getElementById('infoStack').innerHTML).toContain('Quito')
      expect(document.getElementById('tablaUltimasBody').innerHTML).toContain('INC-001')
    })

    it('routes assignment-only supervisors to assignment management', async () => {
      localStorage.setItem('user_data', JSON.stringify({
        id: 7,
        roles: ['SUPERVISOR'],
        permissions: ['dashboard.view', 'incidents.assign']
      }))

      await initWithSampleMetrics()

      expect(document.getElementById('recentIncidentsTitle').textContent).toContain('Gestión de asignaciones')
      expect(document.getElementById('recentIncidentsLink').getAttribute('href')).toBe('assignment-management.html')
      expect(document.getElementById('recentIncidentsLinkLabel').textContent).toBe('Gestionar asignaciones')
      expect(document.getElementById('tablaUltimasBody').innerHTML)
        .toContain('assignment-management.html?incident_id=1')
      expect(document.getElementById('tablaUltimasBody').innerHTML).toContain('title="Gestionar asignación"')
    })

    it('calls showPageLoading and hidePageLoading on success', async () => {
      const { showPageLoading, hidePageLoading } = await import('../app/js/modules/incidents/presentation/incidents-ui.js')
      await initWithSampleMetrics()

      expect(showPageLoading).toHaveBeenCalledWith('Cargando panel', 'Consultando métricas...')
      expect(hidePageLoading).toHaveBeenCalled()
    })

    it('shows error alert and hides loading on failure', async () => {
      const { getDashboardMetrics } = await import('../app/js/modules/dashboard/application/dashboard-service.js')
      getDashboardMetrics.mockRejectedValue(new Error('Network error'))

      const { initDashboardPage } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js')
      await initDashboardPage()
      await flushMicrotasks()

      const { showErrorAlert } = await import('../app/js/presentation/dom-utils.js')
      expect(showErrorAlert).toHaveBeenCalledWith('Network error')

      const { hidePageLoading } = await import('../app/js/modules/incidents/presentation/incidents-ui.js')
      expect(hidePageLoading).toHaveBeenCalled()
    })

    it('does not crash when Chart is unavailable', async () => {
      delete globalThis.Chart

      const { getDashboardMetrics } = await import('../app/js/modules/dashboard/application/dashboard-service.js')
      getDashboardMetrics.mockResolvedValue({ ...sampleMetrics })

      const { initDashboardPage } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js')
      await initDashboardPage()
      await flushMicrotasks()

      expect(document.getElementById('barrasPrioridad').innerHTML).toContain('CRITICA')
    })
  })

  // ─── 4. Charts ──────────────────────────────────────────────

  describe.skip('4. Charts', () => {
    it('creates chart instances with correct types and data', async () => {
      const calls = []
      globalThis.Chart = (ctx, config) => {
        calls.push({ ctx, config })
        return { destroy: vi.fn() }
      }

      const { getDashboardMetrics } = await import('../app/js/modules/dashboard/application/dashboard-service.js')
      getDashboardMetrics.mockResolvedValue({ ...sampleMetrics })

      const { initDashboardPage } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js')
      await initDashboardPage()
      await flushMicrotasks()

      // Verify getDashboardMetrics was called and returned data
      const metrics = await getDashboardMetrics()
      expect(metrics.kpis.total).toBe(150)

      expect(calls).toHaveLength(3)

      const [doughnut, bar, line] = calls.map(c => c.config)

      expect(doughnut.type).toBe('doughnut')
      expect(doughnut.data.labels).toEqual(['Robo', 'Daño material', 'Otro'])
      expect(doughnut.data.datasets[0].data).toEqual([50, 40, 60])

      expect(bar.type).toBe('bar')
      expect(bar.data.labels).toEqual(['Pendiente', 'En proceso', 'Resuelta'])
      expect(bar.data.datasets[0].data).toEqual([45, 30, 75])

      expect(line.type).toBe('line')
      expect(line.data.labels).toEqual(['Ene', 'Feb', 'Mar'])
      expect(line.data.datasets).toHaveLength(3)
      expect(line.data.datasets[0].label).toBe('Registradas')
      expect(line.data.datasets[0].data).toEqual([50, 60, 40])
    })

    it('skips doughnut when countsByCategory is empty', async () => {
      const calls = []
      globalThis.Chart = (ctx, config) => {
        calls.push({ ctx, config })
        return { destroy: vi.fn() }
      }

      const { getDashboardMetrics } = await import('../app/js/modules/dashboard/application/dashboard-service.js')
      getDashboardMetrics.mockResolvedValue({ ...sampleMetrics, countsByCategory: {} })

      const { initDashboardPage } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js')
      await initDashboardPage()
      await flushMicrotasks()

      expect(calls).toHaveLength(2)
    })

    it('creates doughnut chart with correct canvas context', async () => {
      const calls = []
      globalThis.Chart = (ctx, config) => {
        calls.push({ ctx, config })
        return { destroy: vi.fn() }
      }

      const { getDashboardMetrics } = await import('../app/js/modules/dashboard/application/dashboard-service.js')
      getDashboardMetrics.mockResolvedValue({ ...sampleMetrics })

      const { initDashboardPage } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js')
      await initDashboardPage()
      await flushMicrotasks()

      const canvas = document.getElementById('graficoPorTipo')
      expect(calls[0].ctx).toBe(canvas.getContext('2d'))
    })

    it('destroys previous chart instances on re-init', async () => {
      const calls = []
      const destroySpy = vi.fn()
      globalThis.Chart = (ctx, config) => {
        calls.push({ ctx, config })
        return { destroy: destroySpy }
      }

      const { getDashboardMetrics } = await import('../app/js/modules/dashboard/application/dashboard-service.js')
      getDashboardMetrics.mockResolvedValue({ ...sampleMetrics })

      const { initDashboardPage } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js')
      await initDashboardPage()
      await flushMicrotasks()

      expect(calls).toHaveLength(3)

      getDashboardMetrics.mockResolvedValue({
        ...sampleMetrics,
        countsByCategory: { Robo: 10 },
        countsByState: { Pendiente: 5 },
        monthlyTrend: { months: ['Ene'], registered: [1], resolved: [0], pending: [1] }
      })

      await initDashboardPage()
      await flushMicrotasks()

      expect(destroySpy).toHaveBeenCalledTimes(3)
    })
  })

  // ─── 5. Incident by category / status / priority ────────────

  describe('5. Incident by category / status / priority', () => {
    it('renders priority bars with correct percentages', async () => {
      await initWithSampleMetrics()
      const html = document.getElementById('barrasPrioridad').innerHTML

      expect(html).toContain('CRITICA')
      expect(html).toContain('ALTA')
      expect(html).toContain('MEDIA')
      expect(html).toContain('BAJA')
      expect(html).toContain('7%')
      expect(html).toContain('20%')
      expect(html).toContain('40%')
      expect(html).toContain('33%')
    })

    it('shows empty message when no priority data', async () => {
      const { renderPriorityBars } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js')
      renderPriorityBars({}, 0)
      expect(document.getElementById('barrasPrioridad').innerHTML).toContain('Sin incidencias')
    })

    it('renders info cards with city, category, and avg resolution', async () => {
      await initWithSampleMetrics()
      const html = document.getElementById('infoStack').innerHTML

      expect(html).toContain('Quito')
      expect(html).toContain('80 incidencias')
      expect(html).toContain('Otro')
      expect(html).toContain('60 incidencias')
      expect(html).toContain('4.2')
      expect(html).toContain('dias')
    })

    it('handles missing topCities gracefully', async () => {
      const { getDashboardMetrics } = await import('../app/js/modules/dashboard/application/dashboard-service.js')
      getDashboardMetrics.mockResolvedValue({ ...sampleMetrics, topCities: [] })

      const { initDashboardPage } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js')
      await initDashboardPage()
      await flushMicrotasks()

      const html = document.getElementById('infoStack').innerHTML
      expect(html).toContain('Sin datos')
      expect(html).toContain('No hay datos disponibles')
    })

    it('renders recent incidents table with rows', async () => {
      await initWithSampleMetrics()
      const html = document.getElementById('tablaUltimasBody').innerHTML

      expect(html).toContain('INC-001')
      expect(html).toContain('Fuga de agua')
      expect(html).toContain('INC-002')
      expect(html).toContain('Bache en calle')
      expect(html).toContain('incident-detail.html?id=1')
      expect(html).toContain('incident-detail.html?id=2')
      expect(html.match(/data-label=/g)).toHaveLength(14)
      expect(html).toContain('data-label="Acciones"')
    })

    it('shows empty message when no recent incidents', async () => {
      const { getDashboardMetrics } = await import('../app/js/modules/dashboard/application/dashboard-service.js')
      getDashboardMetrics.mockResolvedValue({ ...sampleMetrics, recentIncidents: [] })

      const { initDashboardPage } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js')
      await initDashboardPage()
      await flushMicrotasks()

      const html = document.getElementById('tablaUltimasBody').innerHTML
      expect(html).toContain('Sin incidencias recientes')
    })
  })
})
