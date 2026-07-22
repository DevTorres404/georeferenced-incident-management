import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { normalizeCatalogCode } from '../app/js/modules/incidents/presentation/incidents-ui.js';

// ── Global mocks (hoisted before any import) ─────────────────────

vi.hoisted(() => {
  globalThis.$ = vi.fn(() => ({
    on: vi.fn().mockReturnThis(), off: vi.fn().mockReturnThis(),
    val: vi.fn(), text: vi.fn(), html: vi.fn(),
    toggle: vi.fn(), addClass: vi.fn().mockReturnThis(), removeClass: vi.fn().mockReturnThis(),
    hasClass: vi.fn(), find: vi.fn().mockReturnThis(), closest: vi.fn().mockReturnThis(),
    data: vi.fn(), prop: vi.fn(), attr: vi.fn(), trigger: vi.fn(),
    show: vi.fn(), hide: vi.fn(), empty: vi.fn(), append: vi.fn(), remove: vi.fn(),
    serialize: vi.fn(() => ''),
    serializeArray: vi.fn(() => []),
    DataTable: vi.fn(() => ({
      destroy: vi.fn(), draw: vi.fn(), clear: vi.fn(), rows: { add: vi.fn() },
    })),
  }));
  globalThis.$.ajax = vi.fn();
  globalThis.$.getJSON = vi.fn();
  globalThis.$.fn = globalThis.$.fn || {};
  globalThis.$.fn.DataTable = vi.fn(() => ({
    destroy: vi.fn(), draw: vi.fn(), clear: vi.fn(), rows: { add: vi.fn() },
  }));

  function ChartMock(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.destroy = function () {};
    ChartMock.instances.push(this);
  }
  ChartMock.instances = [];
  ChartMock.defaults = { font: {}, color: '#000', global: {} };
  globalThis.Chart = ChartMock;

  globalThis.renderLayout = vi.fn();
  globalThis.print = vi.fn();
});

// ── Module mocks ────────────────────────────────────────────────

vi.mock('../app/js/infrastructure/backend-client.js', () => ({
  request: vi.fn(),
  requestBackend: vi.fn(),
  requestAfter: vi.fn(),
}));

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', async (importOriginal) => ({
  ...await importOriginal(),
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn(),
}));

vi.mock('../app/js/shared/validators/validation-utils.js', () => ({
  handleBackendErrors: vi.fn(),
  setFieldError: vi.fn(),
  clearFieldError: vi.fn(),
  setupValidationListeners: vi.fn(),
}));

const nativeDocumentAddEventListener = document.addEventListener.bind(document);
let domContentLoadedListeners = [];

// ── DOM fixture matching every id reports-page.js looks up ─────

const DOM_FIXTURE = `
<form id="filtroReporte">
  <div class="form-group">
    <label>Fecha inicial</label>
    <input type="date" id="fFechaInicial" />
  </div>
  <div class="form-group">
    <label>Fecha final</label>
    <input type="date" id="fFechaFinal" />
  </div>
  <div class="form-group">
    <select id="selectTipoFiltro">
      <option value="">Todos</option>
    </select>
  </div>
  <div class="form-group">
    <select id="selectEstadoFiltro">
      <option value="">Todos</option>
    </select>
  </div>
  <button type="submit" id="btnFiltrar">Filtrar</button>
  <button type="button" id="btnLimpiarFiltros">Limpiar</button>
  <button type="button" id="btnExportExcel">Excel</button>
  <button type="button" id="btnExportPDF">PDF</button>
</form>

<div id="kpiCards"></div>

<div id="reportInsightCards"></div>
<div id="reportInsightNarrative"></div>

<div id="rankingCiudades"></div>
<div id="rankingTipos"></div>

<div id="indicadoresEficiencia"></div>

<table>
  <tbody id="tablaResumen"></tbody>
  <tfoot id="tablaResumenTotal"></tfoot>
</table>

<div id="alertaGlobal"></div>

<div style="width:400px;height:200px"><canvas id="graficoMesTipo" width="400" height="200"></canvas></div>
<div style="width:400px;height:200px"><canvas id="graficoPrioridad" width="400" height="200"></canvas></div>
<div style="width:400px;height:200px"><canvas id="graficoTasa" width="400" height="200"></canvas></div>
<div style="width:400px;height:200px"><canvas id="graficoTiempo" width="400" height="200"></canvas></div>
`;

// ── Sample data ─────────────────────────────────────────────────

const sampleStates = [
  { id: 1, code: 'NUEVA', name: 'NUEVA', is_initial_state: true, is_final_state: false },
  { id: 2, code: 'EN_REVISION', name: 'EN_REVISION', is_initial_state: false, is_final_state: false },
  { id: 3, code: 'EN_PROGRESO', name: 'EN_PROGRESO', is_initial_state: false, is_final_state: false },
  { id: 4, code: 'RESUELTA', name: 'RESUELTA', is_initial_state: false, is_final_state: false },
  { id: 5, code: 'CERRADA', name: 'CERRADA', is_initial_state: false, is_final_state: true },
  { id: 6, code: 'RECHAZADA', name: 'RECHAZADA', is_initial_state: false, is_final_state: true },
  { id: 7, code: 'REABIERTA', name: 'REABIERTA', is_initial_state: false, is_final_state: false },
];

const sampleCategories = [
  { id: 1, name: 'Infraestructura' },
  { id: 2, name: 'Ruido' },
  { id: 3, name: 'Higiene' },
];

const sampleIncidents = [
  {
    id: 1, code: 'INC-001', title: 'Fuga de agua',
    category: { name: 'Infraestructura' },
    state: { name: 'RESUELTA' },
    priority: { name: 'Crítica' },
    created_at: '2026-01-15T10:00:00Z',
    resolution_date: '2026-01-20T10:00:00Z',
    territorial_unit: { full_path: 'Ecuador / Pichincha / Quito' },
  },
  {
    id: 2, code: 'INC-002', title: 'Bache en calle',
    category: { name: 'Infraestructura' },
    state: { name: 'RESUELTA' },
    priority: { name: 'Alta' },
    created_at: '2026-01-10T10:00:00Z',
    resolution_date: '2026-01-18T10:00:00Z',
    territorial_unit: { full_path: 'Ecuador / Pichincha / Quito' },
  },
  {
    id: 3, code: 'INC-003', title: 'Ruido molesto',
    category: { name: 'Ruido' },
    state: { name: 'NUEVA' },
    priority: { name: 'Media' },
    created_at: '2026-02-01T10:00:00Z',
    territorial_unit: { full_path: 'Ecuador / Guayas / Guayaquil' },
  },
  {
    id: 4, code: 'INC-004', title: 'Basura acumulada',
    category: { name: 'Higiene' },
    state: { name: 'EN_PROGRESO' },
    priority: { name: 'Alta' },
    created_at: '2026-02-05T10:00:00Z',
    territorial_unit: { full_path: 'Ecuador / Guayas / Guayaquil' },
  },
  {
    id: 5, code: 'INC-005', title: 'Alumbrado público',
    category: { name: 'Infraestructura' },
    state: { name: 'CERRADA' },
    priority: { name: 'Baja' },
    created_at: '2026-01-05T10:00:00Z',
    resolution_date: '2026-01-08T10:00:00Z',
    territorial_unit: { full_path: 'Ecuador / Azuay / Cuenca' },
  },
];

const ACTIVE_STATE_CODES = new Set(['NUEVA', 'PENDIENTE', 'EN_PROGRESO', 'ASIGNADA', 'EN_REVISION', 'ABIERTA']);
const RESOLVED_STATE_CODES = new Set(['RESUELTA']);
const CLOSED_STATE_CODES = new Set(['CERRADA', 'RECHAZADA']);

function hasStateCode(incident, stateCodes) {
  return stateCodes.has(normalizeCatalogCode(incident.state?.name));
}

function buildReportAnalytics(incidents, totalUniverse) {
  const resolved = incidents.filter((incident) => hasStateCode(incident, RESOLVED_STATE_CODES)).length;
  const closed = incidents.filter((incident) => hasStateCode(incident, CLOSED_STATE_CODES)).length;
  const total = incidents.length;

  const countsByCategory = incidents.reduce((counts, incident) => {
    const category = incident.category?.name || 'Desconocida';
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});

  const countsByPriority = incidents.reduce((counts, incident) => {
    const priority = incident.priority?.name || 'Media';
    counts[priority] = (counts[priority] || 0) + 1;
    return counts;
  }, {});

  const cityCounts = incidents.reduce((counts, incident) => {
    const city = incident.territorial_unit?.full_path?.split(' / ').pop() || 'Desconocida';
    counts[city] = (counts[city] || 0) + 1;
    return counts;
  }, {});

  const resolutionDaysByCategory = incidents.reduce((groups, incident) => {
    if (!hasStateCode(incident, RESOLVED_STATE_CODES) || !incident.resolution_date) return groups;

    const category = incident.category?.name || 'Desconocida';
    const duration = (new Date(incident.resolution_date) - new Date(incident.created_at)) / 86400000;
    groups[category] = [...(groups[category] || []), duration];
    return groups;
  }, {});

  const categoryAverageResolution = Object.fromEntries(
    Object.entries(resolutionDaysByCategory).map(([category, durations]) => [
      category,
      durations.reduce((sum, duration) => sum + duration, 0) / durations.length,
    ]),
  );

  const monthKeys = [...new Set(incidents.map((incident) => incident.created_at.slice(0, 7)))].sort();
  const monthlyTrend = {
    months: monthKeys,
    registered: monthKeys.map((month) => incidents.filter((incident) => incident.created_at.startsWith(month)).length),
    resolved: monthKeys.map((month) => incidents.filter((incident) => (
      hasStateCode(incident, RESOLVED_STATE_CODES) && incident.resolution_date?.startsWith(month)
    )).length),
    pending: monthKeys.map((month) => incidents.filter((incident) => (
      hasStateCode(incident, ACTIVE_STATE_CODES) && incident.created_at.startsWith(month)
    )).length),
  };

  const summaryRows = Object.keys(countsByCategory).map((category) => {
    const categoryIncidents = incidents.filter((incident) => incident.category?.name === category);
    const pending = categoryIncidents.filter((incident) => hasStateCode(incident, ACTIVE_STATE_CODES)).length;
    const categoryResolved = categoryIncidents.filter((incident) => hasStateCode(incident, RESOLVED_STATE_CODES)).length;

    return {
      category,
      pending,
      resolved: categoryResolved,
      total: categoryIncidents.length,
      resolution_rate: Math.round((categoryResolved / categoryIncidents.length) * 100),
    };
  });

  return {
    total,
    totalUniverse,
    active: incidents.filter((incident) => hasStateCode(incident, ACTIVE_STATE_CODES)).length,
    critical: incidents.filter((incident) => ['Crítica', 'Critica'].includes(incident.priority?.name)).length,
    resolutionRate: total > 0 ? Math.round(((resolved + closed) / total) * 100) : 0,
    averageResolutionDays: total > 0 ? 6.5 : 0,
    overdue: 0,
    resolved,
    closed,
    recentSevenDays: total > 0 ? 1 : 0,
    countsByCategory,
    countsByPriority,
    topCities: Object.entries(cityCounts).map(([city, count]) => ({
      city,
      count,
      pct: Math.round((count / total) * 100),
    })),
    categoryAverageResolution,
    monthlyTrend,
    summaryRows,
  };
}

function mockRequestWith(backend, { states, incidents }) {
  const handler = (url) => {
    const sourceIncidents = incidents ?? sampleIncidents;
    const requestUrl = new URL(String(url), 'http://localhost');

    if (requestUrl.pathname === '/incidents/reports/analytics') {
      const filteredIncidents = sourceIncidents.filter((incident) => {
        const category = requestUrl.searchParams.get('category');
        const state = requestUrl.searchParams.get('state');
        const startDate = requestUrl.searchParams.get('start_date');
        const endDate = requestUrl.searchParams.get('end_date');
        const createdDate = incident.created_at.slice(0, 10);

        return (!category || incident.category?.name === category)
          && (!state || normalizeCatalogCode(incident.state?.name) === normalizeCatalogCode(state))
          && (!startDate || createdDate >= startDate)
          && (!endDate || createdDate <= endDate);
      });

      return Promise.resolve({ data: buildReportAnalytics(filteredIncidents, sourceIncidents.length) });
    }

    if (requestUrl.pathname === '/incidents') {
      const categoryId = Number(requestUrl.searchParams.get('category_id'));
      const category = sampleCategories.find((item) => item.id === categoryId)?.name;
      const stateId = Number(requestUrl.searchParams.get('state_id'));
      const state = (states ?? sampleStates).find((item) => item.id === stateId)?.code;
      const filteredIncidents = sourceIncidents.filter((incident) => {
        return (!category || incident.category?.name === category)
          && (!state || normalizeCatalogCode(incident.state?.name) === normalizeCatalogCode(state));
      });
      const perPage = Number(requestUrl.searchParams.get('per_page')) || 15;
      const page = Number(requestUrl.searchParams.get('page')) || 1;
      const offset = (page - 1) * perPage;

      return Promise.resolve({
        data: filteredIncidents.slice(offset, offset + perPage),
        meta: { last_page: Math.max(Math.ceil(filteredIncidents.length / perPage), 1) },
      });
    }

    if (requestUrl.pathname === '/catalogs/categories') {
      return Promise.resolve({ data: sampleCategories });
    }
    if (requestUrl.pathname === '/catalogs/states') {
      return Promise.resolve({ data: states ?? sampleStates });
    }
    return Promise.resolve({});
  };
  backend.request.mockImplementation(handler);
  backend.requestBackend.mockImplementation(handler);
}

function getKpiValue(label) {
  const card = [...document.querySelectorAll('#kpiCards .reports-kpi-card')]
    .find((item) => item.querySelector('.reports-kpi-label')?.textContent === label);

  return card?.querySelector('.reports-kpi-number')?.textContent;
}

// ── Tests ───────────────────────────────────────────────────────

describe('reports-page integration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    document.body.innerHTML = DOM_FIXTURE;
    vi.clearAllMocks();
    globalThis.Chart.instances = [];
    domContentLoadedListeners = [];

    vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
      if (type === 'DOMContentLoaded') domContentLoadedListeners.push({ listener, options });
      nativeDocumentAddEventListener(type, listener, options);
    });

    const gradient = { addColorStop: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      fillText: vi.fn(),
      createLinearGradient: vi.fn(() => gradient),
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:reports-test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    domContentLoadedListeners.forEach(({ listener, options }) => {
      document.removeEventListener('DOMContentLoaded', listener, options);
    });
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  // ── 1. Module exports ──

  describe('module exports', () => {
    it('exports all expected functions', async () => {
      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      expect(Object.keys(mod).sort()).toEqual([
        'CHART_COLORS',
        'CHART_DEFAULTS',
        'adjustLayoutForRoles',
        'applyCurrentFilters',
        'escapeCsvValue',
        'exportAnalyticsPdf',
        'initReportsPage',
        'resetFilters',
        'uniqueSortedValues',
      ]);
      expect(mod).toMatchObject({
        initReportsPage: expect.any(Function),
        applyCurrentFilters: expect.any(Function),
        resetFilters: expect.any(Function),
        adjustLayoutForRoles: expect.any(Function),
        uniqueSortedValues: expect.any(Function),
        escapeCsvValue: expect.any(Function),
        exportAnalyticsPdf: expect.any(Function),
        CHART_COLORS: expect.any(Object),
        CHART_DEFAULTS: expect.any(Object),
      });
    });
  });

  // ── 2. Page initialisation ──

  describe('page initialisation', () => {
    it('initialises KPI cards, insights, rankings, summary and efficiency', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      expect(getKpiValue('Incidencias')).toBe('5');
      expect(getKpiValue('Activas')).toBe('2');
      expect(getKpiValue('Resolución')).toBe('60%');
      expect(getKpiValue('Tiempo prom.')).toBe('6.5d');

      expect(document.getElementById('reportInsightCards').innerHTML).not.toBe('');
      expect(document.getElementById('reportInsightNarrative').innerHTML).not.toBe('');

      expect(document.getElementById('rankingCiudades').innerHTML).not.toBe('');
      expect(document.getElementById('rankingTipos').innerHTML).not.toBe('');

      expect(document.getElementById('indicadoresEficiencia').innerHTML).not.toBe('');

      const summaryHtml = document.getElementById('tablaResumen').innerHTML;
      expect(summaryHtml).toContain('Infraestructura');
      expect(summaryHtml).toContain('Ruido');
      expect(summaryHtml).toContain('Higiene');
      const infrastructureCells = [...document.querySelectorAll('#tablaResumen tr')][0]
        .querySelectorAll('td');
      expect([...infrastructureCells].map((cell) => cell.textContent.trim())).toEqual(['Infraestructura', '3', '0', '2']);
      expect(summaryHtml).not.toContain('badge-progress');
      expect(summaryHtml).not.toContain('reports-rate-bar');

      const totalHtml = document.getElementById('tablaResumenTotal').innerHTML;
      expect(totalHtml).toContain('TOTAL');

      expect(document.getElementById('alertaGlobal').innerHTML).toContain('5');
    });

    it('renders every backend state with canonical values and readable labels', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      const states = [
        ...sampleStates,
        { id: 8, code: 'PENDIENTE_VALIDACION', name: 'PENDIENTE_VALIDACION' },
      ];
      mockRequestWith(backend, { states, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      const options = [...document.querySelectorAll('#selectEstadoFiltro option')].slice(1);
      const values = options.map((option) => option.value);
      const labelsByValue = Object.fromEntries(options.map((option) => [option.value, option.textContent]));

      expect(options).toHaveLength(states.length);
      expect(values).toEqual(expect.arrayContaining(states.map((item) => item.code)));
      expect(options.every((option) => !option.textContent.includes('_'))).toBe(true);
      expect(labelsByValue).toMatchObject({
        EN_REVISION: 'En revisión',
        EN_PROGRESO: 'En progreso',
        REABIERTA: 'Reabierta',
        PENDIENTE_VALIDACION: 'Pendiente Validacion',
      });
    });

    it('renders empty state when no incidents exist', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend, { states: sampleStates, incidents: [] });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      expect(document.getElementById('kpiCards').innerHTML).toContain('>0<');
      expect(document.getElementById('reportInsightCards').innerHTML).toContain('Sin resultados');
      expect(document.getElementById('tablaResumen').innerHTML).toContain('Sin datos para mostrar');
      expect(document.getElementById('rankingCiudades').innerHTML).toContain('Sin ciudades');
      expect(document.getElementById('rankingTipos').innerHTML).toContain('Sin categorías');
    });

    it('handles fetch error gracefully', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      backend.request.mockRejectedValue(new Error('Network error'));

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      const valUtils = await import('../app/js/shared/validators/validation-utils.js');
      expect(valUtils.handleBackendErrors).toHaveBeenCalled();
    });

    it('initialises via DOMContentLoaded event', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend, { states: sampleStates, incidents: sampleIncidents });

      await import('../app/js/modules/reports/presentation/reports-page.js');
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await vi.waitFor(() => expect(getKpiValue('Incidencias')).toBe('5'));
    });
  });

  // ── 3. Report filtering ──

  describe('filtering', () => {
    it('filters by category', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      document.getElementById('selectTipoFiltro').value = 'Infraestructura';
      await mod.applyCurrentFilters();

      expect(getKpiValue('Incidencias')).toBe('3');
      expect(backend.request).toHaveBeenCalledWith(expect.stringContaining('category=Infraestructura'));
    });

    it('filters by state', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      document.getElementById('selectEstadoFiltro').value = 'RESUELTA';
      await mod.applyCurrentFilters();

      expect(getKpiValue('Incidencias')).toBe('2');
      expect(backend.request).toHaveBeenCalledWith(expect.stringContaining('state=RESUELTA'));
    });

    it('filters canonical EN_PROGRESO as an active state', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      document.getElementById('selectEstadoFiltro').value = 'EN_PROGRESO';
      await mod.applyCurrentFilters();

      expect(getKpiValue('Incidencias')).toBe('1');
      expect(getKpiValue('Activas')).toBe('1');
      expect(backend.request).toHaveBeenCalledWith(expect.stringContaining('state=EN_PROGRESO'));
    });

    it('filters by date range', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      document.getElementById('fFechaInicial').value = '2026-02-01';
      document.getElementById('fFechaFinal').value = '2026-02-28';
      await mod.applyCurrentFilters();

      expect(getKpiValue('Incidencias')).toBe('2');
      expect(backend.request).toHaveBeenCalledWith(expect.stringContaining('start_date=2026-02-01'));
      expect(backend.request).toHaveBeenCalledWith(expect.stringContaining('end_date=2026-02-28'));
    });

    it('rejects invalid date range with validation error', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      document.getElementById('fFechaInicial').value = '2026-03-01';
      document.getElementById('fFechaFinal').value = '2026-02-01';

      const valUtils = await import('../app/js/shared/validators/validation-utils.js');
      await mod.applyCurrentFilters();

      expect(valUtils.setFieldError).toHaveBeenCalled();
    });

    it('resets filters and re-renders with full data', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      document.getElementById('selectTipoFiltro').value = 'Infraestructura';
      await mod.applyCurrentFilters();

      expect(getKpiValue('Incidencias')).toBe('3');

      mod.resetFilters();

      await vi.waitFor(() => expect(getKpiValue('Incidencias')).toBe('5'));
      expect(document.getElementById('selectTipoFiltro').value).toBe('');
    });
  });

  // ── 4. Report export ──

  describe('export', () => {
    it('exports only incidents matching canonical catalog and local date filters', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      const appendChild = vi.spyOn(document.body, 'appendChild');
      const removeChild = vi.spyOn(document.body, 'removeChild');

      document.getElementById('selectTipoFiltro').value = 'Infraestructura';
      document.getElementById('selectEstadoFiltro').value = 'RESUELTA';
      document.getElementById('fFechaInicial').value = '2026-01-12';
      document.getElementById('fFechaFinal').value = '2026-01-31';
      document.getElementById('btnExportExcel').click();

      await vi.waitFor(() => expect(appendChild).toHaveBeenCalled());
      const link = appendChild.mock.calls[0][0];
      expect(link.tagName).toBe('A');
      expect(link.download).toContain('reporte-incidencias');
      expect(link.download).toContain('.csv');

      expect(removeChild).toHaveBeenCalledWith(link);
      const requestUrl = backend.request.mock.calls.map(([url]) => String(url))
        .find((url) => url.startsWith('/incidents?'));
      expect(requestUrl).toContain('category_id=1');
      expect(requestUrl).toContain('state_id=4');
      expect(requestUrl).not.toMatch(/start_date|end_date|state_filter/);
      expect(document.getElementById('selectEstadoFiltro').value).toBe('RESUELTA');

      const csv = await URL.createObjectURL.mock.calls[0][0].text();
      expect(csv).toContain('INC-001');
      expect(csv).not.toContain('INC-002');
      expect(csv).not.toContain('INC-005');
    });

    it('downloads the institutional PDF using the active filters', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend, { states: sampleStates, incidents: sampleIncidents });
      localStorage.setItem('auth_token', 'test-token');
      const pdfBlob = new Blob(['%PDF-test'], { type: 'application/pdf' });
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: vi.fn().mockResolvedValue(pdfBlob) });
      vi.stubGlobal('fetch', fetchMock);

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      document.getElementById('fFechaInicial').value = '2026-07-01';
      document.getElementById('selectTipoFiltro').value = 'Infraestructura';
      await mod.exportAnalyticsPdf();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toContain('/incidents/reports/analytics/pdf?');
      expect(url).toContain('start_date=2026-07-01');
      expect(url).toContain('category=Infraestructura');
      expect(options.headers.Authorization).toBe('Bearer test-token');
      expect(URL.createObjectURL).toHaveBeenCalledWith(pdfBlob);
    });
  });

  // ── 5. Summary statistics ──

  describe('summary statistics', () => {
    it('shows aggregate data in efficiency indicators', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      const effHtml = document.getElementById('indicadoresEficiencia').innerHTML;
      expect(effHtml).toContain('Tasa de resolución');
      expect(effHtml).toContain('60%');
      expect(effHtml).toContain('Tiempo promedio');
      expect(effHtml).toContain('6.5d');
    });

    it('updates after filter change', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      document.getElementById('selectTipoFiltro').value = 'Infraestructura';
      await mod.applyCurrentFilters();

      const summaryHtml = document.getElementById('tablaResumen').innerHTML;
      expect(summaryHtml).toContain('Infraestructura');
      expect(summaryHtml).toContain('>3<');
      expect(summaryHtml).not.toContain('Ruido');
    });
  });

  // ── 6. Chart integration ──

  describe('chart integration', () => {
    it('renders charts when Chart.js is available and data exists', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      expect(globalThis.Chart.instances).toHaveLength(4);
    });

    it('does not create charts when no incident data', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend, { states: sampleStates, incidents: [] });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      expect(globalThis.Chart.instances).toHaveLength(0);
    });

    it('destroys previous charts on re-render', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      const destroySpy = vi.spyOn(globalThis.Chart.instances[0], 'destroy');

      document.getElementById('selectTipoFiltro').value = 'Infraestructura';
      await mod.applyCurrentFilters();

      expect(destroySpy).toHaveBeenCalled();
    });

    it('updates chart data when filter changes', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      const initialCount = globalThis.Chart.instances.length;

      document.getElementById('selectTipoFiltro').value = 'Infraestructura';
      await mod.applyCurrentFilters();

      const newInstances = globalThis.Chart.instances.slice(initialCount);
      expect(newInstances).toHaveLength(4);
      newInstances.forEach((instance) => {
        expect(instance.config).toBeDefined();
        expect(instance.config.data).toBeDefined();
      });
      const monthlyChart = newInstances.find((instance) => instance.config.type === 'bar');
      expect(monthlyChart.config.data.datasets[0].data).toEqual([3]);
    });
  });
});
