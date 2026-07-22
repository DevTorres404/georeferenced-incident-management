import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  globalThis.$ = vi.fn(() => ({
    on: vi.fn().mockReturnThis(), off: vi.fn().mockReturnThis(),
    val: vi.fn(), text: vi.fn(), html: vi.fn(),
    toggle: vi.fn(), addClass: vi.fn().mockReturnThis(), removeClass: vi.fn().mockReturnThis(),
    hasClass: vi.fn(), find: vi.fn().mockReturnThis(), closest: vi.fn().mockReturnThis(),
    data: vi.fn(), prop: vi.fn(), attr: vi.fn(), trigger: vi.fn(),
    show: vi.fn(), hide: vi.fn(), empty: vi.fn(), append: vi.fn(), remove: vi.fn(),
  }));
  globalThis.$.ajax = vi.fn();
  globalThis.$.getJSON = vi.fn();
  globalThis.renderLayout = vi.fn();
});

vi.mock('../app/js/modules/incidents/presentation/incidents-ui.js', () => ({
  hidePageLoading: vi.fn(),
  showPageLoading: vi.fn(),
}));

vi.mock('../app/js/modules/audit/application/audit-log-service.js', () => ({
  listAuditLogs: vi.fn(),
}));

vi.mock('../app/js/shared/sanitizer.js', () => ({
  escapeHtml: (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
}));

function flushMicrotasks() {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

const DOM_FIXTURE = `
  <form id="audit-filter-form">
    <input id="audit-table-filter" />
    <input id="audit-record-filter" />
    <select id="audit-event-filter">
      <option value="">Todos</option>
      <option value="created">Creado</option>
      <option value="updated">Actualizado</option>
      <option value="deleted">Eliminado</option>
      <option value="restored">Restaurado</option>
    </select>
    <select id="audit-per-page">
      <option value="10">10</option>
      <option value="25" selected>25</option>
      <option value="50">50</option>
      <option value="100">100</option>
    </select>
    <button type="submit">Filtrar</button>
    <button type="button" id="audit-clear-filters">Limpiar</button>
  </form>
  <ul id="audit-pagination" class="pagination"></ul>
  <strong id="audit-total">0</strong>
  <strong id="audit-page-summary">1</strong>
  <small id="audit-pagination-info">Sin registros</small>
  <div id="audit-alert" class="d-none"></div>
  <table>
    <tbody id="audit-log-table-body"></tbody>
  </table>
`;

const defaultMeta = { currentPage: 1, perPage: 25, total: 3, lastPage: 1 };

const sampleLogs = [
  {
    id: '1',
    event: 'created',
    auditableType: 'App\\Models\\Incident',
    auditableId: '100',
    oldValues: null,
    newValues: { title: 'Nuevo', status: 'abierto' },
    url: '/incidents/100',
    ipAddress: '192.168.1.1',
    userAgent: 'Chrome',
    tags: null,
    createdAt: '2026-07-10T10:00:00Z',
    user: { id: 1, name: 'Admin User', email: 'admin@example.com' },
  },
  {
    id: '2',
    event: 'updated',
    auditableType: 'App\\Models\\User',
    auditableId: '5',
    oldValues: { name: 'Old Name' },
    newValues: { name: 'New Name' },
    url: '/users/5',
    ipAddress: '10.0.0.1',
    userAgent: 'Firefox',
    tags: null,
    createdAt: '2026-07-11T14:30:00Z',
    user: { id: 2, name: 'Operator', email: 'op@example.com' },
  },
  {
    id: '3',
    event: 'deleted',
    auditableType: 'App\\Models\\Incident',
    auditableId: '200',
    oldValues: { title: 'Old Title', status: 'closed' },
    newValues: null,
    url: '/incidents/200',
    ipAddress: '192.168.1.2',
    userAgent: 'Safari',
    tags: null,
    createdAt: '2026-07-12T09:15:00Z',
    user: { id: 1, name: 'Admin User', email: 'admin@example.com' },
  },
];

async function initPage(logs = sampleLogs, meta = defaultMeta) {
  const service = await import('../app/js/modules/audit/application/audit-log-service.js');
  service.listAuditLogs.mockResolvedValue({ items: logs, meta });
  const mod = await import('../app/js/modules/audit/presentation/audit-logs-page.js');
  await mod.initAuditLogsPage();
  await flushMicrotasks();
  return mod;
}

async function importService() {
  return import('../app/js/modules/audit/application/audit-log-service.js');
}

describe('audit-logs-page integration', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = DOM_FIXTURE;
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // ─── 1. Module exports ───────────────────────────────────────

  describe('module exports', () => {
    it('exports all expected functions and constants', async () => {
      const mod = await import('../app/js/modules/audit/presentation/audit-logs-page.js');
      expect(mod.EVENT_LABELS).toBeTypeOf('object');
      expect(mod.initAuditLogsPage).toBeTypeOf('function');
      expect(mod.loadAuditLogs).toBeTypeOf('function');
      expect(mod.renderAuditLogs).toBeTypeOf('function');
      expect(mod.renderSummary).toBeTypeOf('function');
      expect(mod.renderPagination).toBeTypeOf('function');
      expect(mod.resetFilters).toBeTypeOf('function');
      expect(mod.bindFilters).toBeTypeOf('function');
      expect(mod.readFilters).toBeTypeOf('function');
      expect(mod.parseValues).toBeTypeOf('function');
      expect(mod.formatDiffValue).toBeTypeOf('function');
      expect(mod.buildPageList).toBeTypeOf('function');
      expect(mod.eventBadge).toBeTypeOf('function');
      expect(mod.formatAuditableType).toBeTypeOf('function');
      expect(mod.stringifyValues).toBeTypeOf('function');
      expect(mod.formatDateTime).toBeTypeOf('function');
    });
  });

  // ─── 2. DOMContentLoaded init ────────────────────────────────

  describe('DOMContentLoaded init', () => {
    it('initialises the page when DOMContentLoaded fires', async () => {
      const service = await importService();
      service.listAuditLogs.mockResolvedValue({ items: sampleLogs, meta: defaultMeta });

      await import('../app/js/modules/audit/presentation/audit-logs-page.js');
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushMicrotasks();

      expect(globalThis.renderLayout).toHaveBeenCalledWith('audit-logs');
      expect(service.listAuditLogs).toHaveBeenCalledWith({
        page: 1, perPage: 25, table: '', tableId: '', event: '',
      });
      const tbody = document.getElementById('audit-log-table-body');
      expect(tbody.innerHTML).toContain('Admin User');
    });
  });

  // ─── 3. Audit log list rendering ─────────────────────────────

  describe('audit log list rendering', () => {
    it('renders one row per log entry', async () => {
      await initPage();
      const rows = document.querySelectorAll('#audit-log-table-body > tr');
      expect(rows.length).toBe(3);
    });

    it('renders user name, action, auditable type, IP and timestamp in each row', async () => {
      await initPage();
      const html = document.getElementById('audit-log-table-body').innerHTML;
      expect(html).toContain('Admin User');
      expect(html).toContain('Operator');
      expect(html).toContain('admin@example.com');
      expect(html).toContain('op@example.com');
      expect(html).toContain('Incidencia');
      expect(html.match(/data-label=/g)).toHaveLength(18);
      expect(html).toContain('data-label="Cambios"');
      expect(html).toContain('Usuario');
      expect(html).toContain('192.168.1.1');
      expect(html).toContain('10.0.0.1');
      expect(html).toContain('/incidents/100');
      expect(html).toContain('2026');
    });

    it('renders correct badges for created, updated and deleted events', async () => {
      await initPage();
      const html = document.getElementById('audit-log-table-body').innerHTML;
      expect(html).toContain('badge-success');
      expect(html).toContain('badge-info');
      expect(html).toContain('badge-danger');
      expect(html).toContain('Creado');
      expect(html).toContain('Actualizado');
      expect(html).toContain('Eliminado');
    });

    it('renders empty state when no logs are returned', async () => {
      await initPage([]);
      const tbody = document.getElementById('audit-log-table-body');
      expect(tbody.innerHTML).toContain('No se encontraron logs');
    });

    it('renders changes detail when oldValues or newValues exist', async () => {
      await initPage();
      const html = document.getElementById('audit-log-table-body').innerHTML;
      expect(html).toContain('campo(s) modificados');
      expect(html).toContain('audit-log-details');
      expect(html).toContain('Old Name');
      expect(html).toContain('New Name');
    });

    it('renders "Sin cambios registrados" when no diff exists', async () => {
      const logsWithNoChanges = [
        { ...sampleLogs[0], oldValues: null, newValues: null },
      ];
      await initPage(logsWithNoChanges);
      const html = document.getElementById('audit-log-table-body').innerHTML;
      expect(html).toContain('Sin cambios registrados');
    });

    it('escapes HTML in user-supplied content', async () => {
      const xssLog = [{
        ...sampleLogs[0],
        user: { id: 1, name: '<script>alert("xss")</script>', email: 'xss@test.com' },
      }];
      await initPage(xssLog);
      const html = document.getElementById('audit-log-table-body').innerHTML;
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  // ─── 4. Table filter ─────────────────────────────────────────

  describe('filter by table name', () => {
    it('reloads data with table filter on form submit', async () => {
      await initPage();
      const service = await importService();
      service.listAuditLogs.mockClear();
      service.listAuditLogs.mockResolvedValue({ items: sampleLogs, meta: defaultMeta });

      document.getElementById('audit-table-filter').value = 'Incident';
      document.getElementById('audit-filter-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await flushMicrotasks();

      expect(service.listAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ table: 'Incident' })
      );
    });
  });

  // ─── 5. Record ID filter ─────────────────────────────────────

  describe('filter by record ID', () => {
    it('reloads data with record-id filter on form submit', async () => {
      await initPage();
      const service = await importService();
      service.listAuditLogs.mockClear();
      service.listAuditLogs.mockResolvedValue({ items: sampleLogs, meta: defaultMeta });

      document.getElementById('audit-record-filter').value = '100';
      document.getElementById('audit-filter-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await flushMicrotasks();

      expect(service.listAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ tableId: '100' })
      );
    });
  });

  // ─── 6. Action type filter ───────────────────────────────────

  describe('action type filter', () => {
    it('filters by event type dropdown', async () => {
      await initPage();
      const service = await importService();
      service.listAuditLogs.mockClear();
      service.listAuditLogs.mockResolvedValue({ items: sampleLogs, meta: defaultMeta });

      document.getElementById('audit-event-filter').value = 'created';
      document.getElementById('audit-filter-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await flushMicrotasks();

      expect(service.listAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'created' })
      );
    });

    it('resets page to 1 when a new filter is applied', async () => {
      const service = await importService();
      service.listAuditLogs.mockResolvedValue({
        items: sampleLogs,
        meta: { currentPage: 3, perPage: 25, total: 100, lastPage: 4 },
      });
      const mod = await import('../app/js/modules/audit/presentation/audit-logs-page.js');
      await mod.initAuditLogsPage();
      await flushMicrotasks();

      service.listAuditLogs.mockClear();
      service.listAuditLogs.mockResolvedValue({ items: sampleLogs, meta: defaultMeta });

      document.getElementById('audit-event-filter').value = 'deleted';
      document.getElementById('audit-filter-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await flushMicrotasks();

      expect(service.listAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, event: 'deleted' })
      );
    });

    it('sends combined filters on form submit', async () => {
      await initPage();
      const service = await importService();
      service.listAuditLogs.mockClear();
      service.listAuditLogs.mockResolvedValue({ items: sampleLogs, meta: defaultMeta });

      document.getElementById('audit-table-filter').value = 'Incident';
      document.getElementById('audit-record-filter').value = '100';
      document.getElementById('audit-event-filter').value = 'updated';
      document.getElementById('audit-per-page').value = '50';
      document.getElementById('audit-filter-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await flushMicrotasks();

      expect(service.listAuditLogs).toHaveBeenCalledWith({
        page: 1, perPage: 50,
        table: 'Incident', tableId: '100', event: 'updated',
      });
    });
  });

  // ─── 7. Clear filters ────────────────────────────────────────

  describe('clear filters', () => {
    it('resets all filter fields to their defaults', async () => {
      await initPage();
      document.getElementById('audit-table-filter').value = 'Incident';
      document.getElementById('audit-record-filter').value = '100';
      document.getElementById('audit-event-filter').value = 'created';
      document.getElementById('audit-per-page').value = '50';

      document.getElementById('audit-clear-filters').click();
      await flushMicrotasks();

      expect(document.getElementById('audit-table-filter').value).toBe('');
      expect(document.getElementById('audit-record-filter').value).toBe('');
      expect(document.getElementById('audit-event-filter').value).toBe('');
      expect(document.getElementById('audit-per-page').value).toBe('25');
    });

    it('reloads data with default filters after clear', async () => {
      await initPage();
      const service = await importService();
      service.listAuditLogs.mockClear();
      service.listAuditLogs.mockResolvedValue({ items: sampleLogs, meta: defaultMeta });

      document.getElementById('audit-clear-filters').click();
      await flushMicrotasks();

      expect(service.listAuditLogs).toHaveBeenCalledWith({
        page: 1, perPage: 25, table: '', tableId: '', event: '',
      });
    });
  });

  // ─── 8. Per-page filter ──────────────────────────────────────

  describe('per-page filter', () => {
    it('sends the selected perPage value on form submit', async () => {
      await initPage();
      const service = await importService();
      service.listAuditLogs.mockClear();
      service.listAuditLogs.mockResolvedValue({ items: sampleLogs, meta: defaultMeta });

      document.getElementById('audit-per-page').value = '100';
      document.getElementById('audit-filter-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await flushMicrotasks();

      expect(service.listAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ perPage: 100 })
      );
    });
  });

  // ─── 9. Pagination ───────────────────────────────────────────

  describe('pagination', () => {
    const paginationMeta = { currentPage: 2, perPage: 25, total: 100, lastPage: 4 };

    it('renders pagination buttons with correct page numbers', async () => {
      await initPage(sampleLogs, paginationMeta);
      const pagHtml = document.getElementById('audit-pagination').innerHTML;
      expect(pagHtml).toContain('>1<');
      expect(pagHtml).toContain('>2<');
      expect(pagHtml).toContain('>3<');
      expect(pagHtml).toContain('>4<');
      expect(pagHtml).toContain('Anterior');
      expect(pagHtml).toContain('Siguiente');
    });

    it('marks the current page as active', async () => {
      await initPage(sampleLogs, paginationMeta);
      const pagHtml = document.getElementById('audit-pagination').innerHTML;
      expect(pagHtml).toContain('page-item active');
      expect(pagHtml).toContain('>2<');
    });

    it('navigates to a different page on pagination button click', async () => {
      await initPage(sampleLogs, paginationMeta);
      const service = await importService();
      service.listAuditLogs.mockClear();
      service.listAuditLogs.mockResolvedValue({ items: sampleLogs, meta: paginationMeta });

      const page3Btn = document.querySelector('#audit-pagination [data-page="3"]');
      page3Btn.click();
      await flushMicrotasks();

      expect(service.listAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ page: 3 })
      );
    });

    it('renders the pagination summary from response metadata', async () => {
      await initPage(sampleLogs, paginationMeta);
      expect(document.getElementById('audit-total').textContent).toBe('100');
      expect(document.getElementById('audit-page-summary').textContent).toBe('2 de 4');
      expect(document.getElementById('audit-pagination-info').textContent)
        .toBe('Mostrando 26-50 de 100 registros');
    });

    it('renders ellipsis for large page counts', async () => {
      await initPage(sampleLogs, { currentPage: 10, perPage: 25, total: 1000, lastPage: 40 });
      const pagHtml = document.getElementById('audit-pagination').innerHTML;
      expect(pagHtml).toContain('...');
    });

    it('disables previous button on first page', async () => {
      await initPage(sampleLogs, { currentPage: 1, perPage: 25, total: 100, lastPage: 4 });
      const pagHtml = document.getElementById('audit-pagination').innerHTML;
      expect(pagHtml).toContain('page-item disabled');
      expect(pagHtml).toContain('data-page="0"');
    });

    it('disables next button on last page', async () => {
      await initPage(sampleLogs, { currentPage: 4, perPage: 25, total: 100, lastPage: 4 });
      const pagHtml = document.getElementById('audit-pagination').innerHTML;
      expect(pagHtml).toContain('page-item disabled');
      expect(pagHtml).toContain('data-page="5"');
    });
  });

  // ─── 10. Error handling ──────────────────────────────────────

  describe('error handling', () => {
    it('shows alert with error message on fetch failure', async () => {
      const service = await importService();
      service.listAuditLogs.mockRejectedValue(new Error('Failed to fetch audit logs'));

      const mod = await import('../app/js/modules/audit/presentation/audit-logs-page.js');
      await mod.initAuditLogsPage();
      await flushMicrotasks();

      const alert = document.getElementById('audit-alert');
      expect(alert.classList.contains('d-none')).toBe(false);
      expect(alert.textContent).toContain('Failed to fetch audit logs');
    });

    it('renders empty state on fetch failure', async () => {
      const service = await importService();
      service.listAuditLogs.mockRejectedValue(new Error('Network error'));

      const mod = await import('../app/js/modules/audit/presentation/audit-logs-page.js');
      await mod.initAuditLogsPage();
      await flushMicrotasks();

      const tbody = document.getElementById('audit-log-table-body');
      expect(tbody.innerHTML).toContain('No se encontraron logs');
    });

    it('renders empty pagination and summary defaults on error', async () => {
      const service = await importService();
      service.listAuditLogs.mockRejectedValue(new Error('Network error'));

      const mod = await import('../app/js/modules/audit/presentation/audit-logs-page.js');
      await mod.initAuditLogsPage();
      await flushMicrotasks();

      expect(document.getElementById('audit-total').textContent).toBe('0');
      expect(document.getElementById('audit-page-summary').textContent).toBe('1 de 1');
      expect(document.getElementById('audit-pagination-info').textContent).toBe('Sin registros');
    });

    it('uses generic fallback message when error has no message', async () => {
      const service = await importService();
      service.listAuditLogs.mockRejectedValue(new Error());

      const mod = await import('../app/js/modules/audit/presentation/audit-logs-page.js');
      await mod.initAuditLogsPage();
      await flushMicrotasks();

      const alert = document.getElementById('audit-alert');
      expect(alert.textContent).toContain('No se pudieron cargar los logs');
    });
  });
});
