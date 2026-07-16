import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../app/js/modules/dashboard/application/dashboard-service.js', () => ({
  getDashboardMetrics: vi.fn(),
}));

vi.mock('../app/js/presentation/dom-utils.js', () => ({
  $: vi.fn(),
  hide: vi.fn(),
  showErrorAlert: vi.fn(),
}));

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  escapeHtml: (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
  formatCatalogLabel: (v) => v || '-',
  formatShortDate: (v) => (v ? new Date(v).toLocaleDateString('es-EC') : '-'),
  getPriorityBadgeClass: vi.fn(() => 'badge-secondary'),
  getStateBadgeClass: vi.fn(() => 'badge-secondary'),
  getStateHexColor: vi.fn((state) => 'color-' + state),
  getPriorityHexColor: vi.fn((priority) => 'color-' + priority),
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn(),
}));

const FIXTURE = `
  <canvas id="graficoPorTipo"></canvas>
  <canvas id="graficoPorEstado"></canvas>
  <canvas id="graficoTendencia"></canvas>
  <div id="kpiRow"></div>
`;

const sampleMetrics = {
  countsByCategory: { Robo: 50, 'Daño material': 40, Otro: 60 },
  countsByState: { Pendiente: 45, 'En proceso': 30, Resuelta: 75 },
  monthlyTrend: {
    months: ['Ene', 'Feb', 'Mar'],
    series: [
      { name: 'Registradas', data: [50, 60, 40] },
      { name: 'Resueltas', data: [25, 30, 20] },
      { name: 'Pendientes', data: [25, 30, 20] },
    ],
  },
};

describe('dashboard-page — chart functions', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = FIXTURE;

    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({}));

    globalThis.renderLayout = vi.fn();
    globalThis.$ = vi.fn(() => ({
      on: vi.fn().mockReturnThis(), off: vi.fn().mockReturnThis(),
      val: vi.fn(), text: vi.fn(), html: vi.fn(),
      toggle: vi.fn(), addClass: vi.fn().mockReturnThis(), removeClass: vi.fn().mockReturnThis(),
      hasClass: vi.fn(), find: vi.fn().mockReturnThis(), closest: vi.fn().mockReturnThis(),
      data: vi.fn(), prop: vi.fn(), attr: vi.fn(), trigger: vi.fn(),
      show: vi.fn(), hide: vi.fn(), empty: vi.fn(), append: vi.fn(), remove: vi.fn(),
    }));
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete globalThis.Chart;
    delete globalThis.renderLayout;
    delete globalThis.$;
    vi.clearAllMocks();
  });

  it('calls Chart.js three times with correct chart types', async () => {
    const configs = [];
    globalThis.Chart = vi.fn((ctx, config) => {
      configs.push(config);
      return { destroy: vi.fn() };
    });

    const { renderCharts } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
    renderCharts(sampleMetrics);

    expect(globalThis.Chart).toHaveBeenCalledTimes(3);
    expect(configs[0].type).toBe('doughnut');
    expect(configs[1].type).toBe('bar');
    expect(configs[2].type).toBe('line');
  });

  it('skips chart rendering when Chart.js is not available', async () => {
    delete globalThis.Chart;

    const { renderCharts } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
    expect(() => renderCharts(sampleMetrics)).not.toThrow();
  });

  it('skips doughnut chart when countsByCategory is empty', async () => {
    const configs = [];
    globalThis.Chart = vi.fn((ctx, config) => {
      configs.push(config);
      return { destroy: vi.fn() };
    });

    const { renderCharts } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
    renderCharts({ ...sampleMetrics, countsByCategory: {} });

    expect(globalThis.Chart).toHaveBeenCalledTimes(2);
    expect(configs[0].type).toBe('bar');
    expect(configs[1].type).toBe('line');
  });

  it('passes correct chart data from metrics', async () => {
    const configs = [];
    globalThis.Chart = vi.fn((ctx, config) => {
      configs.push(config);
      return { destroy: vi.fn() };
    });

    const { renderCharts } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
    renderCharts(sampleMetrics);

    const [doughnut, bar, line] = configs;

    expect(doughnut.data.labels).toEqual(['Robo', 'Daño material', 'Otro']);
    expect(doughnut.data.datasets[0].data).toEqual([50, 40, 60]);

    expect(bar.data.labels).toEqual(['Pendiente', 'En proceso', 'Resuelta']);
    expect(bar.data.datasets[0].data).toEqual([45, 30, 75]);

    expect(line.data.labels).toEqual(['Ene', 'Feb', 'Mar']);
    expect(line.data.datasets).toHaveLength(3);
    expect(line.data.datasets[0].label).toBe('Registradas');
    expect(line.data.datasets[0].data).toEqual([50, 60, 40]);
    expect(line.data.datasets[1].label).toBe('Resueltas');
    expect(line.data.datasets[1].data).toEqual([25, 30, 20]);
    expect(line.data.datasets[2].label).toBe('Pendientes');
    expect(line.data.datasets[2].data).toEqual([25, 30, 20]);
  });

  it('uses correct color palettes for each chart type', async () => {
    const configs = [];
    globalThis.Chart = vi.fn((ctx, config) => {
      configs.push(config);
      return { destroy: vi.fn() };
    });

    const { renderCharts, CATEGORY_PALETTE, STATE_COLORS, CHART_COLORS } =
      await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
    renderCharts(sampleMetrics);

    const catCount = Object.keys(sampleMetrics.countsByCategory).length;
    expect(configs[0].data.datasets[0].backgroundColor)
      .toEqual(CATEGORY_PALETTE.slice(0, catCount));

    expect(configs[1].data.datasets[0].backgroundColor)
      .toEqual(['color-Pendiente', 'color-En proceso', 'color-Resuelta']);

    expect(configs[2].data.datasets[0].borderColor).toBe('color-Registradas');
    expect(configs[2].data.datasets[1].borderColor).toBe('color-Resueltas');
    expect(configs[2].data.datasets[2].borderColor).toBe('color-Pendientes');
  });

  it('destroys previous chart instances on re-render', async () => {
    const destroySpy = vi.fn();
    globalThis.Chart = vi.fn(() => ({ destroy: destroySpy }));

    const { renderCharts } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');

    renderCharts(sampleMetrics);
    expect(globalThis.Chart).toHaveBeenCalledTimes(3);
    expect(destroySpy).toHaveBeenCalledTimes(0);

    renderCharts(sampleMetrics);
    expect(destroySpy).toHaveBeenCalledTimes(3);
    expect(globalThis.Chart).toHaveBeenCalledTimes(6);
  });
});
