import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
  requestAfter: vi.fn(),
}));

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  escapeHtml: (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
  formatCatalogLabel: (v) => v || '-',
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn(),
}));

vi.mock('../app/js/shared/validators/validation-utils.js', () => ({
  handleBackendErrors: vi.fn(),
  setFieldError: vi.fn(),
  clearFieldError: vi.fn(),
  setupValidationListeners: vi.fn(),
}));

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
  { id: 1, name: 'Nueva', is_initial_state: true, is_final_state: false },
  { id: 2, name: 'En proceso', is_initial_state: false, is_final_state: false },
  { id: 3, name: 'Resuelta', is_initial_state: false, is_final_state: true },
  { id: 4, name: 'Cerrada', is_initial_state: false, is_final_state: false },
];

const sampleIncidents = [
  {
    id: 1, code: 'INC-001', title: 'Fuga de agua',
    category: { name: 'Infraestructura' },
    state: { name: 'Resuelta' },
    priority: { name: 'Crítica' },
    created_at: '2026-01-15T10:00:00Z',
    resolution_date: '2026-01-20T10:00:00Z',
    territorial_unit: { full_path: 'Ecuador / Pichincha / Quito' },
  },
  {
    id: 2, code: 'INC-002', title: 'Bache en calle',
    category: { name: 'Infraestructura' },
    state: { name: 'Resuelta' },
    priority: { name: 'Alta' },
    created_at: '2026-01-10T10:00:00Z',
    resolution_date: '2026-01-18T10:00:00Z',
    territorial_unit: { full_path: 'Ecuador / Pichincha / Quito' },
  },
  {
    id: 3, code: 'INC-003', title: 'Ruido molesto',
    category: { name: 'Ruido' },
    state: { name: 'Nueva' },
    priority: { name: 'Media' },
    created_at: '2026-02-01T10:00:00Z',
    territorial_unit: { full_path: 'Ecuador / Guayas / Guayaquil' },
  },
  {
    id: 4, code: 'INC-004', title: 'Basura acumulada',
    category: { name: 'Higiene' },
    state: { name: 'En proceso' },
    priority: { name: 'Alta' },
    created_at: '2026-02-05T10:00:00Z',
    territorial_unit: { full_path: 'Ecuador / Guayas / Guayaquil' },
  },
  {
    id: 5, code: 'INC-005', title: 'Alumbrado público',
    category: { name: 'Infraestructura' },
    state: { name: 'Cerrada' },
    priority: { name: 'Baja' },
    created_at: '2026-01-05T10:00:00Z',
    resolution_date: '2026-01-08T10:00:00Z',
    territorial_unit: { full_path: 'Ecuador / Azuay / Cuenca' },
  },
];

function mockRequestWith(request, { states, incidents }) {
  request.mockImplementation((url) => {
    if (String(url).startsWith('/incidents')) {
      return Promise.resolve({ data: incidents ?? sampleIncidents, meta: { last_page: 1 } });
    }
    if (String(url) === '/catalogs/states') {
      return Promise.resolve({ data: states ?? sampleStates });
    }
    return Promise.resolve({});
  });
}

// ── Tests ───────────────────────────────────────────────────────

describe('reports-page integration', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = DOM_FIXTURE;
    vi.clearAllMocks();
    globalThis.Chart.instances = [];
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // ── 1. Module exports ──

  describe('module exports', () => {
    it('exports all expected functions', async () => {
      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      expect(mod.initReportsPage).toBeTypeOf('function');
      expect(mod.applyCurrentFilters).toBeTypeOf('function');
      expect(mod.resetFilters).toBeTypeOf('function');
      expect(mod.matchesFilters).toBeTypeOf('function');
      expect(mod.normalizeMonthlyTrend).toBeTypeOf('function');
      expect(mod.uniqueSortedValues).toBeTypeOf('function');
      expect(mod.parseDate).toBeTypeOf('function');
      expect(mod.startOfDay).toBeTypeOf('function');
      expect(mod.endOfDay).toBeTypeOf('function');
      expect(mod.normalizeText).toBeTypeOf('function');
      expect(mod.normalizeState).toBeTypeOf('function');
      expect(mod.equalsNormalized).toBeTypeOf('function');
      expect(mod.includesNormalized).toBeTypeOf('function');
      expect(mod.monthKey).toBeTypeOf('function');
      expect(mod.formatMonthLabel).toBeTypeOf('function');
      expect(mod.daysBetween).toBeTypeOf('function');
      expect(mod.territoryTail).toBeTypeOf('function');
      expect(mod.getTopEntry).toBeTypeOf('function');
      expect(mod.buildRangeLabel).toBeTypeOf('function');
      expect(mod.escapeCsvValue).toBeTypeOf('function');
      expect(mod.CHART_COLORS).toBeTypeOf('object');
      expect(mod.CHART_DEFAULTS).toBeTypeOf('object');
    });
  });

  // ── 2. Page initialisation ──

  describe('page initialisation', () => {
    it('initialises KPI cards, insights, rankings, summary and efficiency', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend.request, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      expect(document.getElementById('kpiCards').innerHTML).toContain('Incidencias');
      expect(document.getElementById('kpiCards').innerHTML).toContain('>5<');
      expect(document.getElementById('kpiCards').innerHTML).toContain('Activas');
      expect(document.getElementById('kpiCards').innerHTML).toContain('>40%<');
      expect(document.getElementById('kpiCards').innerHTML).toContain('>6.5d<');

      expect(document.getElementById('reportInsightCards').innerHTML).not.toBe('');
      expect(document.getElementById('reportInsightNarrative').innerHTML).not.toBe('');

      expect(document.getElementById('rankingCiudades').innerHTML).not.toBe('');
      expect(document.getElementById('rankingTipos').innerHTML).not.toBe('');

      expect(document.getElementById('indicadoresEficiencia').innerHTML).not.toBe('');

      const summaryHtml = document.getElementById('tablaResumen').innerHTML;
      expect(summaryHtml).toContain('Infraestructura');
      expect(summaryHtml).toContain('Ruido');
      expect(summaryHtml).toContain('Higiene');

      const totalHtml = document.getElementById('tablaResumenTotal').innerHTML;
      expect(totalHtml).toContain('TOTAL');

      expect(document.getElementById('alertaGlobal').innerHTML).toContain('5');
    });

    it('renders empty state when no incidents exist', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend.request, { states: sampleStates, incidents: [] });

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
      mockRequestWith(backend.request, { states: sampleStates, incidents: sampleIncidents });

      await import('../app/js/modules/reports/presentation/reports-page.js');
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(document.getElementById('kpiCards').innerHTML).toContain('Incidencias');
    });
  });

  // ── 3. Report filtering ──

  describe('filtering', () => {
    it('filters by category', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend.request, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      document.getElementById('selectTipoFiltro').value = 'Infraestructura';
      mod.applyCurrentFilters();

      const kpiHtml = document.getElementById('kpiCards').innerHTML;
      expect(kpiHtml).toContain('>3<');
    });

    it('filters by state', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend.request, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      document.getElementById('selectEstadoFiltro').value = 'Resuelta';
      mod.applyCurrentFilters();

      const kpiHtml = document.getElementById('kpiCards').innerHTML;
      expect(kpiHtml).toContain('>2<');
    });

    it('filters by date range', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend.request, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      document.getElementById('fFechaInicial').value = '2026-02-01';
      document.getElementById('fFechaFinal').value = '2026-02-28';
      mod.applyCurrentFilters();

      const kpiHtml = document.getElementById('kpiCards').innerHTML;
      expect(kpiHtml).toContain('>2<');
    });

    it('rejects invalid date range with validation error', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend.request, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      document.getElementById('fFechaInicial').value = '2026-03-01';
      document.getElementById('fFechaFinal').value = '2026-02-01';

      const valUtils = await import('../app/js/shared/validators/validation-utils.js');
      mod.applyCurrentFilters();

      expect(valUtils.setFieldError).toHaveBeenCalled();
    });

    it('resets filters and re-renders with full data', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend.request, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      document.getElementById('selectTipoFiltro').value = 'Infraestructura';
      mod.applyCurrentFilters();

      expect(document.getElementById('kpiCards').innerHTML).toContain('>3<');

      mod.resetFilters();

      expect(document.getElementById('kpiCards').innerHTML).toContain('>5<');
    });
  });

  // ── 4. Report export ──

  describe('export', () => {
    it('triggers CSV download with filtered incidents', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend.request, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      const appendChild = vi.spyOn(document.body, 'appendChild');
      const removeChild = vi.spyOn(document.body, 'removeChild');

      document.getElementById('btnExportExcel').click();

      expect(appendChild).toHaveBeenCalled();
      const link = appendChild.mock.calls[0][0];
      expect(link.tagName).toBe('A');
      expect(link.download).toContain('reporte-incidencias');
      expect(link.download).toContain('.csv');

      expect(removeChild).toHaveBeenCalledWith(link);
    });

    it('triggers printable report for PDF export', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend.request, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      document.getElementById('btnExportPDF').click();

      expect(globalThis.print).toHaveBeenCalled();
    });
  });

  // ── 5. Summary statistics ──

  describe('summary statistics', () => {
    it('shows aggregate data in efficiency indicators', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend.request, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      const effHtml = document.getElementById('indicadoresEficiencia').innerHTML;
      expect(effHtml).toContain('Tasa de resolución');
      expect(effHtml).toContain('40%');
      expect(effHtml).toContain('Tiempo promedio');
      expect(effHtml).toContain('6.5d');
    });

    it('updates after filter change', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend.request, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      document.getElementById('selectTipoFiltro').value = 'Infraestructura';
      mod.applyCurrentFilters();

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
      mockRequestWith(backend.request, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      expect(globalThis.Chart.instances.length).toBeGreaterThanOrEqual(1);
    });

    it('does not create charts when no incident data', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend.request, { states: sampleStates, incidents: [] });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      expect(globalThis.Chart.instances).toHaveLength(0);
    });

    it('destroys previous charts on re-render', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend.request, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      const destroySpy = vi.spyOn(globalThis.Chart.instances[0], 'destroy');

      document.getElementById('selectTipoFiltro').value = 'Infraestructura';
      mod.applyCurrentFilters();

      expect(destroySpy).toHaveBeenCalled();
    });

    it('updates chart data when filter changes', async () => {
      const backend = await import('../app/js/infrastructure/backend-client.js');
      mockRequestWith(backend.request, { states: sampleStates, incidents: sampleIncidents });

      const mod = await import('../app/js/modules/reports/presentation/reports-page.js');
      await mod.initReportsPage();

      const initialCount = globalThis.Chart.instances.length;

      document.getElementById('selectTipoFiltro').value = 'Infraestructura';
      mod.applyCurrentFilters();

      const newInstances = globalThis.Chart.instances.slice(initialCount);
      expect(newInstances.length).toBeGreaterThanOrEqual(1);
      newInstances.forEach((instance) => {
        expect(instance.config).toBeDefined();
        expect(instance.config.data).toBeDefined();
      });
    });
  });
});
