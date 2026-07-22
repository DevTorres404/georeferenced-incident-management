import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../app/js/presentation/dom-utils.js', () => ({
  $: vi.fn((id) => document.querySelector(id)),
  hide: vi.fn(),
  showErrorAlert: vi.fn(),
}));

vi.mock('../app/js/layout/loader.js', () => ({
  showMainLoader: vi.fn(),
  hideMainLoader: vi.fn(),
}));

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  escapeHtml: (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
  formatCatalogLabel: (v) => v || '-',
  formatShortDate: (v) => (v ? new Date(v).toLocaleDateString('es-EC') : '-'),
  getPriorityBadgeClass: vi.fn(() => 'badge-secondary'),
  getStateBadgeClass: vi.fn(() => 'badge-secondary'),
  getStateHexColor: vi.fn(() => '#000000'),
  getPriorityHexColor: vi.fn(() => '#000000'),
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn(),
}));

vi.mock('../app/js/modules/dashboard/application/dashboard-service.js', () => ({
  getDashboardMetrics: vi.fn(),
}));

vi.mock('../app/js/infrastructure/backend-client.js', () => ({
  request: vi.fn(),
}));

describe('dashboard-page.js — pure functions', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('CHART_COLORS', () => {
    it('defines all expected color keys', async () => {
      const { CHART_COLORS } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
      expect(CHART_COLORS.info).toBe('#0ea5e9');
      expect(CHART_COLORS.success).toBe('#10b981');
      expect(CHART_COLORS.warning).toBe('#f59e0b');
      expect(CHART_COLORS.danger).toBe('#ef4444');
      expect(CHART_COLORS.purple).toBe('#8b5cf6');
      expect(CHART_COLORS.indigo).toBe('#6366f1');
      expect(CHART_COLORS.teal).toBe('#14b8a6');
    });
  });

  describe('priorityColor', () => {
    it('returns danger for CRITICA', async () => {
      const { priorityColor, CHART_COLORS } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
      expect(priorityColor('CRITICA')).toBe(CHART_COLORS.danger);
    });

    it('returns warning for ALTA', async () => {
      const { priorityColor, CHART_COLORS } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
      expect(priorityColor('ALTA')).toBe(CHART_COLORS.warning);
    });

    it('returns info for MEDIA', async () => {
      const { priorityColor, CHART_COLORS } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
      expect(priorityColor('MEDIA')).toBe(CHART_COLORS.info);
    });

    it('returns success for BAJA', async () => {
      const { priorityColor, CHART_COLORS } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
      expect(priorityColor('BAJA')).toBe(CHART_COLORS.success);
    });

    it('returns default gray for unknown', async () => {
      const { priorityColor } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
      expect(priorityColor('unknown')).toBe('#94a3b8');
    });

    it('returns default gray for empty string', async () => {
      const { priorityColor } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
      expect(priorityColor('')).toBe('#94a3b8');
    });

    it('matches partial CRIT without accent', async () => {
      const { priorityColor, CHART_COLORS } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
      expect(priorityColor('CRITICA')).toBe(CHART_COLORS.danger);
    });
  });

  describe('topEntry', () => {
    it('returns first sorted entry from object', async () => {
      const { topEntry } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
      const result = topEntry({ a: 1, b: 2 });
      expect(result).toEqual(['b', 2]);
    });

    it('returns null for empty object', async () => {
      const { topEntry } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
      expect(topEntry({})).toBeNull();
    });

    it('sorts descending by value', async () => {
      const { topEntry } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
      const result = topEntry({ cat1: 5, cat2: 15, cat3: 3 });
      expect(result).toEqual(['cat2', 15]);
    });
  });
});

describe('dashboard-page.js — DOM rendering', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    document.body.innerHTML = `
      <div id="kpiRow"></div>
      <div id="barrasPrioridad"></div>
      <div id="infoStack"></div>
      <h2 id="recentIncidentsTitle"></h2>
      <a id="recentIncidentsLink"><span id="recentIncidentsLinkLabel"></span></a>
      <table><tbody id="tablaUltimasBody"></tbody></table>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('renderPriorityBars', () => {
    it('renders bar HTML for priority counts', async () => {
      const { renderPriorityBars } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
      renderPriorityBars({ CRITICA: 10, ALTA: 20, MEDIA: 15, BAJA: 5 }, 50);
      const container = document.getElementById('barrasPrioridad');
      expect(container.innerHTML).toContain('dash-priority-item');
      expect(container.innerHTML).toContain('CRITICA');
      expect(container.innerHTML).toContain('ALTA');
    });

    it('shows empty message when no priorities', async () => {
      const { renderPriorityBars } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
      renderPriorityBars({}, 0);
      const container = document.getElementById('barrasPrioridad');
      expect(container.innerHTML).toContain('Sin incidencias');
    });
  });

  describe('renderInfoCards', () => {
    it('renders info cards with metrics', async () => {
      const { renderInfoCards } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
      const metrics = {
        topCities: [{ city: 'Quito', count: 50 }],
        countsByCategory: { Robo: 30 },
        averageResolutionDays: 4.5,
      };
      renderInfoCards(metrics);
      const stack = document.getElementById('infoStack');
      expect(stack.innerHTML).toContain('Quito');
      expect(stack.innerHTML).toContain('Robo');
      expect(stack.innerHTML).toContain('4.5');
    });
  });

  describe('renderRecentIncidents', () => {
    it('resolves assignment navigation from permissions instead of a hardcoded role', async () => {
      const { getDashboardIncidentNavigation } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
      const navigation = getDashboardIncidentNavigation({ permissions: ['incidents.assign'] });

      expect(navigation.listHref).toBe('assignment-management.html');
      expect(navigation.incidentHref(12)).toBe('assignment-management.html?incident_id=12');
    });

    it('renders table rows for incidents', async () => {
      const { renderRecentIncidents } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
      const incidents = [{
        id: 1, code: 'INC-001', title: 'Fuga de agua',
        category: { name: 'Daño' }, priority: { name: 'ALTA' },
        state: { name: 'NUEVA' }, created_at: '2025-01-15T10:00:00Z',
      }];
      renderRecentIncidents(incidents);
      const tbody = document.getElementById('tablaUltimasBody');
      expect(tbody.innerHTML).toContain('INC-001');
      expect(tbody.innerHTML).toContain('Fuga de agua');
      expect(tbody.innerHTML).toContain('tr');
    });

    it('shows empty message for empty array', async () => {
      const { renderRecentIncidents } = await import('../app/js/modules/dashboard/presentation/dashboard-page.js');
      renderRecentIncidents([]);
      const tbody = document.getElementById('tablaUltimasBody');
      expect(tbody.innerHTML).toContain('Sin incidencias');
    });
  });
});
